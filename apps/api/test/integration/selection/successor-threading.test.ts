import { afterAll, beforeAll, describe, expect, inject, test } from 'vitest';
import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  Agenome,
  CURRENT_SCHEMA_VERSION,
  ReproductionEvent,
  validAgenome,
  validCandidateIdeaCrossDomain,
  validFinalJudgeRubric,
  validProviderMeta,
} from '@doppl/contracts';
import type {
  ModelGatewayRequest,
  ModelGatewayResponse,
  RunCaps,
  ScoringPolicy,
} from '@doppl/contracts';
import { createEventStore, type EventStore } from '../../../src/event-store';
import type { ModelGateway } from '../../../src/model-gateway';
import { loadConfig } from '../../../src/runtime/config/loadConfig';
import {
  runGenerationLoop,
  type GenerationGateway,
} from '../../../src/runtime/loop/generationLoop';
import type { GenerationLoopDeps, NextPopulationArgs } from '../../../src/runtime';
import { createVerifySeam } from '../../../src/verifier/verify-seam';
import { CHECK_RUNNER_REGISTRY } from '../../../src/check-runners/registry';
import {
  applyReproduction,
  createReproduceSeam,
  createScoreSeam,
  createSuccessorThreading,
  type CullPolicy,
  type MutationBounds,
  type SuccessorThreadingDeps,
} from '../../../src/selection';

/**
 * P5.11 successor-threading impl — integration (testcontainers, real PG). `createSuccessorThreading(deps)`
 * is selection's real `nextPopulation` hook impl: it reads a completed generation's agenome.reproduced/
 * fused events from the log, reconstructs each child via `applyReproduction` (rule #7, no gateway/rng),
 * re-homes it to the next generation (status seeded, spawnBudget clamped — rule #1 per-child), and returns
 * them (the kernel clamps SIZE per W3a). The headline test drives `runGenerationLoop` with all THREE real
 * seams + this hook over real PG, proving gen N+1 evolves from gen N's offspring. Mirrors score-seam /
 * reproduce-seam / verify-seam test harnesses.
 *
 * // injected as runGenerationLoop's nextPopulation (via runWorker) at the W3b-2 boot root (selection-015)
 */

const VALID_ENV: Record<string, string | undefined> = {
  OPENROUTER_API_KEY: 'or-key',
  OPENAI_API_KEY: 'oai-key',
  DATABASE_URL: 'postgres://localhost/db',
};

const CAPS: RunCaps = {
  maxPopulation: 2,
  maxGenerations: 2,
  energyBudget: 100000,
  maxSpawnDepth: 4,
  maxToolCalls: 100,
  wallClockTimeoutMs: 600000,
};

let pool: pg.Pool;
let db: NodePgDatabase;
let store: EventStore;

beforeAll(() => {
  pool = new pg.Pool({ connectionString: inject('pgConnectionUri') });
  db = drizzle(pool);
  store = createEventStore({ db, secretValues: [] });
});

afterAll(async () => {
  await pool.end();
});

function parent(runId: string, agenomeId: string, spawnBudget = 2): Agenome {
  return { ...validAgenome, id: agenomeId, runId, generationId: `${runId}-gen0`, spawnBudget };
}

let seedCounter = 0;
async function seedRepro(
  runId: string,
  generationId: string,
  type: 'agenome.reproduced' | 'agenome.fused',
  repro: ReproductionEvent,
): Promise<void> {
  await store.append({
    id: `${runId}-seed-${seedCounter++}`,
    runId,
    generationId,
    type,
    actor: 'agenome',
    payload: repro as unknown as Record<string, unknown>,
    schemaVersion: CURRENT_SCHEMA_VERSION,
  });
}

// A valid mutation_only ReproductionEvent for a single survivor parent.
function mutationEvent(runId: string, parentId: string, childId: string): ReproductionEvent {
  return ReproductionEvent.parse({
    id: `${runId}-re-${childId}`,
    runId,
    parentAgenomeIds: [parentId],
    childAgenomeId: childId,
    mode: 'mutation_only',
    crossoverPoints: [],
    mutationSummary: { 'personaWeights.curiosity': 0.01, spawnBudget: 0 },
  });
}

function buildArgs(
  completedGenerationId: string,
  eligibleParents: readonly Agenome[],
  log: Awaited<ReturnType<EventStore['readByRun']>>,
): NextPopulationArgs {
  return {
    prevPopulation: eligibleParents,
    completedGenerationId,
    eligibleParents,
    log,
    maxPopulation: CAPS.maxPopulation,
  };
}

const THREADING_DEPS: SuccessorThreadingDeps = { caps: CAPS };

describe('createSuccessorThreading — the real nextPopulation hook over real PG', () => {
  // W3a hook contract — the factory's return conforms to GenerationLoopDeps['nextPopulation'] (compile-time
  // assignment) + runs end-to-end (reconstruct → re-home → return).
  test('test_conforms_to_nextPopulation_hook', async () => {
    const runId = 'thread-conforms';
    const p = parent(runId, 'agn_1');
    await seedRepro(
      runId,
      `${runId}-gen0`,
      'agenome.reproduced',
      mutationEvent(runId, 'agn_1', 'child_1'),
    );
    const hook: GenerationLoopDeps['nextPopulation'] = createSuccessorThreading(THREADING_DEPS);
    const children = await hook!(buildArgs(`${runId}-gen0`, [p], await store.readByRun(runId)));
    expect(children.length).toBe(1);
  });

  // spec(§8) rule #7 — each child reconstructs from the persisted ReproductionEvent via applyReproduction
  // (no gateway/rng — SuccessorThreadingDeps carries no gateway), byte-faithful to the raw reconstruction.
  test('test_reconstructs_children_from_reproduction_events', async () => {
    const runId = 'thread-reconstruct';
    const p = parent(runId, 'agn_1');
    const event = mutationEvent(runId, 'agn_1', 'child_1');
    await seedRepro(runId, `${runId}-gen0`, 'agenome.reproduced', event);
    const log = await store.readByRun(runId);
    const persistedEvent = ReproductionEvent.parse(
      log.find((r) => r.type === 'agenome.reproduced')!.payload,
    );
    const expectedRaw = applyReproduction([{ agenome: p }], persistedEvent);
    const children = await createSuccessorThreading(THREADING_DEPS)(
      buildArgs(`${runId}-gen0`, [p], log),
    );
    expect(children).toHaveLength(1);
    const child = children[0]!;
    // reconstruction core is byte-faithful (rule #7); only the re-homed fields differ.
    expect(child.id).toBe(expectedRaw.id);
    expect(child.parentIds).toEqual(expectedRaw.parentIds);
    expect(child.systemPrompt).toBe(expectedRaw.systemPrompt);
    expect(child.personaWeights).toEqual(expectedRaw.personaWeights);
    expect(child.toolPermissions).toEqual(expectedRaw.toolPermissions);
  });

  // spec(§8) re-home + rule-#1 per-child fields — each child is re-homed to the NEXT generation (seeded),
  // schema-valid, parentIds ≤ 2.
  test('test_children_rehomed_to_next_generation_seeded', async () => {
    const runId = 'thread-rehome';
    const p = parent(runId, 'agn_1');
    await seedRepro(
      runId,
      `${runId}-gen0`,
      'agenome.reproduced',
      mutationEvent(runId, 'agn_1', 'child_1'),
    );
    const children = await createSuccessorThreading(THREADING_DEPS)(
      buildArgs(`${runId}-gen0`, [p], await store.readByRun(runId)),
    );
    const child = children[0]!;
    expect(child.generationId).toBe(`${runId}-gen1`); // re-homed to gen N+1
    expect(child.status).toBe('seeded');
    expect(child.parentIds.length).toBeLessThanOrEqual(2);
    expect(Agenome.safeParse(child).success).toBe(true);
  });

  // spec(§5/§8) rule #1 (W3a forward-flag) — a child's spawnBudget is clamped to min(hint, remaining caps);
  // an oversized reconstructed spawnBudget never exceeds maxPopulation.
  test('test_spawnBudget_clamped_to_remaining_caps', async () => {
    const runId = 'thread-spawnclamp';
    const p = parent(runId, 'agn_1', 10); // parent spawnBudget 10; child inherits ~10 (delta 0).
    await seedRepro(
      runId,
      `${runId}-gen0`,
      'agenome.reproduced',
      mutationEvent(runId, 'agn_1', 'child_1'),
    );
    const children = await createSuccessorThreading(THREADING_DEPS)(
      buildArgs(`${runId}-gen0`, [p], await store.readByRun(runId)),
    );
    expect(children[0]!.spawnBudget).toBe(CAPS.maxPopulation); // 10 clamped to maxPopulation (2).
  });

  // spec(§5/§8) — a completed generation with NO reproduced offspring threads an empty population (the
  // loop's < minSurvival path winds the run down; no fabrication).
  test('test_zero_offspring_returns_empty', async () => {
    const runId = 'thread-empty';
    const p = parent(runId, 'agn_1');
    // no agenome.reproduced/fused seeded for this run.
    const children = await createSuccessorThreading(THREADING_DEPS)(
      buildArgs(`${runId}-gen0`, [p], await store.readByRun(runId)),
    );
    expect(children).toEqual([]);
  });

  // spec(§5) Q1 fail-loud — nextGenerationId is DERIVED from completedGenerationId by the loop's
  // `${runId}-gen{N}` scheme; a completedGenerationId that does NOT match that scheme THROWS, never
  // silently mis-homes a child to a garbage generationId (the fail-loud is the safety for that coupling).
  test('test_malformed_completedGenerationId_fails_loud', async () => {
    const runId = 'thread-malformed';
    const p = parent(runId, 'agn_1');
    const hook = createSuccessorThreading(THREADING_DEPS);
    await expect(
      hook(buildArgs('not-a-valid-gen-id', [p], await store.readByRun(runId))),
    ).rejects.toThrow();
  });

  // spec(§8) THE HEADLINE — drive the REAL loop with all 3 real seams (verify + W1 score + W2 reproduce) +
  // this threading hook over real PG: gen-1's population IS gen-0's reconstructed offspring (gen N+1 evolves
  // from gen N). The true verify→score→reproduce→thread path.
  test('test_loop_level_evolution_gen1_from_gen0_offspring', async () => {
    const runId = 'thread-evolution';
    const config = loadConfig({
      env: VALID_ENV,
      fileSources: {
        caps: { maxGenerations: 2, maxPopulation: 2 },
      },
    });

    const populationGateway: GenerationGateway = {
      generate: () =>
        Promise.resolve({
          response: {
            accepted: true,
            validationResult: 'accepted',
            output: {
              title: validCandidateIdeaCrossDomain.title,
              summary: validCandidateIdeaCrossDomain.summary,
              claims: validCandidateIdeaCrossDomain.claims,
              evidenceRefs: validCandidateIdeaCrossDomain.evidenceRefs,
              subtype: validCandidateIdeaCrossDomain.subtype,
              subtypePayload: validCandidateIdeaCrossDomain.subtypePayload,
            },
            providerMeta: validProviderMeta,
          },
        }),
    };

    // One multi-role ModelGateway for all three seams' .call: embedding (score), critic + final_judge
    // (verify), fusion_synthesis (reproduce).
    const seamGateway: ModelGateway = {
      call: (request: ModelGatewayRequest): Promise<ModelGatewayResponse> => {
        let output: unknown;
        if (request.role === 'embedding') {
          output = { vector: [0.1, 0.2, 0.3], embeddingModelId: 'fake-embed', dimension: 3 };
        } else if (request.role === 'final_judge') {
          output = {
            grounding: 4,
            novelty: 3,
            feasibility: 5,
            falsification_survival: 2,
            subtype_check_pass: 4,
          };
        } else if (request.role === 'fusion_synthesis') {
          output = { synthesis: 'a merged child system prompt' };
        } else {
          output = { critique: 'stub critique', confidence: 0.5, scores: { grounding: 4 } };
        }
        return Promise.resolve({
          accepted: true,
          validationResult: 'accepted',
          output,
          providerMeta: validProviderMeta,
        });
      },
      capabilityFor: () => ({ structuredOutputs: true, embeddings: true }),
    };

    let n = 0;
    const newId = () => `${runId}-sid-${n++}`;
    const policy: ScoringPolicy = {
      version: 'scoring-evo-v1',
      weights: {
        novelty: 0.25,
        energy_efficiency: 0.15,
        critic_scores: 0.25,
        subtype_check: 0.15,
        judge_acceptance: 0.2,
      },
    };
    const bounds: MutationBounds = {
      personaWeightDelta: 0.1,
      spawnBudgetDelta: 1,
      toolPermissionAllowlist: ['web_search'],
    };
    const noCull: CullPolicy = { minFitness: -1 }; // nothing culled → all candidates are eligible parents.

    await runGenerationLoop({
      runId,
      config,
      eventStore: store,
      gateway: populationGateway,
      seams: {
        verify: createVerifySeam({
          gateway: seamGateway,
          eventStore: store,
          registry: CHECK_RUNNER_REGISTRY,
          config,
        }),
        score: createScoreSeam({
          gateway: seamGateway,
          readByRun: store.readByRun,
          policy,
          rubric: validFinalJudgeRubric,
          cullPolicy: noCull,
          newId,
        }),
        reproduce: createReproduceSeam({
          gateway: seamGateway,
          maxPopulation: 2,
          bounds,
          seed: 12345,
          newId,
        }),
      },
      nextPopulation: createSuccessorThreading(THREADING_DEPS),
    });

    const rows = await store.readByRun(runId);
    // gen-0's reproduced offspring ids.
    const gen0Offspring = new Set(
      rows
        .filter(
          (r) =>
            (r.type === 'agenome.fused' || r.type === 'agenome.reproduced') &&
            r.generationId === `${runId}-gen0`,
        )
        .map((r) => ReproductionEvent.parse(r.payload).childAgenomeId),
    );
    // gen-1's population (the agenomes that produced gen-1 candidates).
    const gen1Agenomes = new Set(
      rows
        .filter((r) => r.type === 'candidate.created' && r.generationId === `${runId}-gen1`)
        .map((r) => r.agenomeId),
    );
    expect(gen0Offspring.size).toBeGreaterThan(0);
    expect(gen1Agenomes.size).toBeGreaterThan(0);
    // gen N+1 evolves from gen N: gen-1's agenomes ARE gen-0's reconstructed offspring.
    expect(gen1Agenomes).toEqual(gen0Offspring);
  });
});
