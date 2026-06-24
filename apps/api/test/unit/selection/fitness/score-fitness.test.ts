import { describe, expect, test } from 'vitest';
import {
  CANONICAL_FIXTURES,
  CURRENT_SCHEMA_VERSION,
  FitnessScore,
  validNoveltyScore,
  validateEventPayload,
} from '@doppl/contracts';
import type { CheckResult, RunEventEnvelope, ScoringPolicy } from '@doppl/contracts';
import { scoreFitness } from '../../../../src/selection/fitness/score-fitness';
import type {
  FitnessEmitter,
  ScoreFitnessInput,
} from '../../../../src/selection/fitness/score-fitness';

type Emitted = Omit<RunEventEnvelope, 'sequence' | 'occurredAt'>;

function recorder(): { emit: FitnessEmitter; events: Emitted[] } {
  const events: Emitted[] = [];
  let seq = 0;
  const emit: FitnessEmitter = (env) => {
    events.push(env);
    return Promise.resolve({ sequence: seq++ });
  };
  return { emit, events };
}

function idFactory(): () => string {
  let n = 0;
  return () => `evt_${n++}`;
}

function check(status: CheckResult['status'], id: string): CheckResult {
  return status === 'skipped'
    ? {
        id,
        candidateId: 'cand_1',
        checkType: 'citation_resolves',
        status,
        skipReason: 'unregistered',
        evidenceRefs: [],
      }
    : { id, candidateId: 'cand_1', checkType: 'citation_resolves', status, evidenceRefs: [] };
}

// Policy whose weight keys match the five REAL component keys. total is a NORMALIZED weighted AVERAGE
// in [0,1] (Σ wₖ·normₖ / Σ wₖ): with all weights 1, total = mean of the five normalized component values.
const policy: ScoringPolicy = {
  version: 'scoring-v1',
  weights: {
    novelty: 1,
    energy_efficiency: 1,
    critic_scores: 1,
    subtype_check: 1,
    judge_acceptance: 1,
  },
};

// CRITIC_SCORE_MAX = 5 (the assumed 0-5 critic scale, mirrored from the judge axis scale). A critic value
// of 0.7 (well under 5) normalizes to 0.14.
const CRITIC_SCORE_MAX = 5;
// A judge acceptance of 20 over a 25-max rubric (5 axes × max 5, equal weights) normalizes to 0.8.
const JUDGE_MAX = 25;

function baseInput(overrides: Partial<ScoreFitnessInput> = {}): ScoreFitnessInput {
  return {
    runId: 'run_1',
    generationId: 'gen_1',
    candidateId: 'cand_1',
    novelty: { degraded: false, noveltyScore: validNoveltyScore }, // score 0.72 (already 0-1)
    energyEfficiency: { value: 0.9, explanation: 'energy' }, // 0-1 by construction
    criticScores: {
      value: 0.7, // raw critic value → normalized 0.7/5 = 0.14
      reviewCount: 2,
      contributingReviewCount: 2,
      explanation: 'critic',
    },
    // judge raw acceptance 20 over a 25-max rubric → normalized 0.8 (NOT verbatim 20 into the average).
    judgeAcceptance: {
      present: true,
      value: 20,
      maxValue: JUDGE_MAX,
      explanation: 'judge',
      policyVersion: 'scoring-v1',
    },
    checkResults: [check('passed', 'c1'), check('failed', 'c2')], // pass fraction 0.5
    ...overrides,
  };
}

/**
 * scoreFitness (P5.6, §8) — the scoring capstone. Composes the five already-computed component results
 * into a frozen FitnessScore via the immutable ScoringPolicy weights, bound to policyVersion (rule #6),
 * total a pure deterministic function (no provider re-derivation — rule #7), emits one fitness.scored.
 */
describe('scoreFitness — policy-versioned decomposed fitness', () => {
  // 6 — spec(§2.5): the result parses against the frozen FitnessScore (frozen-seam conformance).
  test('fitness_score_validates_against_FitnessScore', async () => {
    const { emit } = recorder();
    const result = await scoreFitness(baseInput(), policy, { emit, newId: idFactory() });
    expect(() => FitnessScore.parse(result)).not.toThrow();
    const canonical = CANONICAL_FIXTURES.find((f) => f.name === 'FitnessScore');
    expect(canonical).toBeDefined();
  });

  // 7 — KEY SAFETY RULE #6: policyVersion is bound to policy.version.
  test('policyVersion_bound_to_policy_version', async () => {
    const { emit } = recorder();
    const result = await scoreFitness(baseInput(), policy, { emit, newId: idFactory() });
    expect(result.policyVersion).toBe(policy.version);
  });

  // 8 — spec(§8): components carries all five decomposed signals.
  test('components_carries_all_five_signals', async () => {
    const { emit } = recorder();
    const result = await scoreFitness(baseInput(), policy, { emit, newId: idFactory() });
    expect(Object.keys(result.components).sort()).toEqual(
      ['critic_scores', 'energy_efficiency', 'judge_acceptance', 'novelty', 'subtype_check'].sort(),
    );
  });

  // 9 — spec(§8): non-degraded novelty → components.novelty === noveltyScore.score.
  test('novelty_uses_scored_value', async () => {
    const { emit } = recorder();
    const result = await scoreFitness(baseInput(), policy, { emit, newId: idFactory() });
    expect(result.components.novelty).toBe(validNoveltyScore.score);
  });

  // 10 — spec(§8)/P5.3: degraded novelty → components.novelty === estimatedScore + flagged estimated.
  test('novelty_degraded_uses_estimate_flagged', async () => {
    const { emit } = recorder();
    const result = await scoreFitness(
      baseInput({
        novelty: { degraded: true, estimatedScore: 0.4, method: 'lexical_jaccard', reason: 'x' },
      }),
      policy,
      { emit, newId: idFactory() },
    );
    expect(result.components.novelty).toBe(0.4);
    expect(result.explanation).toMatch(/estimat/i);
  });

  // 11 — rule #6/§8: judge present:false → components.judge_acceptance === 0, flagged not-accepted.
  test('judge_absent_contributes_zero_flagged', async () => {
    const { emit } = recorder();
    const result = await scoreFitness(
      baseInput({
        judgeAcceptance: {
          present: false,
          value: 0,
          maxValue: JUDGE_MAX,
          explanation: 'absent',
          policyVersion: 'scoring-v1',
        },
      }),
      policy,
      { emit, newId: idFactory() },
    );
    expect(result.components.judge_acceptance).toBe(0);
    expect(result.explanation).toMatch(/judge_acceptance.*(absent|not accepted|estimated|flag)/is);
  });

  // 12 — spec(§8): critic contributingReviewCount:0 → components.critic_scores === 0, flagged.
  test('critic_absent_contributes_zero_flagged', async () => {
    const { emit } = recorder();
    const result = await scoreFitness(
      baseInput({
        criticScores: {
          value: 0,
          reviewCount: 0,
          contributingReviewCount: 0,
          explanation: 'absent',
        },
      }),
      policy,
      { emit, newId: idFactory() },
    );
    expect(result.components.critic_scores).toBe(0);
    expect(result.explanation).toMatch(/critic_scores.*(absent|flag)/is);
  });

  // 13 — spec(§7/§8): subtype_check = passed/(passed+failed) over non-skipped; skipped excluded; no
  // non-skipped → defined boundary 0 flagged absent.
  test('subtype_check_pass_fraction', async () => {
    const { emit } = recorder();
    const twoPassOneFailOneSkip = await scoreFitness(
      baseInput({
        checkResults: [
          check('passed', 'a'),
          check('passed', 'b'),
          check('failed', 'c'),
          check('skipped', 'd'),
        ],
      }),
      policy,
      { emit, newId: idFactory() },
    );
    expect(twoPassOneFailOneSkip.components.subtype_check).toBeCloseTo(2 / 3, 12);

    const { emit: emit2 } = recorder();
    const allSkipped = await scoreFitness(
      baseInput({ checkResults: [check('skipped', 'a'), check('skipped', 'b')] }),
      policy,
      { emit: emit2, newId: idFactory() },
    );
    expect(allSkipped.components.subtype_check).toBe(0);
    expect(allSkipped.explanation).toMatch(/subtype_check.*(absent|no.*check|flag)/is);
  });

  // 14 — KEY SAFETY RULE #7: total is deterministic + a pure compose (no gateway in deps — structural);
  // component values come from the passed-in results, never re-derived from a provider. total is a
  // NORMALIZED weighted AVERAGE in [0,1] over the five normalized components (all weights 1 → plain mean).
  test('total_deterministic_no_gateway', async () => {
    const { emit } = recorder();
    const { emit: emit2 } = recorder();
    const a = await scoreFitness(baseInput(), policy, { emit, newId: idFactory() });
    const b = await scoreFitness(baseInput(), policy, { emit: emit2, newId: idFactory() });
    expect(a.total).toBe(b.total);
    // normalized components: novelty 0.72, energy 0.9, critic 0.7/5=0.14, subtype 0.5, judge 20/25=0.8.
    // total = mean of the five (all weights 1) = (0.72+0.9+0.14+0.5+0.8)/5.
    const expectedTotal = (0.72 + 0.9 + 0.7 / CRITIC_SCORE_MAX + 0.5 + 20 / JUDGE_MAX) / 5;
    expect(a.total).toBeCloseTo(expectedTotal, 12);
    expect(a.total).toBeGreaterThanOrEqual(0);
    expect(a.total).toBeLessThanOrEqual(1); // total stays in the DS 0-1 convention.
  });

  // 15 — spec(§4): exactly one fitness.scored via the emitter; payload validates; correct envelope.
  test('emits_one_fitness_scored_validated', async () => {
    const { emit, events } = recorder();
    await scoreFitness(baseInput(), policy, { emit, newId: idFactory() });
    const scored = events.filter((e) => e.type === 'fitness.scored');
    expect(scored).toHaveLength(1);
    const env = scored[0]!;
    expect(env.actor).toBe('selection_controller');
    expect(env.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(env.runId).toBe('run_1');
    expect(env.candidateId).toBe('cand_1');
    expect(validateEventPayload('fitness.scored', env.payload).ok).toBe(true);
  });

  // 16 — spec(§8): explanation enumerates each component's raw value + weight + weighted contribution
  // (not just the key) — the decision must be reconstructable from the prose. Distinct weights so
  // value ≠ weight ≠ contribution per component, making the inclusion checks meaningful.
  test('explanation_enumerates_components', async () => {
    const distinctPolicy: ScoringPolicy = {
      version: 'scoring-v1',
      weights: {
        novelty: 2,
        energy_efficiency: 0.5,
        critic_scores: 1,
        subtype_check: 3,
        judge_acceptance: 0.25,
      },
    };
    const { emit } = recorder();
    const result = await scoreFitness(baseInput(), distinctPolicy, { emit, newId: idFactory() });
    // NORMALIZED components: novelty 0.72, energy 0.9, critic 0.7/5=0.14, subtype 0.5, judge 20/25=0.8.
    const expected: Array<[string, number, number]> = [
      ['novelty', 0.72, 2],
      ['energy_efficiency', 0.9, 0.5],
      ['critic_scores', 0.7 / CRITIC_SCORE_MAX, 1],
      ['subtype_check', 0.5, 3],
      ['judge_acceptance', 20 / JUDGE_MAX, 0.25],
    ];
    for (const [key, value, weight] of expected) {
      expect(result.explanation).toContain(key);
      expect(result.explanation).toContain(String(value));
      expect(result.explanation).toContain(String(weight));
      expect(result.explanation).toContain(String(value * weight)); // weighted contribution
    }
  });

  // 17 — spec(§3): re-scoring the same inputs+policy → identical total/components/explanation.
  test('idempotent_under_same_policy_version', async () => {
    const { emit } = recorder();
    const { emit: emit2 } = recorder();
    const a = await scoreFitness(baseInput(), policy, { emit, newId: idFactory() });
    const b = await scoreFitness(baseInput(), policy, { emit: emit2, newId: idFactory() });
    expect(a.total).toBe(b.total);
    expect(a.components).toEqual(b.components);
    expect(a.explanation).toBe(b.explanation);
  });

  // 18 — spec(§8)/LESSONS §13: novelty is referenced via components.novelty, not re-stored as an
  // authoritative NoveltyScore — the FitnessScore stays the strict 6-field shape.
  test('novelty_referenced_not_restored', async () => {
    const { emit } = recorder();
    const result = await scoreFitness(baseInput(), policy, { emit, newId: idFactory() });
    expect(Object.keys(result).sort()).toEqual(
      ['candidateId', 'components', 'explanation', 'id', 'policyVersion', 'total'].sort(),
    );
    expect(typeof result.components.novelty).toBe('number');
  });

  // 19 — NaN-integrity (defense-in-depth, rule #6/§8): a non-finite component value (a corrupt upstream
  // result) is coerced to 0 + flagged, so NaN/Infinity can never reach the fitness total — a NaN total
  // silently corrupts the anchor in P5.7 cull/parent-selection (NaN compares falsely). Completes the
  // test-6 weight-without-component direction with the component-value-input direction.
  test('non_finite_component_value_coerced_zero_flagged', async () => {
    const { emit } = recorder();
    const result = await scoreFitness(
      baseInput({ energyEfficiency: { value: NaN, explanation: 'corrupt' } }),
      policy,
      { emit, newId: idFactory() },
    );
    expect(result.components.energy_efficiency).toBe(0);
    expect(Number.isFinite(result.total)).toBe(true);
    expect(result.explanation).toMatch(/energy_efficiency.*(non-finite|finite|flag)/is);
  });

  // 20 — all-zero-weight boundary (rule #6/§8 — the average's divisor): a policy whose weights are all 0
  // makes Σweights = 0; a naive average would divide by zero → NaN total (silently corrupts the anchor in
  // P5.7 cull/parent-selection). The scorer returns a DEFINED finite 0 instead (no acceptance signal can
  // move a zero-weight policy), never NaN, and still emits one valid fitness.scored.
  test('all_zero_weight_total_defined_finite_not_nan', async () => {
    const zeroPolicy: ScoringPolicy = {
      version: 'scoring-v1',
      weights: {
        novelty: 0,
        energy_efficiency: 0,
        critic_scores: 0,
        subtype_check: 0,
        judge_acceptance: 0,
      },
    };
    const { emit, events } = recorder();
    const result = await scoreFitness(baseInput(), zeroPolicy, { emit, newId: idFactory() });
    expect(Number.isNaN(result.total)).toBe(false);
    expect(Number.isFinite(result.total)).toBe(true);
    expect(result.total).toBe(0);
    expect(() => FitnessScore.parse(result)).not.toThrow();
    expect(events.filter((e) => e.type === 'fitness.scored')).toHaveLength(1);
  });

  // 21 — BUG-A REGRESSION (rule #6 — the held-out judge is the bedrock anchor): the judge MUST move the
  // total. With the DEFAULT-shaped weights (judge_acceptance weighted), a high-judge candidate strictly
  // outranks an otherwise-identical low-judge one. Pre-fix the default weights keyed on grounding/
  // feasibility/falsification (which NO component produces), so judge_acceptance was weighted by NOTHING
  // and this delta was exactly 0 — the judge was decorative.
  test('judge_acceptance_moves_total_high_beats_low', async () => {
    const { emit: e1 } = recorder();
    const { emit: e2 } = recorder();
    const highJudge = await scoreFitness(
      baseInput({
        judgeAcceptance: {
          present: true,
          value: 25, // max acceptance → normalized 1.0
          maxValue: JUDGE_MAX,
          explanation: 'high',
          policyVersion: 'scoring-v1',
        },
      }),
      policy,
      { emit: e1, newId: idFactory() },
    );
    const lowJudge = await scoreFitness(
      baseInput({
        judgeAcceptance: {
          present: true,
          value: 0, // min acceptance → normalized 0.0
          maxValue: JUDGE_MAX,
          explanation: 'low',
          policyVersion: 'scoring-v1',
        },
      }),
      policy,
      { emit: e2, newId: idFactory() },
    );
    expect(highJudge.total).toBeGreaterThan(lowJudge.total);
  });

  // 22 — BUG-A REGRESSION: critic_scores MUST move the total (it was weighted by nothing pre-fix). A
  // high-critic candidate strictly outranks an otherwise-identical low-critic one under the default weights.
  test('critic_scores_moves_total_high_beats_low', async () => {
    const { emit: e1 } = recorder();
    const { emit: e2 } = recorder();
    const highCritic = await scoreFitness(
      baseInput({
        criticScores: { value: 5, reviewCount: 2, contributingReviewCount: 2, explanation: 'high' },
      }),
      policy,
      { emit: e1, newId: idFactory() },
    );
    const lowCritic = await scoreFitness(
      baseInput({
        criticScores: { value: 0, reviewCount: 2, contributingReviewCount: 2, explanation: 'low' },
      }),
      policy,
      { emit: e2, newId: idFactory() },
    );
    expect(highCritic.total).toBeGreaterThan(lowCritic.total);
  });

  // 23 — CRITICAL SCALE BUG (rule #6): judge_acceptance is RAW 0-25 (5 axes × 0-5) while every other
  // component is 0-1. It MUST be normalized to 0-1 (÷ maxValue) BEFORE the weighted average, so a raw 25
  // does NOT dominate. Pin the stored component: components.judge_acceptance is the NORMALIZED value, and
  // it never exceeds 1 even at the raw max.
  test('judge_acceptance_normalized_not_raw', async () => {
    const { emit } = recorder();
    const result = await scoreFitness(
      baseInput({
        judgeAcceptance: {
          present: true,
          value: 25, // raw max
          maxValue: JUDGE_MAX,
          explanation: 'raw-max',
          policyVersion: 'scoring-v1',
        },
      }),
      policy,
      { emit, newId: idFactory() },
    );
    expect(result.components.judge_acceptance).toBe(1); // 25/25 — normalized, NOT raw 25.
    expect(result.components.judge_acceptance).toBeLessThanOrEqual(1);
    // total stays a true 0-1 average — a maxed judge cannot blow it past 1.
    expect(result.total).toBeLessThanOrEqual(1);
  });

  // 24 — judge absent → normalized component is the neutral 0 (no acceptance evidence), never moving the
  // total upward. maxValue defaults harmlessly on the absent path (value 0 → 0 regardless of divisor).
  test('judge_absent_normalized_zero', async () => {
    const { emit } = recorder();
    const result = await scoreFitness(
      baseInput({
        judgeAcceptance: {
          present: false,
          value: 0,
          maxValue: JUDGE_MAX,
          explanation: 'absent',
          policyVersion: 'scoring-v1',
        },
      }),
      policy,
      { emit, newId: idFactory() },
    );
    expect(result.components.judge_acceptance).toBe(0);
  });
});
