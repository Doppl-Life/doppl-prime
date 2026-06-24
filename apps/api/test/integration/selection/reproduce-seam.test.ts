import { afterAll, beforeAll, describe, expect, inject, test } from 'vitest';
import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  Agenome,
  CURRENT_SCHEMA_VERSION,
  ReproductionEvent,
  validAgenome,
  validCandidateIdeaCrossDomain,
  validFitnessScore,
  validNoveltyScore,
  validProviderMeta,
} from '@doppl/contracts';
import type { CandidateIdea, FitnessScore, NoveltyScore } from '@doppl/contracts';
import { createEventStore, type EventStore } from '../../../src/event-store';
import { createGateway, type ModelGateway, type ProviderCallFn } from '../../../src/model-gateway';
import {
  applyReproduction,
  createReproduceSeam,
  type MutationBounds,
  type ReproduceSeamDeps,
} from '../../../src/selection';
import { projectSuccessorParents } from '../../../src/selection/seams/reproduce-seam';
import type { OutcomeSource, ReproduceContext, ReproduceSeam } from '../../../src/runtime';

/**
 * P5.10/P5.11 reproduce-seam wiring — integration (testcontainers, real PG). `createReproduceSeam(deps)`
 * is selection's real impl of the kernel's injected `ReproduceSeam` port (generationLoop.ts:466): it
 * projects each eligible parent's best-candidate heuristic weights (fitness · novelty · energy-efficiency
 * · novelty vector) from the persisted `scoredEvents`, then runs `assembleSuccessor` (caps-clamped
 * allocation — rule #1) which reproduces per slot via `reproduce` (≥2 distinct → two-level fusion through
 * the gateway; 1 → mutation_only; 0 → abort), emitting fusion.started/agenome.fused/agenome.reproduced/
 * reproduction_aborted_insufficient_parents through `ctx.append`. Appends ONLY through ctx.append (rule
 * #2/#4); no energy.spent (rule #8). Drives fusion synthesis through a fake providerCall injected into
 * the REAL createGateway (LESSONS §24). Mirrors score-seam.test.ts / run-judge.test.ts.
 *
 * // first production caller: generationLoop.ts:466 seams.reproduce, injected at selection-013
 */

const GEN = 'gen_1';

const BOUNDS: MutationBounds = {
  personaWeightDelta: 0.1,
  spawnBudgetDelta: 1,
  toolPermissionAllowlist: ['web_search', 'calc'],
};

const NOOP_OUTCOMES: OutcomeSource = {
  float: () => 0,
  int: () => 0,
  pick: (_label, items) => items[0]!,
  outcomes: () => [],
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

function idFactory(runId: string): () => string {
  let n = 0;
  return () => `${runId}-ev-${n++}`;
}

function parent(runId: string, agenomeId: string): Agenome {
  return { ...validAgenome, id: agenomeId, runId, generationId: GEN, status: 'eligible_parent' };
}

let seedCounter = 0;
async function append(
  runId: string,
  type: string,
  actor: string,
  payload: Record<string, unknown>,
  ids: { agenomeId?: string; candidateId?: string },
): Promise<void> {
  await store.append({
    id: `${runId}-seed-${seedCounter++}`,
    runId,
    generationId: GEN,
    ...ids,
    type: type as never,
    actor: actor as never,
    payload,
    schemaVersion: CURRENT_SCHEMA_VERSION,
  });
}

interface Weights {
  total: number;
  novelty: number;
  vector: number[];
  energyEff: number;
}

// Seed one scored candidate for an agenome: candidate.created (→ candidate→agenome join) + fitness.scored
// (→ total + energy_efficiency component) + novelty.scored (→ score + vector), all through the real store.
async function seedScored(
  runId: string,
  agenomeId: string,
  candidateId: string,
  w: Weights,
): Promise<void> {
  const cand: CandidateIdea = {
    ...validCandidateIdeaCrossDomain,
    id: candidateId,
    runId,
    generationId: GEN,
    agenomeId,
  };
  await append(runId, 'candidate.created', 'runtime', cand, { agenomeId, candidateId });
  const fit: FitnessScore = {
    ...validFitnessScore,
    id: `${candidateId}-fit`,
    candidateId,
    total: w.total,
    // Mirror production: the scorer folds the CONSUMED novelty into `components.novelty` (the value the
    // reproduction projection reads); keep the seeded component in sync with the seeded novelty.scored.
    components: {
      ...validFitnessScore.components,
      novelty: w.novelty,
      energy_efficiency: w.energyEff,
    },
  };
  await append(runId, 'fitness.scored', 'selection_controller', fit, { candidateId });
  const nov: NoveltyScore = {
    ...validNoveltyScore,
    id: `${candidateId}-nov`,
    candidateId,
    vector: w.vector,
    dimension: w.vector.length,
    score: w.novelty,
  };
  await append(runId, 'novelty.scored', 'selection_controller', nov, { candidateId });
}

// Seed one scored candidate whose NOVELTY DEGRADED: candidate.created + fitness.scored (with a NON-ZERO
// `components.novelty` — the degraded lexical estimate the scorer still folds into fitness) + a
// `novelty_scoring_degraded` marker, but NO `novelty.scored` event. This is the live-run shape when the
// embedding provider fails (only novelty degrades; generation/critic/judge/fitness all succeed) — the
// reproduction allocator must still see a non-zero novelty (read from the fitness component) so the
// lineage reproduces instead of the run going extinct after gen 0 (the demo-blocker).
async function seedScoredDegraded(
  runId: string,
  agenomeId: string,
  candidateId: string,
  w: { total: number; noveltyComponent: number; energyEff: number },
): Promise<void> {
  const cand: CandidateIdea = {
    ...validCandidateIdeaCrossDomain,
    id: candidateId,
    runId,
    generationId: GEN,
    agenomeId,
  };
  await append(runId, 'candidate.created', 'runtime', cand, { agenomeId, candidateId });
  const fit: FitnessScore = {
    ...validFitnessScore,
    id: `${candidateId}-fit`,
    candidateId,
    total: w.total,
    components: {
      ...validFitnessScore.components,
      novelty: w.noveltyComponent,
      energy_efficiency: w.energyEff,
    },
  };
  await append(runId, 'fitness.scored', 'selection_controller', fit, { candidateId });
  await append(
    runId,
    'novelty_scoring_degraded',
    'selection_controller',
    {
      candidateId,
      reason: 'embedding_response_rejected',
      method: 'lexical_jaccard',
      estimatedScore: w.noveltyComponent,
    },
    { candidateId },
  );
}

// A fake fusion-synthesis provider injected into the REAL createGateway (LESSONS §24): returns a valid
// `{synthesis}` (accepted → mode 'fusion') or the 'reject' sentinel (invalid → repair fails → reject →
// degrade to crossover). Throws on any embedding call (reproduce must never embed).
function fusionGateway(synthesis: string | 'reject'): ModelGateway {
  const providerCall: ProviderCallFn = (request) => {
    if (request.role === 'embedding') {
      return Promise.reject(new Error('reproduce-seam must not embed'));
    }
    const output = synthesis === 'reject' ? { wrong: 'no synthesis field' } : { synthesis };
    return Promise.resolve({ output, providerMeta: validProviderMeta });
  };
  return createGateway({
    providerCall,
    capabilityFor: () => ({ structuredOutputs: true, embeddings: true }),
  });
}

// A gateway that fails if called at all — pins "mutation_only makes NO gateway call".
function neverGateway(): ModelGateway {
  const providerCall: ProviderCallFn = () =>
    Promise.reject(new Error('gateway must not be called on the mutation_only path'));
  return createGateway({
    providerCall,
    capabilityFor: () => ({ structuredOutputs: true, embeddings: true }),
  });
}

function buildDeps(
  runId: string,
  gateway: ModelGateway,
  overrides: Partial<ReproduceSeamDeps> = {},
): ReproduceSeamDeps {
  return {
    gateway,
    maxPopulation: 4,
    bounds: BOUNDS,
    seed: 12345,
    newId: idFactory(runId),
    ...overrides,
  };
}

function reproduceCtx(
  runId: string,
  parents: Agenome[],
  scoredEvents: Awaited<ReturnType<EventStore['readByRun']>>,
  mode: 'mutation_only' | 'fusion',
  spawnBudget = 4, // the kernel-computed offspring budget (rule #1); the seam clamps min(this, maxPopulation).
): ReproduceContext {
  return {
    runId,
    generationId: GEN,
    append: store.append,
    parents,
    outcomes: NOOP_OUTCOMES,
    scoredEvents,
    mode,
    spawnBudget,
  };
}

describe('createReproduceSeam — selection reproduction over the real persisted log', () => {
  // spec(§8) LESSONS §64/§20 — the factory's return type IS the kernel ReproduceSeam port (compile-time
  // conformance via the `const seam: ReproduceSeam` assignment); it runs and appends offspring events.
  test('test_conforms_to_ReproduceSeam_port', async () => {
    const runId = 'repro-conforms';
    await seedScored(runId, 'agn_1', 'cand_1', {
      total: 0.8,
      novelty: 0.7,
      vector: [1, 0, 0],
      energyEff: 0.9,
    });
    await seedScored(runId, 'agn_2', 'cand_2', {
      total: 0.6,
      novelty: 0.5,
      vector: [0, 1, 0],
      energyEff: 0.8,
    });
    const scoredEvents = await store.readByRun(runId);
    const seam: ReproduceSeam = createReproduceSeam(
      buildDeps(runId, fusionGateway('merged child prompt')),
    );
    await seam(
      reproduceCtx(runId, [parent(runId, 'agn_1'), parent(runId, 'agn_2')], scoredEvents, 'fusion'),
    );
    const types = (await store.readByRun(runId)).map((r) => r.type);
    expect(types).toContain('agenome.fused');
  });

  // spec(§8) P5.9 — ≥2 distinct eligible parents → two-level fusion: agenome.fused carries a valid
  // ReproductionEvent with both parentIds, preceded by the fusion.started marker.
  test('test_fusion_path_two_distinct_parents', async () => {
    const runId = 'repro-fusion';
    await seedScored(runId, 'agn_1', 'cand_1', {
      total: 0.8,
      novelty: 0.7,
      vector: [1, 0, 0],
      energyEff: 0.9,
    });
    await seedScored(runId, 'agn_2', 'cand_2', {
      total: 0.6,
      novelty: 0.5,
      vector: [0, 1, 0],
      energyEff: 0.8,
    });
    const scoredEvents = await store.readByRun(runId);
    const seam = createReproduceSeam(
      buildDeps(runId, fusionGateway('merged child prompt'), { maxPopulation: 2 }),
    );
    await seam(
      reproduceCtx(runId, [parent(runId, 'agn_1'), parent(runId, 'agn_2')], scoredEvents, 'fusion'),
    );
    const rows = await store.readByRun(runId);
    const fused = rows.filter((r) => r.type === 'agenome.fused');
    expect(fused.length).toBeGreaterThanOrEqual(1);
    const repro = ReproductionEvent.parse(fused[0]!.payload);
    expect(repro.parentAgenomeIds).toHaveLength(2);
    expect(repro.mode).toBe('fusion');
    const firstFusedSeq = fused[0]!.sequence;
    expect(rows.some((r) => r.type === 'fusion.started' && r.sequence < firstFusedSeq)).toBe(true);
  });

  // spec(§8) P5.10 — exactly 1 eligible parent → mutation_only with a populated mutationSummary; no
  // fusion / gateway call.
  test('test_mutation_only_path_single_parent', async () => {
    const runId = 'repro-mutation';
    await seedScored(runId, 'agn_1', 'cand_1', {
      total: 0.8,
      novelty: 0.7,
      vector: [1, 0, 0],
      energyEff: 0.9,
    });
    const scoredEvents = await store.readByRun(runId);
    const seam = createReproduceSeam(buildDeps(runId, neverGateway(), { maxPopulation: 1 }));
    await seam(reproduceCtx(runId, [parent(runId, 'agn_1')], scoredEvents, 'mutation_only'));
    const rows = await store.readByRun(runId);
    const reproduced = rows.filter((r) => r.type === 'agenome.reproduced');
    expect(reproduced).toHaveLength(1);
    const repro = ReproductionEvent.parse(reproduced[0]!.payload);
    expect(repro.mode).toBe('mutation_only');
    expect(Object.keys(repro.mutationSummary).length).toBeGreaterThan(0);
    expect(rows.some((r) => r.type === 'agenome.fused')).toBe(false);
    expect(rows.some((r) => r.type === 'fusion.started')).toBe(false);
  });

  // spec(§8) LESSONS §68 — the heuristic projects each parent's BEST candidate (highest fitness.total,
  // tie-break LOWEST sequence) for fitness/novelty/energyEfficiency/noveltyVector.
  test('test_successor_parents_projected_from_scoredEvents', async () => {
    const runId = 'repro-projection';
    await seedScored(runId, 'agn_1', 'cand_lo', {
      total: 0.3,
      novelty: 0.4,
      vector: [1, 0, 0],
      energyEff: 0.5,
    });
    await seedScored(runId, 'agn_1', 'cand_hi', {
      total: 0.9,
      novelty: 0.8,
      vector: [0, 1, 0],
      energyEff: 0.95,
    });
    const projected = projectSuccessorParents(
      [parent(runId, 'agn_1')],
      await store.readByRun(runId),
    );
    expect(projected).toHaveLength(1);
    expect(projected[0]!.fitness).toBe(0.9);
    expect(projected[0]!.novelty).toBe(0.8);
    expect(projected[0]!.energyEfficiency).toBe(0.95);
    expect(projected[0]!.noveltyVector).toEqual([0, 1, 0]);

    // Tie-break: equal totals → the LOWEST-sequence candidate wins (cand_a seeded first).
    const tieRun = 'repro-projection-tie';
    await seedScored(tieRun, 'agn_1', 'cand_a', {
      total: 0.5,
      novelty: 0.1,
      vector: [1, 0, 0],
      energyEff: 0.2,
    });
    await seedScored(tieRun, 'agn_1', 'cand_b', {
      total: 0.5,
      novelty: 0.9,
      vector: [0, 0, 1],
      energyEff: 0.8,
    });
    const tie = projectSuccessorParents([parent(tieRun, 'agn_1')], await store.readByRun(tieRun));
    expect(tie[0]!.novelty).toBe(0.1);
    expect(tie[0]!.noveltyVector).toEqual([1, 0, 0]);
  });

  // spec(§8) — DEGRADED-NOVELTY projection: a parent whose novelty came via `novelty_scoring_degraded`
  // (no `novelty.scored` event) but whose `fitness.scored.components.novelty > 0` must project a NON-ZERO
  // `novelty` (read from the fitness component, populated on both happy + degraded paths). Before the fix
  // the projection sourced novelty ONLY from `novelty.scored` → degraded parents got novelty 0, zeroing
  // the allocation weight (fitness × 0 × energyEff) → 0 spawns → silent extinction. The embedding vector
  // is absent on degrade (→ noveltyVector undefined → parentDistance treats as max-distant).
  test('test_degraded_novelty_projects_nonzero_from_fitness_component', async () => {
    const runId = 'repro-degraded-projection';
    await seedScoredDegraded(runId, 'agn_1', 'cand_1', {
      total: 1.72,
      noveltyComponent: 1,
      energyEff: 0.019,
    });
    const projected = projectSuccessorParents(
      [parent(runId, 'agn_1')],
      await store.readByRun(runId),
    );
    expect(projected).toHaveLength(1);
    expect(projected[0]!.fitness).toBe(1.72);
    expect(projected[0]!.novelty).toBe(1); // from components.novelty, NOT 0 (no novelty.scored event)
    expect(projected[0]!.energyEfficiency).toBe(0.019);
    expect(projected[0]!.noveltyVector).toBeUndefined(); // degraded → no embedding vector
  });

  // spec(§8/§3) — DEGRADED-NOVELTY end-to-end (the live demo-blocker): two parents whose novelty degraded
  // (no `novelty.scored`, but `components.novelty > 0`) MUST still reproduce — `agenome.fused` is emitted,
  // never a silent eventless successor. Before the fix both parents projected novelty 0 → allocate
  // returned all-zero spawns → assembleSuccessor emitted NOTHING → gen N+1 empty → run dies after gen 0.
  test('test_degraded_novelty_still_reproduces', async () => {
    const runId = 'repro-degraded-reproduces';
    await seedScoredDegraded(runId, 'agn_1', 'cand_1', {
      total: 2.0,
      noveltyComponent: 1,
      energyEff: 0.019,
    });
    await seedScoredDegraded(runId, 'agn_2', 'cand_2', {
      total: 1.667,
      noveltyComponent: 1,
      energyEff: 0.019,
    });
    const scoredEvents = await store.readByRun(runId);
    const seam = createReproduceSeam(
      buildDeps(runId, fusionGateway('merged child prompt'), { maxPopulation: 4 }),
    );
    await seam(
      reproduceCtx(runId, [parent(runId, 'agn_1'), parent(runId, 'agn_2')], scoredEvents, 'fusion'),
    );
    const rows = await store.readByRun(runId);
    const offspring = rows.filter(
      (r) => r.type === 'agenome.fused' || r.type === 'agenome.reproduced',
    );
    expect(offspring.length).toBeGreaterThan(0);
  });

  // spec(§8) rule #1 — allocation is a hint clamped to maxPopulation; the successor population never
  // exceeds the cap (the kernel is the authoritative enforcer).
  test('test_allocation_clamped_to_maxPopulation', async () => {
    const runId = 'repro-clamp';
    await seedScored(runId, 'agn_1', 'cand_1', {
      total: 0.8,
      novelty: 0.7,
      vector: [1, 0, 0],
      energyEff: 0.9,
    });
    await seedScored(runId, 'agn_2', 'cand_2', {
      total: 0.6,
      novelty: 0.5,
      vector: [0, 1, 0],
      energyEff: 0.8,
    });
    const scoredEvents = await store.readByRun(runId);
    const seam = createReproduceSeam(
      buildDeps(runId, fusionGateway('merged child prompt'), { maxPopulation: 1 }),
    );
    await seam(
      reproduceCtx(runId, [parent(runId, 'agn_1'), parent(runId, 'agn_2')], scoredEvents, 'fusion'),
    );
    const rows = await store.readByRun(runId);
    const children = rows.filter(
      (r) => r.type === 'agenome.fused' || r.type === 'agenome.reproduced',
    );
    expect(children.length).toBeLessThanOrEqual(1);
    expect(children.length).toBeGreaterThanOrEqual(1);
  });

  // spec(§8) rule #7 LESSONS §47/§46 — the persisted child reconstructs byte-equal to the LIVE child
  // THROUGH the real PG store. `agenome.fused`/`agenome.reproduced` persist the ReproductionEvent (the
  // child is reconstructed, not stored — rule #7); so capture the LIVE in-memory event at emit, assert it
  // round-trips byte-equal through the store (scrub + JSONB — the §46 no-silent-corruption guard), and
  // that applyReproduction over the persisted event == applyReproduction over the live event == the live
  // child. applyReproduction takes NO gateway/rng (structural). Pins live==replay at the truth-log boundary
  // the fuse/mutate UNIT tests never cross.
  test('test_children_replay_from_persisted_events', async () => {
    // FUSED child.
    const runId = 'repro-replay';
    const p1 = parent(runId, 'agn_1');
    const p2 = parent(runId, 'agn_2');
    await seedScored(runId, 'agn_1', 'cand_1', {
      total: 0.8,
      novelty: 0.7,
      vector: [1, 0, 0],
      energyEff: 0.9,
    });
    await seedScored(runId, 'agn_2', 'cand_2', {
      total: 0.6,
      novelty: 0.5,
      vector: [0, 1, 0],
      energyEff: 0.8,
    });
    const scoredEvents = await store.readByRun(runId);
    const liveFused: unknown[] = [];
    const captureFused: EventStore['append'] = (input) => {
      if (input.type === 'agenome.fused') liveFused.push(structuredClone(input.payload));
      return store.append(input);
    };
    const seam = createReproduceSeam(
      buildDeps(runId, fusionGateway('merged child prompt'), { maxPopulation: 2 }),
    );
    await seam({
      runId,
      generationId: GEN,
      append: captureFused,
      parents: [p1, p2],
      outcomes: NOOP_OUTCOMES,
      scoredEvents,
      mode: 'fusion',
      spawnBudget: 2,
    });
    const rows = await store.readByRun(runId);

    const fusionParents = [
      { agenome: p1, noveltyVector: [1, 0, 0] },
      { agenome: p2, noveltyVector: [0, 1, 0] },
    ];
    const liveFusedEvt = ReproductionEvent.parse(liveFused[0]);
    const persistedFusedEvt = ReproductionEvent.parse(
      rows.find((r) => r.type === 'agenome.fused')!.payload,
    );
    // The event survives the scrub/JSONB round-trip byte-for-byte (§46 guard).
    expect(persistedFusedEvt).toEqual(liveFusedEvt);
    const liveChild = applyReproduction(fusionParents, liveFusedEvt);
    const replayChild = applyReproduction(fusionParents, persistedFusedEvt);
    // The persisted child reconstructs == the live child; deterministic; right id; schema-valid.
    expect(replayChild).toEqual(liveChild);
    expect(applyReproduction(fusionParents, persistedFusedEvt)).toEqual(replayChild);
    expect(replayChild.id).toBe(persistedFusedEvt.childAgenomeId);
    expect(Agenome.safeParse(replayChild).success).toBe(true);

    // MUTATED child — same round-trip equality on the mutation_only path.
    const mutRun = 'repro-replay-mut';
    const mp = parent(mutRun, 'agn_1');
    await seedScored(mutRun, 'agn_1', 'cand_1', {
      total: 0.8,
      novelty: 0.7,
      vector: [1, 0, 0],
      energyEff: 0.9,
    });
    const liveMut: unknown[] = [];
    const captureMut: EventStore['append'] = (input) => {
      if (input.type === 'agenome.reproduced') liveMut.push(structuredClone(input.payload));
      return store.append(input);
    };
    const mutSeam = createReproduceSeam(buildDeps(mutRun, neverGateway()));
    await mutSeam({
      runId: mutRun,
      generationId: GEN,
      append: captureMut,
      parents: [mp],
      outcomes: NOOP_OUTCOMES,
      scoredEvents: await store.readByRun(mutRun),
      mode: 'mutation_only',
      spawnBudget: 4,
    });
    const mutRows = await store.readByRun(mutRun);
    const mutParents = [{ agenome: mp, noveltyVector: [1, 0, 0] }];
    const liveMutEvt = ReproductionEvent.parse(liveMut[0]);
    const persistedMutEvt = ReproductionEvent.parse(
      mutRows.find((r) => r.type === 'agenome.reproduced')!.payload,
    );
    expect(persistedMutEvt).toEqual(liveMutEvt);
    const liveMutChild = applyReproduction(mutParents, liveMutEvt);
    const replayMutChild = applyReproduction(mutParents, persistedMutEvt);
    expect(replayMutChild).toEqual(liveMutChild);
    expect(replayMutChild.id).toBe(persistedMutEvt.childAgenomeId);
    expect(Agenome.safeParse(replayMutChild).success).toBe(true);
  });

  // spec(§8) rule #2/#4/#8 — the seam appends ONLY its own reproduction events through the store and
  // emits NO energy.spent (reproduction energy is the kernel's debit); pre-seeded energy.spent unchanged.
  test('test_appends_only_via_store_no_energy_debit', async () => {
    const runId = 'repro-append-only';
    await seedScored(runId, 'agn_1', 'cand_1', {
      total: 0.8,
      novelty: 0.7,
      vector: [1, 0, 0],
      energyEff: 0.9,
    });
    await seedScored(runId, 'agn_2', 'cand_2', {
      total: 0.6,
      novelty: 0.5,
      vector: [0, 1, 0],
      energyEff: 0.8,
    });
    await append(runId, 'energy.spent', 'runtime', energyEventPayload(runId), {
      agenomeId: 'agn_1',
    });
    const before = await store.readByRun(runId);
    const energyBefore = before.filter((r) => r.type === 'energy.spent').length;
    const seam = createReproduceSeam(
      buildDeps(runId, fusionGateway('merged child prompt'), { maxPopulation: 2 }),
    );
    await seam(
      reproduceCtx(runId, [parent(runId, 'agn_1'), parent(runId, 'agn_2')], before, 'fusion'),
    );
    const after = await store.readByRun(runId);
    expect(after.filter((r) => r.type === 'energy.spent').length).toBe(energyBefore);
    const allowed = new Set([
      'fusion.started',
      'agenome.fused',
      'agenome.reproduced',
      'reproduction_aborted_insufficient_parents',
    ]);
    const seamAppended = after.slice(before.length).map((r) => r.type);
    for (const t of seamAppended) {
      expect(allowed.has(t)).toBe(true);
    }
  });

  // spec(§8/§14) rule #5 P5.9 — a rejected synthesis output degrades to crossover (never persists an
  // unvalidated synthesis): the child is produced with mode 'crossover'.
  test('test_synthesis_rejection_degrades_to_crossover', async () => {
    const runId = 'repro-degrade';
    await seedScored(runId, 'agn_1', 'cand_1', {
      total: 0.8,
      novelty: 0.7,
      vector: [1, 0, 0],
      energyEff: 0.9,
    });
    await seedScored(runId, 'agn_2', 'cand_2', {
      total: 0.6,
      novelty: 0.5,
      vector: [0, 1, 0],
      energyEff: 0.8,
    });
    const scoredEvents = await store.readByRun(runId);
    const seam = createReproduceSeam(
      buildDeps(runId, fusionGateway('reject'), { maxPopulation: 2 }),
    );
    await seam(
      reproduceCtx(runId, [parent(runId, 'agn_1'), parent(runId, 'agn_2')], scoredEvents, 'fusion'),
    );
    const rows = await store.readByRun(runId);
    const fused = rows.filter((r) => r.type === 'agenome.fused');
    expect(fused.length).toBeGreaterThanOrEqual(1);
    const repro = ReproductionEvent.parse(fused[0]!.payload);
    expect(repro.mode).toBe('crossover');
  });
});

// A valid EnergyEvent payload for the append-only/no-debit seeding (success-only `llm` spend).
function energyEventPayload(runId: string): Record<string, unknown> {
  return {
    id: `${runId}-energy`,
    runId,
    generationId: GEN,
    agenomeId: 'agn_1',
    eventType: 'llm',
    estimate: 100,
    actual: 95,
    unit: 'doppl_energy',
    reason: 'idea_generation_completed',
    providerMeta: validProviderMeta,
  };
}
