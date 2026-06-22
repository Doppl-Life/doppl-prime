import { describe, expect, test } from 'vitest';
import type { ModelGatewayResponse, RunEventType } from '@doppl/contracts';
import {
  CURRENT_SCHEMA_VERSION,
  HIGH_TRAFFIC_PAYLOAD_MAP,
  RunEventEnvelope,
  validateEventPayload,
  validCandidateIdeaCrossDomain,
  validCriticReview,
  validFitnessScore,
  validNoveltyScore,
  validProviderMeta,
} from '@doppl/contracts';
import type {
  AppendInput,
  AppendResult,
  EventStore,
  RunEventRow,
} from '../../../../src/event-store';
import { loadConfig } from '../../../../src/runtime/config/loadConfig';
import {
  runGenerationLoop,
  transitionGenerationOrThrow,
  IllegalGenerationTransitionError,
  type GenerationGateway,
  type GenerationLoopDeps,
  type ReproduceSeam,
  type ScoreSeam,
  type VerifySeam,
} from '../../../../src/runtime/loop/generationLoop';

/**
 * P3.10b generation-loop SKELETON (ARCHITECTURE.md §5/§3/§4/§6, KEY SAFETY RULES #1/#2/#9).
 *
 * The happy-path loop drives ONE generation pending→running→verifying→scoring→reproducing→completed via
 * the P3.2 guards, appends ONLY kernel-owned events (generation.* lifecycle + the 3 operation-start
 * markers + tool_call relay + agenome.spawned + candidate.created) through the P1.3 append path, produces
 * candidates via the gateway, and delegates verify/score/reproduce to INJECTED seam ports whose events it
 * consumes as DATA, never authors (option-b). Bounded by maxGenerations + maxPopulation (P3.4 enforceCap).
 * Faked eventStore (running the real contract validation discipline) + faked gateway + faked seams.
 */

const VALID_ENV: Record<string, string | undefined> = {
  OPENROUTER_API_KEY: 'or-key',
  OPENAI_API_KEY: 'oai-key',
  DATABASE_URL: 'postgres://localhost/db',
};

// The candidate CONTENT the population_generator returns (kernel assigns id/runId/generationId/agenomeId/
// status). Derived from the canonical fixture so candidate.created validates as a real CandidateIdea.
const CANDIDATE_CONTENT = {
  title: validCandidateIdeaCrossDomain.title,
  summary: validCandidateIdeaCrossDomain.summary,
  claims: validCandidateIdeaCrossDomain.claims,
  evidenceRefs: validCandidateIdeaCrossDomain.evidenceRefs,
  subtype: validCandidateIdeaCrossDomain.subtype,
  subtypePayload: validCandidateIdeaCrossDomain.subtypePayload,
};

function loadTestConfig(caps: { maxGenerations?: number; maxPopulation?: number }) {
  return loadConfig({ env: VALID_ENV, fileSources: { caps } });
}

// A faked in-memory EventStore that runs the REAL contract validation discipline (envelope omit-parse +
// validateEventPayload narrowing) — so a malformed candidate.created / critic.reviewed is rejected exactly
// as the real append path (P1.3) would (the real-PG path is already integration-covered). Records every
// append + readByRun call so the tests can assert the loop appends ONLY via this port (rule #2).
const AppendEnvelope = RunEventEnvelope.omit({ sequence: true, occurredAt: true });
function makeFakeEventStore() {
  const rows: Array<AppendInput & { sequence: number }> = [];
  const appendCalls: AppendInput[] = [];
  let readByRunCalls = 0;
  let seq = 0;
  const store: EventStore = {
    append: async (input: AppendInput): Promise<AppendResult> => {
      appendCalls.push(input);
      const parsed = AppendEnvelope.safeParse(input);
      if (!parsed.success) {
        throw new Error(
          `fake append: invalid envelope (${input.type}) — ${parsed.error.issues
            .map((i) => i.path.join('.'))
            .join(',')}`,
        );
      }
      const validated = validateEventPayload(input.type, input.payload);
      if (!validated.ok)
        throw new Error(`fake append: payload rejected (${input.type}) — ${validated.reason}`);
      rows.push({ ...input, payload: validated.payload, sequence: seq });
      seq += 1;
      return { id: input.id, runId: input.runId, sequence: seq - 1 };
    },
    readByRun: async (runId: string): Promise<RunEventRow[]> => {
      readByRunCalls += 1;
      return rows.filter((r) => r.runId === runId) as unknown as RunEventRow[];
    },
  };
  return {
    store,
    types: () => rows.map((r) => r.type as RunEventType),
    appendedTypes: () => appendCalls.map((a) => a.type as RunEventType),
    rows,
    readByRunCalls: () => readByRunCalls,
  };
}

function makeFakeGateway(
  opts: { toolCalls?: readonly { toolName: string }[] } = {},
): GenerationGateway {
  const response: ModelGatewayResponse = {
    accepted: true,
    validationResult: 'accepted',
    output: CANDIDATE_CONTENT,
    providerMeta: validProviderMeta,
  };
  return {
    // toolCalls present only when supplied (exactOptionalPropertyTypes — no present-but-undefined key).
    generate: async () => (opts.toolCalls ? { response, toolCalls: opts.toolCalls } : { response }),
  };
}

// Seam-owned event types the loop must NEVER author (option-b / rule #9).
const SEAM_OWNED: readonly RunEventType[] = [
  'critic.reviewed',
  'check.completed',
  'novelty.scored',
  'fitness.scored',
  'agenome.fused',
  'agenome.mutated',
  'agenome.reproduced',
];

// Appending fake seams — each appends its OWN events via ctx.append (the loop reads them back, never
// authors them). High-traffic seam payloads use the canonical fixtures so the fake append validates them.
const appendingVerify: VerifySeam = async (candidates, ctx) => {
  for (const c of candidates) {
    await ctx.append({
      id: `${ctx.generationId}-critic-${c.id}`,
      runId: ctx.runId,
      generationId: ctx.generationId,
      candidateId: c.id,
      type: 'critic.reviewed',
      actor: 'critic',
      payload: validCriticReview as unknown as Record<string, unknown>,
      schemaVersion: CURRENT_SCHEMA_VERSION,
    });
  }
};
const appendingScore: ScoreSeam = async (candidates, ctx) => {
  for (const c of candidates) {
    await ctx.append({
      id: `${ctx.generationId}-novelty-${c.id}`,
      runId: ctx.runId,
      generationId: ctx.generationId,
      candidateId: c.id,
      type: 'novelty.scored',
      actor: 'selection_controller',
      payload: validNoveltyScore as unknown as Record<string, unknown>,
      schemaVersion: CURRENT_SCHEMA_VERSION,
    });
    await ctx.append({
      id: `${ctx.generationId}-fitness-${c.id}`,
      runId: ctx.runId,
      generationId: ctx.generationId,
      candidateId: c.id,
      type: 'fitness.scored',
      actor: 'selection_controller',
      payload: validFitnessScore as unknown as Record<string, unknown>,
      schemaVersion: CURRENT_SCHEMA_VERSION,
    });
  }
};
// Reproduce seam — draws via the LIVE outcome source (so RNG outcomes are recorded into its payload,
// replay-faithful rule #7) then appends agenome.mutated/reproduced (generic payloads).
const appendingReproduce: ReproduceSeam = async (ctx) => {
  ctx.outcomes.int('mutation_point', 0, 8);
  ctx.outcomes.pick('parent', ctx.parents);
  await ctx.append({
    id: `${ctx.generationId}-mutated`,
    runId: ctx.runId,
    generationId: ctx.generationId,
    type: 'agenome.mutated',
    actor: 'agenome',
    payload: { outcomes: ctx.outcomes.outcomes() },
    schemaVersion: CURRENT_SCHEMA_VERSION,
  });
  await ctx.append({
    id: `${ctx.generationId}-reproduced`,
    runId: ctx.runId,
    generationId: ctx.generationId,
    type: 'agenome.reproduced',
    actor: 'agenome',
    payload: {},
    schemaVersion: CURRENT_SCHEMA_VERSION,
  });
};

const noopVerify: VerifySeam = async () => {};
const noopScore: ScoreSeam = async () => {};
const noopReproduce: ReproduceSeam = async () => {};

function makeDeps(
  over: Partial<GenerationLoopDeps> & {
    caps?: { maxGenerations?: number; maxPopulation?: number };
  } = {},
): GenerationLoopDeps {
  const fake = over.eventStore ? null : makeFakeEventStore();
  return {
    runId: over.runId ?? 'run_loop',
    config: over.config ?? loadTestConfig(over.caps ?? { maxGenerations: 1, maxPopulation: 2 }),
    eventStore: over.eventStore ?? fake!.store,
    gateway: over.gateway ?? makeFakeGateway(),
    seams: over.seams ?? {
      verify: appendingVerify,
      score: appendingScore,
      reproduce: appendingReproduce,
    },
  };
}

describe('runGenerationLoop (P3.10b — happy-path generation-loop skeleton)', () => {
  test('happy_path_drives_full_generation_lifecycle', async () => {
    // spec(§3/§5): one generation emits the kernel lifecycle + markers in order: started → verifying →
    // scoring → reproducing → completed (the operation-start markers appended on phase ENTRY).
    const fake = makeFakeEventStore();
    await runGenerationLoop(
      makeDeps({ eventStore: fake.store, caps: { maxGenerations: 1, maxPopulation: 2 } }),
    );
    const kernelLifecycle = fake.appendedTypes().filter((t) => t.startsWith('generation.'));
    expect(kernelLifecycle).toEqual([
      'generation.started',
      'generation.verifying',
      'generation.scoring',
      'generation.reproducing',
      'generation.completed',
    ]);
  });

  test('candidates_produced_bounded_by_maxPopulation', async () => {
    // spec(§5) rule #1: per agenome ≤ maxPopulation — count == min(seedSet size [4], maxPopulation [2]).
    const fake = makeFakeEventStore();
    await runGenerationLoop(
      makeDeps({ eventStore: fake.store, caps: { maxGenerations: 1, maxPopulation: 2 } }),
    );
    const spawned = fake.appendedTypes().filter((t) => t === 'agenome.spawned');
    const created = fake.appendedTypes().filter((t) => t === 'candidate.created');
    expect(spawned).toHaveLength(2);
    expect(created).toHaveLength(2);
  });

  test('operation_markers_are_generic_no_debit', async () => {
    // spec(§4): the 3 markers are appended on phase entry, NONE is in HIGH_TRAFFIC_PAYLOAD_MAP (generic
    // payload), and NO energy.spent is appended (energy emission is 10d, not this slice).
    const fake = makeFakeEventStore();
    await runGenerationLoop(
      makeDeps({ eventStore: fake.store, caps: { maxGenerations: 1, maxPopulation: 2 } }),
    );
    const markers: RunEventType[] = [
      'generation.verifying',
      'generation.scoring',
      'generation.reproducing',
    ];
    for (const m of markers) {
      expect(fake.appendedTypes()).toContain(m);
      expect(m in HIGH_TRAFFIC_PAYLOAD_MAP).toBe(false);
    }
    expect(fake.appendedTypes()).not.toContain('energy.spent');
  });

  test('tool_call_relay', async () => {
    // spec(§4/§12): a gateway-surfaced tool call is relayed verbatim as tool_call.started + finished
    // (generic payload, no energy debit) — the loop relays, the gateway surfaces.
    const fake = makeFakeEventStore();
    await runGenerationLoop(
      makeDeps({
        eventStore: fake.store,
        gateway: makeFakeGateway({ toolCalls: [{ toolName: 'web_search' }] }),
        caps: { maxGenerations: 1, maxPopulation: 1 },
      }),
    );
    expect(fake.appendedTypes()).toContain('tool_call.started');
    expect(fake.appendedTypes()).toContain('tool_call.finished');
  });

  test('loop_consumes_seam_events_never_authors_them', async () => {
    // spec(§5)/option-b/rule #9: with APPENDING seams the seam events are present; the loop's OWN appends
    // exclude every seam-owned type; and the loop reads the log back (readByRun) to consume them as DATA.
    const fake = makeFakeEventStore();
    await runGenerationLoop(
      makeDeps({ eventStore: fake.store, caps: { maxGenerations: 1, maxPopulation: 1 } }),
    );
    const seamPresent = fake.types().filter((t) => SEAM_OWNED.includes(t));
    expect(seamPresent).toContain('critic.reviewed');
    expect(seamPresent).toContain('fitness.scored');
    expect(seamPresent).toContain('agenome.reproduced');
    expect(fake.readByRunCalls()).toBeGreaterThan(0); // the loop reads seam events back as data

    // with NO-OP seams the loop authors ZERO seam-owned events (it never originates them).
    const fake2 = makeFakeEventStore();
    await runGenerationLoop(
      makeDeps({
        eventStore: fake2.store,
        seams: { verify: noopVerify, score: noopScore, reproduce: noopReproduce },
        caps: { maxGenerations: 1, maxPopulation: 1 },
      }),
    );
    for (const t of fake2.appendedTypes()) {
      expect(SEAM_OWNED).not.toContain(t);
    }
  });

  test('bounded_iteration_runs_exactly_maxGenerations', async () => {
    // spec(§5) rule #1: maxGenerations=N → exactly N generations then return (cap is the loop's bound).
    const fake = makeFakeEventStore();
    const result = await runGenerationLoop(
      makeDeps({ eventStore: fake.store, caps: { maxGenerations: 3, maxPopulation: 1 } }),
    );
    expect(result.generationsRun).toBe(3);
    expect(fake.appendedTypes().filter((t) => t === 'generation.completed')).toHaveLength(3);
  });

  test('illegal_transition_rejected_by_guard', async () => {
    // spec(§3)/rule #2 + P3.2: the loop validates each transition through canTransitionGeneration; a forced
    // out-of-lifecycle transition throws (never a forced append). A legal one returns the target status.
    expect(() => transitionGenerationOrThrow('pending', 'scoring')).toThrow(
      IllegalGenerationTransitionError,
    );
    expect(() => transitionGenerationOrThrow('completed', 'running')).toThrow(
      IllegalGenerationTransitionError,
    );
    expect(transitionGenerationOrThrow('pending', 'running')).toBe('running');
    expect(transitionGenerationOrThrow('verifying', 'scoring')).toBe('scoring');
  });

  test('rng_outcomes_persisted_on_reproduction', async () => {
    // spec(rule #7 / P3.6): the loop constructs the LIVE outcome source and passes it to the reproduce
    // seam, so the drawn RNG outcomes are recorded into the agenome.mutated payload (replay-faithful).
    const fake = makeFakeEventStore();
    await runGenerationLoop(
      makeDeps({ eventStore: fake.store, caps: { maxGenerations: 1, maxPopulation: 2 } }),
    );
    const mutated = fake.rows.find((r) => r.type === 'agenome.mutated');
    expect(mutated).toBeDefined();
    const outcomes = (mutated!.payload as { outcomes?: unknown[] }).outcomes;
    expect(Array.isArray(outcomes)).toBe(true);
    expect((outcomes as unknown[]).length).toBeGreaterThan(0); // the recorded draws (label+value)
  });

  test('appends_only_via_append_path', async () => {
    // spec(rule #2): the loop's only event-production channel is eventStore.append — every kernel event in
    // the log was produced by an append() call (the loop holds no db/table handle; structural by deps shape).
    const fake = makeFakeEventStore();
    await runGenerationLoop(
      makeDeps({ eventStore: fake.store, caps: { maxGenerations: 1, maxPopulation: 2 } }),
    );
    const kernelOwned = fake.appendedTypes().filter((t) => !SEAM_OWNED.includes(t));
    // every kernel-owned event the loop produced is present in the store (no out-of-band write path).
    expect(kernelOwned.length).toBeGreaterThan(0);
    expect(fake.types().filter((t) => !SEAM_OWNED.includes(t))).toEqual(kernelOwned);
  });
});
