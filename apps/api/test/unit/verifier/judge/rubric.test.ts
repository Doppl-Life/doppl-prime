import { describe, expect, test } from 'vitest';
import { FinalJudgeRubric } from '@doppl/contracts';
import { DEFAULT_JUDGE_RUBRIC, loadJudgeRubric } from '../../../../src/verifier/judge/rubric';

/**
 * P4.3 held-out-judge rubric LOAD path (KEY SAFETY RULE #6 — the held-out judge/rubric is the immutable
 * bedrock fitness anchor the organism cannot lift). loadJudgeRubric validates an already-loaded rubric
 * against the frozen FinalJudgeRubric AND enforces the two properties the CONTRACT cannot (lesson 6): the
 * full 5-axis set is present (no missing/duplicate axis) and immutableToAgents is true — before the
 * rubric can score. Pure (source injected; IO at the boot boundary, lesson 4). spec(§7/§14).
 */

const ALL_AXES = [
  'grounding',
  'novelty',
  'feasibility',
  'falsification_survival',
  'subtype_check_pass',
];

function validRubric(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    axes: [...ALL_AXES],
    weights: {
      grounding: 1,
      novelty: 1,
      feasibility: 1,
      falsification_survival: 1,
      subtype_check_pass: 1,
    },
    policyVersion: 'test-rubric-1',
    immutableToAgents: true,
    ...overrides,
  };
}

describe('loadJudgeRubric — immutable-anchor load + completeness enforcement (rule #6)', () => {
  // spec(§7) — positive guard first (lesson 10): a valid full-5-axis immutable rubric loads and returns
  // the parsed FinalJudgeRubric.
  test('test_loads_valid_full_axis_rubric', () => {
    const loaded = loadJudgeRubric(validRubric());
    expect(FinalJudgeRubric.safeParse(loaded).success).toBe(true);
    expect(loaded.axes).toHaveLength(5);
    expect(loaded.immutableToAgents).toBe(true);
  });

  // spec(§7) lesson 6 — the KEY new assertion: a rubric missing one of the 5 axes is rejected (the
  // full-axis-set completeness the schema cannot enforce).
  test('test_rejects_missing_axis', () => {
    expect(() =>
      loadJudgeRubric(
        validRubric({ axes: ['grounding', 'novelty', 'feasibility', 'falsification_survival'] }),
      ),
    ).toThrow();
  });

  // spec(§7) — a duplicate axis (not the exact 5-member set) is rejected.
  test('test_rejects_duplicate_axis', () => {
    expect(() =>
      loadJudgeRubric(
        validRubric({
          axes: ['grounding', 'grounding', 'novelty', 'feasibility', 'falsification_survival'],
        }),
      ),
    ).toThrow();
  });

  // spec(§14) rule #6 — the unflippable anchor flag: immutableToAgents false or omitted both throw.
  test('test_rejects_immutable_false_or_missing', () => {
    expect(() => loadJudgeRubric(validRubric({ immutableToAgents: false }))).toThrow();
    const withoutFlag = validRubric();
    delete withoutFlag.immutableToAgents;
    expect(() => loadJudgeRubric(withoutFlag)).toThrow();
  });

  // spec(§8) lesson 12 — immutability-via-versioning: a missing/empty policyVersion is rejected.
  test('test_rejects_missing_policy_version', () => {
    expect(() => loadJudgeRubric(validRubric({ policyVersion: '' }))).toThrow();
    const withoutVersion = validRubric();
    delete withoutVersion.policyVersion;
    expect(() => loadJudgeRubric(withoutVersion)).toThrow();
  });

  // spec(§14) lesson 9 — anti-reward-hacking: a mutation/override/authority field is rejected (strict).
  test('test_rejects_authority_field', () => {
    for (const field of ['scoreOverride', 'editableBy', 'agentWritable']) {
      expect(() => loadJudgeRubric(validRubric({ [field]: true }))).toThrow();
    }
  });

  // spec(§15) — fail-fast boot: the thrown error names the offending field.
  test('test_error_is_field_identifying', () => {
    expect(() =>
      loadJudgeRubric(
        validRubric({ axes: ['grounding', 'novelty', 'feasibility', 'falsification_survival'] }),
      ),
    ).toThrow(/axes/);
    expect(() => loadJudgeRubric(validRubric({ policyVersion: '' }))).toThrow(/policyVersion/);
  });

  // spec(§7) — the MVP held-out rubric is valid + immutable by construction (full 5-axis set, frozen).
  test('test_default_rubric_loads', () => {
    expect(() => loadJudgeRubric(DEFAULT_JUDGE_RUBRIC)).not.toThrow();
    expect(new Set(DEFAULT_JUDGE_RUBRIC.axes)).toEqual(new Set(ALL_AXES));
    expect(DEFAULT_JUDGE_RUBRIC.immutableToAgents).toBe(true);
    expect(Object.isFrozen(DEFAULT_JUDGE_RUBRIC)).toBe(true);
  });

  // BUG-A REGRESSION (rule #6 — the held-out judge rubric is the bedrock anchor, immutable to agents): the
  // scoring-weights fix (which makes judge_acceptance + critic_scores actually count) MUST NOT touch the
  // judge rubric. Pin DEFAULT_JUDGE_RUBRIC byte-for-byte: a change here is a change to the immutable floor
  // the organism cannot lift, and must be a deliberate, reviewed event — never an incidental edit.
  test('test_default_rubric_byte_identical_immutable_anchor', () => {
    expect(DEFAULT_JUDGE_RUBRIC).toEqual({
      axes: ['grounding', 'novelty', 'feasibility', 'falsification_survival', 'subtype_check_pass'],
      weights: {
        grounding: 1,
        novelty: 1,
        feasibility: 1,
        falsification_survival: 1,
        subtype_check_pass: 1,
        energy_efficiency: 0.1,
      },
      // Phase J flip (operator-delegated 2026-06-27, rule #6): bumped final-judge-mvp-3 → final-judge-v4
      // alongside the JUDGE_AXIS_CRITERIA earn-from-zero recalibration. Axes / weights / immutableToAgents are
      // byte-identical — the CRITERIA text is a runtime concern, not a rubric field — so this remains the
      // immutable floor; only the version records that the judge's scoring behavior moved
      // (immutability-via-versioning, lesson §12).
      policyVersion: 'final-judge-v4',
      immutableToAgents: true,
    });
  });
});
