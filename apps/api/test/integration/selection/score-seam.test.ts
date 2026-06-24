import { afterAll, beforeAll, describe, expect, inject, test } from 'vitest';
import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  CURRENT_SCHEMA_VERSION,
  CullingEvent,
  FitnessScore,
  NoveltyScore,
  validCandidateIdeaCrossDomain,
  validCriticReview,
  validCheckResult,
  validEnergyEvent,
  validFinalJudgeRubric,
  validJudgeResult,
  validProviderMeta,
} from '@doppl/contracts';
import type {
  CandidateIdea,
  CheckResult,
  CriticReview,
  EnergyEvent,
  JudgeResult,
  ScoringPolicy,
} from '@doppl/contracts';
import { createEventStore, type EventStore } from '../../../src/event-store';
import {
  createGateway,
  ProviderCallError,
  type ModelGateway,
  type ProviderCallFn,
} from '../../../src/model-gateway';
import { createScoreSeam, type CullPolicy, type ScoreSeamDeps } from '../../../src/selection';
import { CRITIC_SCORE_MAX } from '../../../src/selection/components/critic-scores';
import { JUDGE_AXIS_MAX_SCORE } from '../../../src/selection/components/judge-acceptance';
import type { ScoreSeam, SeamContext } from '../../../src/runtime';

// Max acceptance under the test rubric (validFinalJudgeRubric: 5 axes × weight 1) — the scorer divides
// JudgeResult.acceptance by this to normalize the held-out-judge component onto [0,1].
const JUDGE_MAX_ACCEPTANCE = validFinalJudgeRubric.axes.reduce(
  (sum, axis) => sum + JUDGE_AXIS_MAX_SCORE * (validFinalJudgeRubric.weights[axis] ?? 0),
  0,
);

/**
 * P5.6/P5.7 score-seam wiring — integration (testcontainers, real PG). `createScoreSeam(deps)` is
 * selection's real impl of the kernel's injected `ScoreSeam` port (generationLoop.ts:447); it drives
 * one generation's scoring end-to-end over the persisted log: per candidate novelty → read the
 * verifier/energy evidence back via `readByRun` → compose the five fitness components (incl. the
 * held-out-judge `candidateId` join) → fitness → cull-after-all. Appends ONLY through `ctx.append`
 * (rule #2/#4); no `energy.spent` (rule #8). Drives embeddings through a fake `providerCall` injected
 * into the REAL `createGateway` (LESSONS §24) so the genuine structured-output discipline runs; seeds
 * verifier/energy evidence via `store.append` (a fixture log, Step-2.5 Q5). Mirrors run-judge.test.ts.
 *
 * // first production caller: generationLoop.ts:447 seams.score, injected at selection-013 boot root
 */

const GEN = 'gen_1';

const TEST_POLICY: ScoringPolicy = {
  version: 'scoring-seam-v1',
  weights: {
    novelty: 0.25,
    energy_efficiency: 0.15,
    critic_scores: 0.25,
    subtype_check: 0.15,
    judge_acceptance: 0.2,
  },
};

// A policy that culls NOTHING: an enormous spread multiplier pushes the relative threshold to −∞ (no best
// total falls below it), so the score-path tests that aren't about culling never accidentally cull.
const NO_CULL: CullPolicy = { relativeStdDevK: Number.POSITIVE_INFINITY, minSurvivors: 2 };

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

// Per-run id factory — envelope ids are a global PK across the shared container, so namespace by runId.
function idFactory(runId: string): () => string {
  let n = 0;
  return () => `${runId}-ev-${n++}`;
}

function candidate(
  runId: string,
  agenomeId: string,
  candidateId: string,
  summary: string,
): CandidateIdea {
  return {
    ...validCandidateIdeaCrossDomain,
    id: candidateId,
    runId,
    generationId: GEN,
    agenomeId,
    summary,
  };
}

const ZERO_META = {
  provider: 'fake',
  modelId: 'fake-embed',
  gatewayRequestId: 'greq_fake',
  tokensIn: 0,
  tokensOut: 0,
};

// A fake embedding provider injected into the REAL createGateway (LESSONS §24): `vectorFor` maps the
// request prompt (the candidate summary) to a vector, or the sentinel 'fail' to terminally reject.
function embeddingGateway(
  vectorFor: (summary: string) => readonly number[] | 'fail',
): ModelGateway {
  const providerCall: ProviderCallFn = (request) => {
    const vec = vectorFor(request.prompt ?? '');
    if (vec === 'fail') {
      return Promise.reject(
        new ProviderCallError([{ attempt: 1, reason: 'embedding_provider_down' }], ZERO_META),
      );
    }
    return Promise.resolve({
      output: { vector: vec, embeddingModelId: 'text-embedding-3-small', dimension: vec.length },
      providerMeta: validProviderMeta,
    });
  };
  return createGateway({
    providerCall,
    capabilityFor: () => ({ structuredOutputs: true, embeddings: true }),
  });
}

function buildDeps(
  runId: string,
  gateway: ModelGateway,
  overrides: Partial<ScoreSeamDeps> = {},
): ScoreSeamDeps {
  return {
    gateway,
    readByRun: store.readByRun,
    policy: TEST_POLICY,
    rubric: validFinalJudgeRubric,
    cullPolicy: NO_CULL,
    newId: idFactory(runId),
    ...overrides,
  };
}

function ctxFor(runId: string): SeamContext {
  return { runId, generationId: GEN, append: store.append };
}

let seedCounter = 0;
async function seed(
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

function fitnessOf(
  rows: { type: string; candidateId: string | null; payload: unknown }[],
  candidateId: string,
): FitnessScore {
  const row = rows.find((r) => r.type === 'fitness.scored' && r.candidateId === candidateId);
  return FitnessScore.parse(row?.payload);
}

function noveltyOf(
  rows: { type: string; candidateId: string | null; payload: unknown }[],
  candidateId: string,
): NoveltyScore {
  const row = rows.find((r) => r.type === 'novelty.scored' && r.candidateId === candidateId);
  return NoveltyScore.parse(row?.payload);
}

describe('createScoreSeam — selection score path over the real persisted log', () => {
  // spec(§8) LESSONS §20/§64 — the factory's return type IS the kernel ScoreSeam port (compile-time
  // conformance via the `const seam: ScoreSeam` assignment); it runs and appends novelty + fitness.
  test('test_conforms_to_ScoreSeam_port', async () => {
    const runId = 'seam-conforms';
    const seam: ScoreSeam = createScoreSeam(
      buildDeps(
        runId,
        embeddingGateway(() => [0.1, 0.2, 0.3]),
      ),
    );
    await seam([candidate(runId, 'agn_1', 'cand_1', 'a summary')], ctxFor(runId));
    const types = (await store.readByRun(runId)).map((r) => r.type);
    expect(types).toContain('novelty.scored');
    expect(types).toContain('fitness.scored');
  });

  // spec(§4/§8/§12) P5.2/P5.6 — the operation-start marker pairs through the real ctx.append: exactly
  // one novelty.scoring_started + one novelty.scored + one fitness.scored per candidate, in that order,
  // in candidate order (proves the §4/§12 marker pairing on its first real-store path, not just unit).
  test('test_emits_novelty_then_fitness_per_candidate', async () => {
    const runId = 'seam-order';
    const vectors: Record<string, number[]> = { s1: [1, 0, 0], s2: [0, 1, 0] };
    const seam = createScoreSeam(
      buildDeps(
        runId,
        embeddingGateway((s) => vectors[s] ?? [0, 0, 1]),
      ),
    );
    await seam(
      [candidate(runId, 'agn_1', 'cand_1', 's1'), candidate(runId, 'agn_2', 'cand_2', 's2')],
      ctxFor(runId),
    );
    const rows = await store.readByRun(runId);
    const scored = rows
      .filter(
        (r) =>
          r.type === 'novelty.scoring_started' ||
          r.type === 'novelty.scored' ||
          r.type === 'fitness.scored',
      )
      .map((r) => [r.type, r.candidateId]);
    expect(scored).toEqual([
      ['novelty.scoring_started', 'cand_1'],
      ['novelty.scored', 'cand_1'],
      ['fitness.scored', 'cand_1'],
      ['novelty.scoring_started', 'cand_2'],
      ['novelty.scored', 'cand_2'],
      ['fitness.scored', 'cand_2'],
    ]);
  });

  // spec(§7/§8) rule #6 + LESSONS §42/§13 — judge acceptance joins by candidateId, read VERBATIM then
  // NORMALIZED to [0,1] (÷ the rubric's max acceptance) for the weighted average; a candidate with no
  // judge.reviewed gets the not-accepted-by-default 0.
  test('test_judge_acceptance_join_by_candidateId', async () => {
    const runId = 'seam-judge-join';
    const judgeForA: JudgeResult = { ...validJudgeResult, candidateId: 'cand_1', acceptance: 0.82 };
    await seed(runId, 'judge.reviewed', 'runtime', judgeForA, { candidateId: 'cand_1' });
    const seam = createScoreSeam(
      buildDeps(
        runId,
        embeddingGateway(() => [0.1, 0.2, 0.3]),
      ),
    );
    await seam(
      [candidate(runId, 'agn_1', 'cand_1', 's1'), candidate(runId, 'agn_2', 'cand_2', 's2')],
      ctxFor(runId),
    );
    const rows = await store.readByRun(runId);
    expect(fitnessOf(rows, 'cand_1').components.judge_acceptance).toBeCloseTo(
      0.82 / JUDGE_MAX_ACCEPTANCE,
      12,
    );
    expect(fitnessOf(rows, 'cand_2').components.judge_acceptance).toBe(0);
  });

  // spec(§8) rule #7 — every component is derived from the PERSISTED evidence (energy.spent /
  // critic.reviewed / check.completed), not live counters, so fitness is replay-reconstructable.
  test('test_components_read_from_persisted_evidence', async () => {
    const runId = 'seam-evidence';
    const energy: EnergyEvent = { ...validEnergyEvent, runId, agenomeId: 'agn_1', actual: 95 };
    const review: CriticReview = { ...validCriticReview, candidateId: 'cand_1' };
    const check: CheckResult = { ...validCheckResult, candidateId: 'cand_1', status: 'passed' };
    await seed(runId, 'energy.spent', 'runtime', energy, { agenomeId: 'agn_1' });
    await seed(runId, 'critic.reviewed', 'critic', review, { candidateId: 'cand_1' });
    await seed(runId, 'check.completed', 'check_runner', check, { candidateId: 'cand_1' });
    const seam = createScoreSeam(
      buildDeps(
        runId,
        embeddingGateway(() => [0.1, 0.2, 0.3]),
      ),
    );
    await seam([candidate(runId, 'agn_1', 'cand_1', 's1')], ctxFor(runId));
    const fit = fitnessOf(await store.readByRun(runId), 'cand_1');
    expect(fit.components.energy_efficiency).toBeCloseTo(1 / 96, 10);
    // critic raw value 3.5 → NORMALIZED 3.5 / CRITIC_SCORE_MAX (5) = 0.7 (no raw magnitude in the average).
    expect(fit.components.critic_scores).toBeCloseTo(3.5 / CRITIC_SCORE_MAX, 10);
    expect(fit.components.subtype_check).toBe(1);
  });

  // spec(§8) — the comparison set for candidate i is the prior-scored candidates (0..i-1); the first
  // candidate has an empty comparison set and scores maximally novel (1).
  test('test_novelty_comparison_set_is_prior_scored_candidates', async () => {
    const runId = 'seam-comparison';
    const vectors: Record<string, number[]> = { s1: [1, 0, 0], s2: [0, 1, 0], s3: [0, 0, 1] };
    const seam = createScoreSeam(
      buildDeps(
        runId,
        embeddingGateway((s) => vectors[s] ?? [1, 1, 1]),
      ),
    );
    await seam(
      [
        candidate(runId, 'agn_1', 'cand_1', 's1'),
        candidate(runId, 'agn_1', 'cand_2', 's2'),
        candidate(runId, 'agn_1', 'cand_3', 's3'),
      ],
      ctxFor(runId),
    );
    const rows = await store.readByRun(runId);
    expect(noveltyOf(rows, 'cand_1').comparisonSet).toEqual([]);
    expect(noveltyOf(rows, 'cand_2').comparisonSet).toEqual(['cand_1']);
    expect(noveltyOf(rows, 'cand_3').comparisonSet).toEqual(['cand_1', 'cand_2']);
    expect(noveltyOf(rows, 'cand_1').score).toBe(1);
  });

  // spec(§8) P5.3 — an embed failure degrades to novelty_scoring_degraded (NOT novelty.scored) and
  // never blocks: fitness is still computed with the novelty component flagged estimated.
  test('test_degrade_path_on_embed_failure', async () => {
    const runId = 'seam-degrade';
    const seam = createScoreSeam(
      buildDeps(
        runId,
        embeddingGateway(() => 'fail'),
      ),
    );
    await seam([candidate(runId, 'agn_1', 'cand_1', 's1')], ctxFor(runId));
    const rows = await store.readByRun(runId);
    const types = rows.map((r) => r.type);
    expect(types).toContain('novelty_scoring_degraded');
    expect(types).not.toContain('novelty.scored');
    expect(types).toContain('fitness.scored');
    // The §4/§12 marker still pairs on the degrade path: exactly one novelty.scoring_started, before it.
    const markerOrder = rows
      .filter((r) => r.type === 'novelty.scoring_started' || r.type === 'novelty_scoring_degraded')
      .map((r) => r.type);
    expect(markerOrder).toEqual(['novelty.scoring_started', 'novelty_scoring_degraded']);
    expect(fitnessOf(rows, 'cand_1').explanation).toContain('estimated');
  });

  // spec(§8) BUG-B — cull runs once AFTER all candidates are scored, RELATIVE to the generation's fitness
  // distribution (best total below mean − k·stddev), clamped by the population floor. A generation of 3
  // eligible agenomes (two strong, one clear weak outlier) culls exactly the outlier with its snapshot; a
  // tight distribution culls nothing.
  test('test_cull_emits_once_after_all_scored', async () => {
    const runId = 'seam-cull';
    // Two strong agenomes (high-confidence critic scores → high total) + one weak (no critic evidence).
    const strongReview = (candidateId: string): CriticReview => ({
      ...validCriticReview,
      candidateId,
      scores: { a: 5, b: 5 },
      confidence: 1,
    });
    await seed(runId, 'critic.reviewed', 'critic', strongReview('cand_s1'), {
      candidateId: 'cand_s1',
    });
    await seed(runId, 'critic.reviewed', 'critic', strongReview('cand_s2'), {
      candidateId: 'cand_s2',
    });
    const cands = [
      candidate(runId, 'agn_s1', 'cand_s1', 's1'),
      candidate(runId, 'agn_s2', 'cand_s2', 's2'),
      candidate(runId, 'agn_weak', 'cand_weak', 's3'),
    ];
    const vectors: Record<string, number[]> = { s1: [1, 0, 0], s2: [0, 1, 0], s3: [0, 0, 1] };
    const gw = embeddingGateway((s) => vectors[s] ?? [1, 1, 1]);
    // relativeStdDevK 0.5 (tighter than default 1) so the clear weak outlier falls below the threshold;
    // minSurvivors 2 keeps the two strong lineages.
    const seam = createScoreSeam(
      buildDeps(runId, gw, { cullPolicy: { relativeStdDevK: 0.5, minSurvivors: 2 } }),
    );
    await seam(cands, ctxFor(runId));
    const rows = await store.readByRun(runId);

    const culledRows = rows.filter((r) => r.type === 'lineage.culled');
    expect(culledRows).toHaveLength(1);
    const culling = CullingEvent.parse(culledRows[0]!.payload);
    expect(culling.targetIds).toEqual(['agn_weak']);
    const weakTotal = fitnessOf(rows, 'cand_weak').total;
    expect(culling.scoreSnapshot['agn_weak']).toBe(weakTotal);
    const lastFitnessSeq = Math.max(
      ...rows.filter((r) => r.type === 'fitness.scored').map((r) => r.sequence),
    );
    expect(culledRows[0]!.sequence).toBeGreaterThan(lastFitnessSeq);

    // A TIGHT distribution (all three similar) → NO lineage.culled.
    const runId2 = 'seam-no-cull';
    await seed(runId2, 'critic.reviewed', 'critic', strongReview('cand_s1'), {
      candidateId: 'cand_s1',
    });
    await seed(runId2, 'critic.reviewed', 'critic', strongReview('cand_s2'), {
      candidateId: 'cand_s2',
    });
    await seed(runId2, 'critic.reviewed', 'critic', strongReview('cand_s3'), {
      candidateId: 'cand_s3',
    });
    const seam2 = createScoreSeam(
      buildDeps(runId2, embeddingGateway((s) => vectors[s] ?? [1, 1, 1]), {
        cullPolicy: { relativeStdDevK: 1, minSurvivors: 2 },
      }),
    );
    await seam2(
      [
        candidate(runId2, 'agn_s1', 'cand_s1', 's1'),
        candidate(runId2, 'agn_s2', 'cand_s2', 's2'),
        candidate(runId2, 'agn_s3', 'cand_s3', 's3'),
      ],
      ctxFor(runId2),
    );
    const rows2 = await store.readByRun(runId2);
    expect(rows2.filter((r) => r.type === 'lineage.culled')).toHaveLength(0);
  });

  // spec(§8) rule #2/#4/#8 — the seam appends ONLY its own selection events through the store and
  // emits NO energy.spent (the markers are no-debit); the pre-seeded energy.spent count is unchanged.
  test('test_appends_only_via_store_no_energy_debit', async () => {
    const runId = 'seam-append-only';
    const energy: EnergyEvent = { ...validEnergyEvent, runId, agenomeId: 'agn_1' };
    await seed(runId, 'energy.spent', 'runtime', energy, { agenomeId: 'agn_1' });
    const before = await store.readByRun(runId);
    const energyBefore = before.filter((r) => r.type === 'energy.spent').length;
    const seam = createScoreSeam(
      buildDeps(
        runId,
        embeddingGateway(() => [0.1, 0.2, 0.3]),
      ),
    );
    await seam([candidate(runId, 'agn_1', 'cand_1', 's1')], ctxFor(runId));
    const after = await store.readByRun(runId);
    expect(after.filter((r) => r.type === 'energy.spent').length).toBe(energyBefore);
    const allowed = new Set([
      'novelty.scoring_started',
      'novelty.scored',
      'novelty_scoring_degraded',
      'fitness.scored',
      'lineage.culled',
    ]);
    const seamAppended = after.slice(before.length).map((r) => r.type);
    for (const t of seamAppended) {
      expect(allowed.has(t)).toBe(true);
    }
  });
});
