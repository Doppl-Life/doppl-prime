import { describe, expect, test } from 'vitest';
import { CURRENT_SCHEMA_VERSION, CullingEvent } from '@doppl/contracts';
import type { AgenomeStatus, RunEventEnvelope } from '@doppl/contracts';
import { cull } from '../../../src/selection/cull';
import type { CullEmitter, CullInput, CullPolicy } from '../../../src/selection/cull';

type Emitted = Omit<RunEventEnvelope, 'sequence' | 'occurredAt'>;

function recorder(): { emit: CullEmitter; events: Emitted[] } {
  const events: Emitted[] = [];
  let seq = 0;
  const emit: CullEmitter = (env) => {
    events.push(env);
    return Promise.resolve({ sequence: seq++ });
  };
  return { emit, events };
}

function idFactory(): () => string {
  let n = 0;
  return () => `evt_${n++}`;
}

function agenome(
  agenomeId: string,
  totals: number[],
  status: AgenomeStatus = 'eligible_parent',
): CullInput['agenomes'][number] {
  return {
    agenomeId,
    status,
    candidates: totals.map((total, i) => ({ candidateId: `${agenomeId}_c${i}`, total })),
  };
}

// Relative-cull policy: cull agenomes whose best total is below mean − 1·stddev of the generation's
// best-total distribution, but never below a 2-survivor population floor (fusion needs ≥2 parents).
const policy: CullPolicy = { relativeStdDevK: 1, minSurvivors: 2 };

function input(agenomes: CullInput['agenomes']): CullInput {
  return { runId: 'run_1', generationId: 'gen_1', agenomes };
}

/**
 * cull (P5.7, §8) — culls weak lineages RELATIVE to each generation's fitness distribution (best-candidate
 * total below mean − k·stddev), guarded by a population floor (never drops below minSurvivors eligible
 * agenomes — the organism must survive to breed), and emits one explainable lineage.culled (CullingEvent).
 * Pure compose + emit, deterministic over persisted scores (replay-faithful, rule #7); nothing culled →
 * no event.
 */
describe('cull — relative weak-lineage culling + population floor + explainable lineage.culled', () => {
  // 1 — spec(§8) BUG-B: an agenome whose best total is a clear low outlier (below mean − 1·stddev) is
  // culled; the strong lineages survive. The threshold is RELATIVE to the generation distribution, not a
  // fixed minFitness:0 (which never fired since fitness ≥ 0).
  test('cull_selects_relative_weak_outlier', async () => {
    const { emit } = recorder();
    // best totals: 0.9, 0.85, 0.8, 0.05 → mean ≈ 0.65, stddev ≈ 0.35 → threshold ≈ 0.30; only 0.05 culled.
    const { culledIds } = await cull(
      input([
        agenome('a_strong', [0.9]),
        agenome('b_strong', [0.85]),
        agenome('c_strong', [0.8]),
        agenome('d_weak', [0.05]),
      ]),
      policy,
      { emit, newId: idFactory() },
    );
    expect(culledIds).toEqual(['d_weak']);
  });

  // 2 — BUG-B: a TIGHT distribution (no value below mean − stddev) culls NOTHING — there is no clear weak
  // outlier, so the population is not eroded. (Pre-fix minFitness:0 also culled nothing, but for the wrong
  // reason — it NEVER fired. Here the relative rule correctly finds no outlier.) For the 2-cluster set
  // {0.70,0.70,0.72,0.72}: mean 0.71, stddev 0.01 → threshold 0.70 = the min, which is NOT strictly below.
  test('cull_tight_distribution_culls_nothing', async () => {
    const { emit, events } = recorder();
    const { culledIds } = await cull(
      input([agenome('a', [0.7]), agenome('b', [0.7]), agenome('c', [0.72]), agenome('d', [0.72])]),
      policy,
      { emit, newId: idFactory() },
    );
    expect(culledIds).toEqual([]);
    expect(events.filter((e) => e.type === 'lineage.culled')).toHaveLength(0);
  });

  // 3 — POPULATION FLOOR (non-negotiable): a relative cull is CLAMPED so ≥ minSurvivors eligible agenomes
  // always remain. When MORE lineages fall below the threshold than the floor permits to cull, the WEAKEST
  // are culled first and the top survivors are KEPT so the organism can still reproduce (≥2 eligible
  // parents for fusion). Here totals {0.99, 0.02, 0.01, 0.0} with k=0.5 → threshold ≈ 0.043, so 3 fall
  // below, but culling 3 would leave 1 survivor (< floor 2) → only the weakest 2 (0.0, 0.01) are culled.
  test('cull_respects_population_floor_keeps_top_survivors', async () => {
    const floorPolicy: CullPolicy = { relativeStdDevK: 0.5, minSurvivors: 2 };
    const { emit } = recorder();
    const { culledIds } = await cull(
      input([
        agenome('a_top', [0.99]),
        agenome('b_low', [0.02]),
        agenome('c_low', [0.01]),
        agenome('d_low', [0.0]),
      ]),
      floorPolicy,
      { emit, newId: idFactory() },
    );
    const eligibleCount = 4;
    const survivors = eligibleCount - culledIds.length;
    expect(survivors).toBe(floorPolicy.minSurvivors); // floor binds: exactly 2 survive.
    expect(culledIds.length).toBe(2);
    // the weakest are culled first; the top lineage is always kept.
    expect(culledIds).toContain('d_low'); // weakest (0.0)
    expect(culledIds).toContain('c_low'); // next weakest (0.01)
    expect(culledIds).not.toContain('a_top'); // strongest kept
    expect(culledIds).not.toContain('b_low'); // kept by the floor (0.02 > 0.01)
  });

  // 4 — FLOOR at the minimum: a generation with exactly minSurvivors eligible agenomes culls NOTHING even
  // if one is a weak outlier — culling any would drop below the reproduce floor (population collapse).
  test('cull_floor_blocks_when_at_minimum', async () => {
    const { emit } = recorder();
    const { culledIds } = await cull(
      input([agenome('a_strong', [0.95]), agenome('b_weak', [0.0])]),
      policy,
      { emit, newId: idFactory() },
    );
    expect(culledIds).toEqual([]);
  });

  // 5 — spec(§8): exactly one lineage.culled; payload parses against the frozen CullingEvent (explicit
  // validate, NOT the append generic fall-through); correct envelope.
  test('cull_emits_one_lineage_culled_validated', async () => {
    const { emit, events } = recorder();
    await cull(
      input([
        agenome('a_strong', [0.9]),
        agenome('b_strong', [0.85]),
        agenome('c_strong', [0.8]),
        agenome('d_weak', [0.05]),
      ]),
      policy,
      { emit, newId: idFactory() },
    );
    const culled = events.filter((e) => e.type === 'lineage.culled');
    expect(culled).toHaveLength(1);
    const env = culled[0]!;
    expect(env.actor).toBe('selection_controller');
    expect(env.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(env.runId).toBe('run_1');
    expect(() => CullingEvent.parse(env.payload)).not.toThrow();
  });

  // 6 — spec(§8) EXPLAINABILITY: scoreSnapshot carries each culled target's justifying best total + the
  // reason names the relative threshold (the decision is reconstructable from the event alone).
  test('cull_event_scoreSnapshot_and_reason_justify', async () => {
    const { emit } = recorder();
    const { cullingEvent } = await cull(
      input([
        agenome('a_strong', [0.9]),
        agenome('b_strong', [0.85]),
        agenome('c_strong', [0.8]),
        agenome('d_weak', [0.04, 0.05]),
      ]),
      policy,
      { emit, newId: idFactory() },
    );
    expect(cullingEvent).toBeDefined();
    expect(cullingEvent!.scoreSnapshot.d_weak).toBeCloseTo(0.05, 12); // best total of the culled agenome
    expect(cullingEvent!.reason.length).toBeGreaterThan(0);
    expect(cullingEvent!.targetIds).toEqual(['d_weak']);
  });

  // 7 — CullingEvent targetIds ≥1 kernel rule: nothing culled → no lineage.culled emitted. An all-equal
  // distribution has stddev 0 → threshold = mean, and no value is STRICTLY below the mean → nothing culled.
  test('cull_nothing_culled_no_event', async () => {
    const { emit, events } = recorder();
    const { culledIds, cullingEvent } = await cull(
      input([agenome('a', [0.9]), agenome('b', [0.9]), agenome('c', [0.9])]),
      policy,
      { emit, newId: idFactory() },
    );
    expect(culledIds).toEqual([]);
    expect(cullingEvent).toBeUndefined();
    expect(events.filter((e) => e.type === 'lineage.culled')).toHaveLength(0);
  });

  // 8 — purity: cull does not mutate its inputs.
  test('cull_does_not_mutate_inputs', async () => {
    const inp = input([
      agenome('a_strong', [0.9]),
      agenome('b_strong', [0.85]),
      agenome('c_strong', [0.8]),
      agenome('d_weak', [0.05]),
    ]);
    const snapshot = structuredClone(inp);
    const { emit } = recorder();
    await cull(inp, policy, { emit, newId: idFactory() });
    expect(inp).toEqual(snapshot);
  });

  // 9 — replay-faithful (rule #7): same inputs+policy → identical culledIds + event content; no randomness,
  // no provider call — the cull decision derives only from the persisted totals.
  test('cull_deterministic', async () => {
    const inp = input([
      agenome('a_strong', [0.9]),
      agenome('b_strong', [0.85]),
      agenome('c_strong', [0.8]),
      agenome('d_weak', [0.05]),
    ]);
    const a = await cull(inp, policy, { emit: recorder().emit, newId: idFactory() });
    const b = await cull(inp, policy, { emit: recorder().emit, newId: idFactory() });
    expect(a.culledIds).toEqual(b.culledIds);
    expect(a.cullingEvent?.targetIds).toEqual(b.cullingEvent?.targetIds);
    expect(a.cullingEvent?.scoreSnapshot).toEqual(b.cullingEvent?.scoreSnapshot);
  });

  // 10 — no work on culled/spent/failed: a terminal-state agenome is never eligible (not counted in the
  // distribution, never re-culled). Here the eligible set is {a_strong, b_strong, d_weak}; the terminal
  // ones are ignored; d_weak is the relative outlier among the eligible — but with only 3 eligible and a
  // floor of 2, at most 1 can be culled.
  test('cull_skips_terminal_state_agenomes', async () => {
    const { emit } = recorder();
    const { culledIds } = await cull(
      input([
        agenome('a_culled', [0.9], 'culled'),
        agenome('a_spent', [0.9], 'spent'),
        agenome('a_failed', [0.9], 'failed'),
        agenome('a_strong', [0.9], 'eligible_parent'),
        agenome('b_strong', [0.88], 'eligible_parent'),
        agenome('d_weak', [0.0], 'eligible_parent'),
      ]),
      policy,
      { emit, newId: idFactory() },
    );
    expect(culledIds).not.toContain('a_culled');
    expect(culledIds).not.toContain('a_spent');
    expect(culledIds).not.toContain('a_failed');
    // d_weak is the lone relative outlier among the 3 eligible; floor (2) allows culling exactly 1.
    expect(culledIds).toEqual(['d_weak']);
  });

  // 11 — boundary: an agenome with NO scored candidates has no fitness basis → it is NOT counted in the
  // distribution and is never culled (it is skipped, not treated as zero-fitness weak).
  test('cull_skips_agenome_with_no_scored_candidates', async () => {
    const { emit } = recorder();
    const { culledIds } = await cull(
      input([
        agenome('a_unscored', []),
        agenome('a_strong', [0.9]),
        agenome('b_strong', [0.85]),
        agenome('d_weak', [0.0]),
      ]),
      policy,
      { emit, newId: idFactory() },
    );
    expect(culledIds).not.toContain('a_unscored');
    expect(culledIds).toEqual(['d_weak']);
  });

  // 12 — fewer than 2 eligible: with 0 or 1 eligible agenome the floor blocks ALL culling (you cannot
  // erode a population that is already at/below the reproduce floor).
  test('cull_single_eligible_never_culled', async () => {
    const { emit, events } = recorder();
    const { culledIds } = await cull(input([agenome('only', [0.0])]), policy, {
      emit,
      newId: idFactory(),
    });
    expect(culledIds).toEqual([]);
    expect(events).toHaveLength(0);
  });

  // 13 — TRUNCATION pressure: a TIGHT distribution with NO relative outlier (which the relative-only rule
  // culls nothing for — see test 2) still loses its weakest lineages under `cullFraction`. 6 lineages
  // {0.70..0.75}, cullFraction 1/3 → floor(6·1/3)=2 weakest culled (a=0.70, b=0.71). This is the fix that
  // makes lineages reliably die every generation so a winner converges.
  test('cull_truncation_fraction_culls_weakest_in_tight_distribution', async () => {
    const truncPolicy: CullPolicy = { relativeStdDevK: 1, minSurvivors: 2, cullFraction: 1 / 3 };
    const { emit } = recorder();
    const { culledIds } = await cull(
      input([
        agenome('a', [0.7]),
        agenome('b', [0.71]),
        agenome('c', [0.72]),
        agenome('d', [0.73]),
        agenome('e', [0.74]),
        agenome('f', [0.75]),
      ]),
      truncPolicy,
      { emit, newId: idFactory() },
    );
    expect(culledIds).toEqual(['a', 'b']); // the weakest two
  });

  // 14 — TRUNCATION respects the population floor: cullFraction never drops below minSurvivors. 3 eligible,
  // cullFraction 0.9 → quota floor(3·0.9)=2, but maxCullable = 3−2 = 1 → only the single weakest is culled.
  test('cull_truncation_respects_population_floor', async () => {
    const truncPolicy: CullPolicy = { relativeStdDevK: 1, minSurvivors: 2, cullFraction: 0.9 };
    const { emit } = recorder();
    const { culledIds } = await cull(
      input([agenome('a', [0.1]), agenome('b', [0.5]), agenome('c', [0.9])]),
      truncPolicy,
      { emit, newId: idFactory() },
    );
    expect(culledIds).toEqual(['a']); // weakest only; floor keeps 2 survivors
  });
});
