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

// Policy whose weight keys match the five component keys (all weight 1 → total = sum of components).
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

function baseInput(overrides: Partial<ScoreFitnessInput> = {}): ScoreFitnessInput {
  return {
    runId: 'run_1',
    generationId: 'gen_1',
    candidateId: 'cand_1',
    novelty: { degraded: false, noveltyScore: validNoveltyScore }, // score 0.72
    energyEfficiency: { value: 0.9, explanation: 'energy' },
    criticScores: {
      value: 0.7,
      reviewCount: 2,
      contributingReviewCount: 2,
      explanation: 'critic',
    },
    judgeAcceptance: { present: true, value: 1, explanation: 'judge', policyVersion: 'scoring-v1' },
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
  // component values come from the passed-in results, never re-derived from a provider.
  test('total_deterministic_no_gateway', async () => {
    const { emit } = recorder();
    const { emit: emit2 } = recorder();
    const a = await scoreFitness(baseInput(), policy, { emit, newId: idFactory() });
    const b = await scoreFitness(baseInput(), policy, { emit: emit2, newId: idFactory() });
    expect(a.total).toBe(b.total);
    // total = sum of the five components (all weights 1): 0.72+0.9+0.7+0.5+1.
    expect(a.total).toBeCloseTo(0.72 + 0.9 + 0.7 + 0.5 + 1, 12);
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
    // components: novelty 0.72, energy 0.9, critic 0.7, subtype 0.5, judge 1.
    const expected: Array<[string, number, number]> = [
      ['novelty', 0.72, 2],
      ['energy_efficiency', 0.9, 0.5],
      ['critic_scores', 0.7, 1],
      ['subtype_check', 0.5, 3],
      ['judge_acceptance', 1, 0.25],
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

  // 20 — anchor fail-CLOSED (rule #6/§8): a finite-but-overflowing weighted sum (Infinity total — a path
  // the component-side guard can't catch, since each value is itself finite) fails closed: scoreFitness
  // THROWS and emits NOTHING, so a non-finite total can never be persisted as the fitness anchor (the
  // frozen FitnessScore.total z.number() rejects Infinity at parse, before the emit). Regression pin.
  test('non_finite_total_fails_closed_no_emit', async () => {
    const overflowPolicy: ScoringPolicy = {
      version: 'scoring-v1',
      weights: { ...policy.weights, energy_efficiency: 10 },
    };
    const { emit, events } = recorder();
    await expect(
      scoreFitness(
        baseInput({ energyEfficiency: { value: 1e308, explanation: 'huge but finite' } }),
        overflowPolicy,
        { emit, newId: idFactory() },
      ),
    ).rejects.toThrow();
    expect(events).toHaveLength(0); // fail-closed BEFORE the emit — nothing persisted.
  });
});
