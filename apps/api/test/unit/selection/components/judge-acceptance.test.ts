import { describe, expect, test } from 'vitest';
import {
  CANONICAL_FIXTURES,
  FinalJudgeAxis,
  JudgeResult,
  validFinalJudgeRubric,
  validJudgeResult,
} from '@doppl/contracts';
import type { FinalJudgeRubric } from '@doppl/contracts';
import {
  JUDGE_ACCEPTANCE_KEY,
  judgeAcceptance,
} from '../../../../src/selection/components/judge-acceptance';

const fullRubric: FinalJudgeRubric = validFinalJudgeRubric;

/**
 * Held-out-judge acceptance fitness component (P5.5 judge half, §7/§8/§14). Pure read of the persisted
 * JudgeResult.acceptance (NEVER recomputed — rule #6), gated by the held-out-rubric load validation
 * (full 5-axis set + immutableToAgents:true + policyVersion match, fail-CLOSED). The held-out judge is
 * immutable to selection: this never invokes/mutates the judge or its rubric.
 */
describe('judgeAcceptance — held-out-judge acceptance component', () => {
  // 1 — spec(§8): value === the persisted JudgeResult.acceptance for a full-axis immutable rubric.
  test('judge_value_is_persisted_acceptance', () => {
    const result = judgeAcceptance(validJudgeResult, fullRubric);
    expect(result.present).toBe(true);
    expect(result.value).toBe(validJudgeResult.acceptance);
  });

  // 2 — KEY SAFETY RULE #6: acceptance is read verbatim, NEVER recomputed from axisScores. A result whose
  // acceptance is deliberately inconsistent with its axisScores still yields acceptance verbatim.
  test('judge_value_never_recomputed_from_axisScores', () => {
    const inconsistent: JudgeResult = {
      ...validJudgeResult,
      axisScores: {
        grounding: 5,
        novelty: 5,
        feasibility: 5,
        falsification_survival: 5,
        subtype_check_pass: 5,
      },
      acceptance: 0.1, // far from any aggregate of all-5 axis scores.
    };
    expect(judgeAcceptance(inconsistent, fullRubric).value).toBe(0.1);
  });

  // 3 — spec(§8): the component key is 'judge_acceptance', distinct from the critic-council scores.
  test('judge_component_key_is_judge_acceptance', () => {
    expect(JUDGE_ACCEPTANCE_KEY).toBe('judge_acceptance');
  });

  // 4 — carry-forward / lesson §17: a rubric missing an axis (parses, but incomplete) fails CLOSED.
  test('judge_rubric_missing_axis_fails_closed', () => {
    const incomplete: FinalJudgeRubric = { ...fullRubric, axes: ['grounding'] };
    expect(() => judgeAcceptance(validJudgeResult, incomplete)).toThrow();
  });

  // 5 — positive guard (lesson §10): a full-5-axis immutable rubric validates + produces a value.
  test('judge_rubric_full_5_axis_accepted', () => {
    expect(fullRubric.axes).toEqual(FinalJudgeAxis.options);
    const result = judgeAcceptance(validJudgeResult, fullRubric);
    expect(result.present).toBe(true);
    expect(typeof result.value).toBe('number');
  });

  // 6 — rule #6 defense-in-depth: the load validation asserts immutableToAgents===true (a forced
  // non-immutable rubric, bypassing the contract, fails closed).
  test('judge_immutableToAgents_asserted_at_load', () => {
    const notImmutable = {
      ...fullRubric,
      immutableToAgents: false,
    } as unknown as FinalJudgeRubric;
    expect(() => judgeAcceptance(validJudgeResult, notImmutable)).toThrow();
  });

  // 7 — KEY SAFETY RULE #6: a JudgeResult produced under a different/superseded rubric policyVersion is
  // NOT accepted (defined not-accepted boundary, never silently moves fitness).
  test('judge_policyVersion_mismatch_not_accepted', () => {
    const stale: JudgeResult = { ...validJudgeResult, rubricPolicyVersion: 'judge-v0' };
    const result = judgeAcceptance(stale, fullRubric);
    expect(result.present).toBe(false);
    expect(result.value).toBe(0);
    expect(result.explanation).toMatch(/policy|version|mismatch/i);
  });

  // 8 — spec(§8): absence → not accepted by default (present:false, value 0, absence flagged).
  test('judge_absence_not_accepted_by_default', () => {
    const result = judgeAcceptance(undefined, fullRubric);
    expect(result.present).toBe(false);
    expect(result.value).toBe(0);
    expect(result.explanation).toMatch(/no judge|absent|not accepted/i);
  });

  // 9 — rule #6: judgeAcceptance never mutates the input judgeResult or rubric.
  test('judge_does_not_mutate_inputs', () => {
    const resultSnapshot = structuredClone(validJudgeResult);
    const rubricSnapshot = structuredClone(fullRubric);
    judgeAcceptance(validJudgeResult, fullRubric);
    expect(validJudgeResult).toEqual(resultSnapshot);
    expect(fullRubric).toEqual(rubricSnapshot);
  });

  // 10 — KEY SAFETY RULE #7: pure read of the persisted record — no provider/judge invocation possible
  // (no gateway in the signature); the value is reproduced deterministically.
  test('judge_replay_faithful_no_invocation', () => {
    const a = judgeAcceptance(validJudgeResult, fullRubric);
    const b = judgeAcceptance(validJudgeResult, fullRubric);
    expect(a.value).toBe(b.value);
    expect(a.value).toBe(validJudgeResult.acceptance);
  });

  // 11 — spec(§8): explanation enumerates per-axis scores + acceptance + rubricPolicyVersion.
  test('judge_explanation_enumerates_axes_and_policyVersion', () => {
    const { explanation } = judgeAcceptance(validJudgeResult, fullRubric);
    expect(explanation).toContain('grounding');
    expect(explanation).toContain(String(validJudgeResult.acceptance));
    expect(explanation).toContain(validJudgeResult.rubricPolicyVersion);
  });

  // 12 — spec(§2.5): the canonical JudgeResult fixture parses + aggregates (frozen-seam conformance).
  test('judge_result_validates_against_JudgeResult', () => {
    const fixture = CANONICAL_FIXTURES.find((f) => f.name === 'JudgeResult');
    expect(fixture).toBeDefined();
    const parsed = JudgeResult.parse(fixture!.value);
    expect(judgeAcceptance(parsed, fullRubric).present).toBe(true);
  });

  // 13 — replay-faithful: same (judgeResult, rubric) → identical output.
  test('judge_acceptance_deterministic', () => {
    expect(judgeAcceptance(validJudgeResult, fullRubric)).toEqual(
      judgeAcceptance(validJudgeResult, fullRubric),
    );
  });
});
