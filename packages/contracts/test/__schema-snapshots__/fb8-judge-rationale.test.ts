// FB.8 — frontend-v2 judge per-axis rationale: the JudgeResult contract amendment (sv8→9). spec(§4) spec(§7).
// JudgeResult gains an OPTIONAL axisRationales (a FinalJudgeAxis→string record) — the held-out judge's
// per-axis one-line EXPLANATION, emitted alongside its scores. CURRENT_SCHEMA_VERSION 8→9 (ADDITIVE — an
// sv≤8 envelope / a JudgeResult without rationale still validates). rule #6: the held-out judge / scoring
// anchor (ScoringPolicy / FinalJudgeRubric / FinalJudgeAxis) stays BYTE-IDENTICAL across this amendment, and
// the score-bearing fields (axisScores + acceptance) are unchanged — the rationale EXPLAINS the floor, it
// cannot move it (acceptance stays runner-computed from axisScores × the immutable weights).
import { describe, it, expect } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION,
  FinalJudgeAxis,
  FinalJudgeRubric,
  JudgeResult,
  RunEventEnvelope,
  ScoringPolicy,
  objectFieldNames,
  validJudgeResult,
  validRunEventEnvelope,
} from '@doppl/contracts';

const sorted = (a: readonly string[]): string[] => [...a].sort();

// rule #6 — the held-out judge anchor field-sets this amendment must NOT move.
const SCORING_POLICY_FIELD_SNAPSHOT = ['version', 'weights', 'normalization'];
const FINAL_JUDGE_RUBRIC_FIELD_SNAPSHOT = ['axes', 'weights', 'policyVersion', 'immutableToAgents'];
const FINAL_JUDGE_AXIS_SNAPSHOT = [
  'grounding',
  'novelty',
  'feasibility',
  'falsification_survival',
  'subtype_check_pass',
];

// A complete (all-5-axis) rationale set, keyed by the closed FinalJudgeAxis.
const FULL_RATIONALES: Record<string, string> = {
  grounding: 'cites prior art',
  novelty: 'cross-domain transplant',
  feasibility: 'buildable',
  falsification_survival: 'survives the obvious counterexample',
  subtype_check_pass: 'meets the subtype contract',
};

describe('FB.8 — JudgeResult axisRationales amendment (sv8→9) (spec §4 / §7)', () => {
  it('test_axis_rationales_additive_sv9', () => {
    // the WHOLE field is optional: a JudgeResult WITHOUT axisRationales still validates (backward-compatible).
    const { axisRationales: _omit, ...withoutRationales } = validJudgeResult;
    void _omit;
    expect(JudgeResult.safeParse(withoutRationales).success).toBe(true);
    // WITH a complete rationale set it validates.
    expect(
      JudgeResult.safeParse({ ...withoutRationales, axisRationales: FULL_RATIONALES }).success,
    ).toBe(true);
  });

  it('test_axis_rationales_exhaustive_when_present', () => {
    const { axisRationales: _omit, ...base } = validJudgeResult;
    void _omit;
    // present-but-partial (missing an axis) is REJECTED — the enum-keyed record is exhaustive like axisScores.
    const { subtype_check_pass: _drop, ...partial } = FULL_RATIONALES;
    void _drop;
    expect(JudgeResult.safeParse({ ...base, axisRationales: partial }).success).toBe(false);
    // an unknown axis key is REJECTED (closed key set — defense-in-depth, rule #6).
    expect(
      JudgeResult.safeParse({
        ...base,
        axisRationales: { ...FULL_RATIONALES, made_up_axis: 'x' },
      }).success,
    ).toBe(false);
  });

  it('test_current_schema_version_at_least_9_since_fb8', () => {
    // spec(§4): the FB.8 amendment landed at or above sv9; old envelopes (incl. v8) still validate.
    expect(CURRENT_SCHEMA_VERSION).toBeGreaterThanOrEqual(9);
    for (const v of [1, 7, 8, 9]) {
      expect(
        RunEventEnvelope.safeParse({ ...validRunEventEnvelope, schemaVersion: v }).success,
        `schemaVersion ${v}`,
      ).toBe(true);
    }
  });

  it('test_rule6_surface_byte_identical', () => {
    // rule #6: the judge-rationale amendment leaves the held-out judge / scoring anchor field/member sets
    // unchanged + the immutability flag intact — the rationale is judge OUTPUT, never the scoring authority.
    expect(objectFieldNames(ScoringPolicy)).toEqual(sorted(SCORING_POLICY_FIELD_SNAPSHOT));
    expect(objectFieldNames(FinalJudgeRubric)).toEqual(sorted(FINAL_JUDGE_RUBRIC_FIELD_SNAPSHOT));
    expect(sorted(FinalJudgeAxis.options)).toEqual(sorted(FINAL_JUDGE_AXIS_SNAPSHOT));
    expect(() => FinalJudgeRubric.shape.immutableToAgents.parse(false)).toThrow();
  });

  it('test_score_bearing_fields_unchanged', () => {
    // the load-bearing FB.8 pin: axisRationales did NOT alter the score-bearing JudgeResult fields — axisScores
    // + acceptance still parse exactly as before (the rationale rides alongside, it never replaces a score).
    expect(JudgeResult.safeParse(validJudgeResult).success).toBe(true);
    expect(typeof validJudgeResult.acceptance).toBe('number');
    expect(sorted(Object.keys(validJudgeResult.axisScores))).toEqual(
      sorted(FINAL_JUDGE_AXIS_SNAPSHOT),
    );
  });
});
