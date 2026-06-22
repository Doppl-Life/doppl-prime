import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import type { ModelGatewayResponse, RunEventType } from '@doppl/contracts';
import {
  CURRENT_SCHEMA_VERSION,
  RunEventEnvelope,
  validateEventPayload,
  validCandidateIdeaCrossDomain,
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
import { scrubEventPayload } from '../../../../src/event-store';
import { loadConfig } from '../../../../src/runtime/config/loadConfig';
import type { Heartbeat } from '../../../../src/runtime/heartbeat';
import type {
  GenerationGateway,
  ReproduceSeam,
  ScoreSeam,
  VerifySeam,
} from '../../../../src/runtime/loop/generationLoop';
import { runWorker, type RunWorkerDeps } from '../../../../src/runtime/worker/runWorker';

/**
 * P3.12 in-process single-active-run worker (ARCHITECTURE.md §5 worker/concurrency + §3 run.started + §4
 * sequence). The worker is runGenerationLoop's production caller: single-active-run guard → run.started
 * (configured→running, guard-validated) → drive the loop (terminalizes via P3.11) → §60 side-signal
 * heartbeat. Idempotent by the persisted log. Faked store (real append discipline) + faked gateway/seams.
 */

const VALID_ENV: Record<string, string | undefined> = {
  OPENROUTER_API_KEY: 'or-key',
  OPENAI_API_KEY: 'oai-key',
  DATABASE_URL: 'postgres://localhost/db',
};

const CANDIDATE_CONTENT = {
  title: validCandidateIdeaCrossDomain.title,
  summary: validCandidateIdeaCrossDomain.summary,
  claims: validCandidateIdeaCrossDomain.claims,
  evidenceRefs: validCandidateIdeaCrossDomain.evidenceRefs,
  subtype: validCandidateIdeaCrossDomain.subtype,
  subtypePayload: validCandidateIdeaCrossDomain.subtypePayload,
};

const AppendEnvelope = RunEventEnvelope.omit({ sequence: true, occurredAt: true });

// In-memory EventStore running the REAL append discipline (envelope omit-parse → validateEventPayload →
// scrub). Seedable so a test can pre-populate run.configured / run.started / a terminal.
function makeFakeStore(seed: readonly AppendInput[] = []) {
  const rows: Array<AppendInput & { sequence: number }> = [];
  let seq = 0;
  const appendRaw = (input: AppendInput): AppendResult => {
    const parsed = AppendEnvelope.safeParse(input);
    if (!parsed.success) throw new Error(`fake append: invalid envelope (${input.type})`);
    const validated = validateEventPayload(input.type, input.payload);
    if (!validated.ok) throw new Error(`fake append: payload rejected (${input.type})`);
    const scrubbed = scrubEventPayload(validated.payload, []) as Record<string, unknown>;
    rows.push({ ...input, payload: scrubbed, sequence: seq });
    seq += 1;
    return { id: input.id, runId: input.runId, sequence: seq - 1 };
  };
  for (const s of seed) appendRaw(s);
  const store: EventStore = {
    append: async (input) => appendRaw(input),
    readByRun: async (runId) => rows.filter((r) => r.runId === runId) as unknown as RunEventRow[],
  };
  return {
    store,
    types: () => rows.map((r) => r.type as RunEventType),
    rows,
  };
}

function configuredEvent(runId: string): AppendInput {
  return {
    id: `${runId}-configured`,
    runId,
    type: 'run.configured',
    actor: 'operator',
    payload: {},
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
}
function startedEvent(runId: string): AppendInput {
  return {
    id: `${runId}-started-seed`,
    runId,
    type: 'run.started',
    actor: 'runtime',
    payload: { from: 'configured', to: 'running' },
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
}
function completedEvent(runId: string): AppendInput {
  return {
    id: `${runId}-completed-seed`,
    runId,
    type: 'run.completed',
    actor: 'runtime',
    payload: { from: 'running', to: 'completed' },
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
}

const fakeGateway: GenerationGateway = {
  generate: async () => {
    const response: ModelGatewayResponse = {
      accepted: true,
      validationResult: 'accepted',
      output: CANDIDATE_CONTENT,
      providerMeta: validProviderMeta,
    };
    return { response };
  },
};
const verify: VerifySeam = async () => {};
const score: ScoreSeam = async (candidates, ctx) => {
  for (const c of candidates) {
    await ctx.append({
      id: `${c.id}-novelty`,
      runId: ctx.runId,
      generationId: ctx.generationId,
      candidateId: c.id,
      type: 'novelty.scored',
      actor: 'selection_controller',
      payload: validNoveltyScore as unknown as Record<string, unknown>,
      schemaVersion: CURRENT_SCHEMA_VERSION,
    });
    await ctx.append({
      id: `${c.id}-fitness`,
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
const reproduce: ReproduceSeam = async (ctx) => {
  ctx.outcomes.int('mutation_point', 0, 8);
  await ctx.append({
    id: `${ctx.generationId}-reproduced`,
    runId: ctx.runId,
    generationId: ctx.generationId,
    type: 'agenome.reproduced',
    actor: 'agenome',
    payload: { mode: ctx.mode },
    schemaVersion: CURRENT_SCHEMA_VERSION,
  });
};

function makeDeps(
  store: EventStore,
  over: Partial<RunWorkerDeps> & {
    caps?: { maxGenerations?: number; maxPopulation?: number; wallClockTimeoutMs?: number };
  } = {},
): RunWorkerDeps {
  const runId = over.runId ?? 'run_w';
  return {
    runId,
    config:
      over.config ??
      loadConfig({
        env: VALID_ENV,
        fileSources: { caps: over.caps ?? { maxGenerations: 1, maxPopulation: 2 } },
      }),
    eventStore: store,
    gateway: over.gateway ?? fakeGateway,
    seams: over.seams ?? { verify, score, reproduce },
    listRunIds: over.listRunIds ?? (async () => [runId]),
    ...(over.now !== undefined ? { now: over.now } : {}),
    ...(over.operatorStop !== undefined ? { operatorStop: over.operatorStop } : {}),
    ...(over.heartbeat !== undefined ? { heartbeat: over.heartbeat } : {}),
    ...(over.minPopulationSurvival !== undefined
      ? { minPopulationSurvival: over.minPopulationSurvival }
      : {}),
    ...(over.nextPopulation !== undefined ? { nextPopulation: over.nextPopulation } : {}),
  };
}

describe('runWorker (P3.12 — in-process single-active-run worker)', () => {
  // spec(§3 + P3.2) — a configured run gets exactly one run.started (configured→running), BEFORE any
  // generation; guard-validated through canTransitionRun (no forced/illegal transition).
  test('emits_run_started_guard_validated', async () => {
    const fake = makeFakeStore([configuredEvent('run_w')]);
    const result = await runWorker(makeDeps(fake.store));
    expect(result.started).toBe(true);
    const started = fake.rows.filter((r) => r.type === 'run.started');
    expect(started).toHaveLength(1);
    expect(started[0]!.payload).toMatchObject({ from: 'configured', to: 'running' });
    // run.started precedes any generation.started (sequence order).
    const startedSeq = started[0]!.sequence;
    const firstGenSeq =
      fake.rows.find((r) => r.type === 'generation.started')?.sequence ?? Infinity;
    expect(startedSeq).toBeLessThan(firstGenSeq);
  });

  // spec(§5 + §3) — a run already running or terminal is NOT re-started (run-level idempotency): no
  // second run.started, the worker reports it did not start.
  test('does_not_restart_running_or_terminal_run', async () => {
    const running = makeFakeStore([configuredEvent('run_w'), startedEvent('run_w')]);
    const r1 = await runWorker(makeDeps(running.store));
    expect(r1.started).toBe(false);
    expect(running.rows.filter((r) => r.type === 'run.started')).toHaveLength(1); // no second

    const terminal = makeFakeStore([
      configuredEvent('run_t'),
      startedEvent('run_t'),
      completedEvent('run_t'),
    ]);
    const r2 = await runWorker(makeDeps(terminal.store, { runId: 'run_t' }));
    expect(r2.started).toBe(false);
    expect(terminal.rows.filter((r) => r.type === 'run.started')).toHaveLength(1);
  });

  // wiring — the worker drives runGenerationLoop end to end: generations run and the loop terminalizes via
  // P3.11 (run.completed reached).
  test('drives_generation_loop', async () => {
    const fake = makeFakeStore([configuredEvent('run_w')]);
    const result = await runWorker(makeDeps(fake.store));
    expect(result.started).toBe(true);
    expect(fake.types()).toContain('generation.started');
    expect(fake.types()).toContain('run.completed'); // P3.11 terminal reached via the loop exit
  });

  // spec(§5) — single-active-run: a SECOND run is rejected while another is non-terminal (derived from the
  // authoritative log via the injected listRunIds), and no run.started is appended for the rejected run.
  test('rejects_second_run_while_one_active', async () => {
    // run_active is configured+started (running); run_new is configured. Both visible to listRunIds.
    const fake = makeFakeStore([
      configuredEvent('run_active'),
      startedEvent('run_active'),
      configuredEvent('run_new'),
    ]);
    const result = await runWorker(
      makeDeps(fake.store, { runId: 'run_new', listRunIds: async () => ['run_active', 'run_new'] }),
    );
    expect(result.started).toBe(false);
    if (!result.started) expect(result.reason).toBe('run_already_active');
    expect(fake.rows.filter((r) => r.runId === 'run_new' && r.type === 'run.started')).toHaveLength(
      0,
    );
  });

  // rule #2 + LESSONS §60 — the worker beats the worker-alive heartbeat to the INJECTED sink: once at
  // pickup + once per generation iteration via the loop's `onIteration` hook. The beat is a SIDE SIGNAL,
  // never a run_event (no heartbeat member in the 41-type registry). Timer-free (intervalMs 0 = every
  // beat() emits; deterministic, no clock-advance needed).
  test('beats_heartbeat_each_iteration_side_signal', async () => {
    const beats: Heartbeat[] = [];
    const fake = makeFakeStore([configuredEvent('run_w')]);
    await runWorker(
      makeDeps(fake.store, {
        heartbeat: { intervalMs: 0, emit: (b) => beats.push(b) },
        caps: { maxGenerations: 1, maxPopulation: 2 },
      }),
    );
    expect(beats.length).toBeGreaterThanOrEqual(2); // pickup beat + ≥1 per-generation onIteration beat
    // the heartbeat is NOT persisted: no appended event is a heartbeat/alive signal (rule #2).
    expect(fake.types().some((t) => /heartbeat|alive|\bbeat\b/i.test(t))).toBe(false);
  });

  // rule #2 / LESSONS §55 — the worker only appends + reads ordered-by-sequence; no update/delete/insert/raw
  // DB write is reachable from the worker source (structural pin).
  test('reads_are_append_only', async () => {
    const src = readFileSync(
      fileURLToPath(new URL('../../../../src/runtime/worker/runWorker.ts', import.meta.url)),
      'utf8',
    );
    expect(src.length).toBeGreaterThan(0);
    expect(/\.update\s*\(/.test(src)).toBe(false);
    expect(/\.delete\s*\(/.test(src)).toBe(false);
    expect(/\.insert\s*\(/.test(src)).toBe(false);
    expect(/run_events/.test(src)).toBe(false);
    // a store exposing ONLY append + readByRun suffices (the worker reaches for nothing else).
    const fake = makeFakeStore([configuredEvent('run_w')]);
    const minimalStore: EventStore = { append: fake.store.append, readByRun: fake.store.readByRun };
    const result = await runWorker(makeDeps(minimalStore));
    expect(result.started).toBe(true);
  });

  // spec(§5/§8) P5.11 — the worker FORWARDS its optional `nextPopulation` dep to the generation loop
  // (additive, mirrors the operatorStop/onIteration conditional-spread forwarding) → the W3b boot root
  // can inject the successor-threading impl. Observed via the fake hook being called by the driven loop.
  test('test_runWorker_forwards_nextPopulation', async () => {
    const fake = makeFakeStore([configuredEvent('run_w')]);
    let calls = 0;
    await runWorker(
      makeDeps(fake.store, {
        nextPopulation: (args) => {
          calls += 1;
          return args.prevPopulation;
        },
      }),
    );
    expect(calls).toBeGreaterThan(0);
  });
});
