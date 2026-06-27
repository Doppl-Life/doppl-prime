import { describe, expect, test } from 'vitest';
import { JUDGE_AXIS_CRITERIA, loadJudgeCriteria } from '../../src/verifier/judge/judge-core';
import { buildJudgeInstruction } from '../../src/verifier/judge/judge-call';
import { buildComparativeJudgeInstruction } from '../../src/verifier/judge/comparative-judge';
import { JUDGE_AXIS_CRITERIA_V4 } from './criteria-v4';

/**
 * Phase J — J3: the DRAFT v4 criteria is well-formed + injectable, AND the live default is UNTOUCHED. KEYLESS
 * (no provider). The behavioral effect of v4 is a LIVE eval (judge-calibration.eval.ts), not a unit assertion
 * — these tests pin only that v4 is a valid alternate the Slice-Js seam can carry, and that authoring it did
 * NOT flip the default (rule #6 — the flip is the separate J7 sign-off gate).
 */

describe('v4 criteria — valid + injectable (Slice-Js seam)', () => {
  test('test_loadJudgeCriteria_accepts_v4', () => {
    expect(loadJudgeCriteria(JUDGE_AXIS_CRITERIA_V4)).toBe(JUDGE_AXIS_CRITERIA_V4);
  });

  test('test_v4_carries_its_design_into_both_instruction_paths', () => {
    for (const inst of [
      buildJudgeInstruction(JUDGE_AXIS_CRITERIA_V4),
      buildComparativeJudgeInstruction(JUDGE_AXIS_CRITERIA_V4),
    ]) {
      expect(inst).toContain('held-out final judge'); // the fixed framing is preserved
      expect(inst).toContain('EARNING UP FROM 0'); // earn-from-zero anchoring
      expect(inst).toContain('NAMES the build path'); // a per-axis sub-criterion
      expect(inst).toContain('Cheap-to-fake signals earn NOTHING'); // the anti-cheap-signal clause
    }
  });
});

describe('v4 criteria — the default is NOT flipped (rule #6; flip is J7)', () => {
  test('test_v4_differs_from_the_default', () => {
    expect(JUDGE_AXIS_CRITERIA_V4).not.toBe(JUDGE_AXIS_CRITERIA);
  });

  test('test_default_still_has_the_mvp3_anchor_and_v4_does_not', () => {
    // The live default is still mvp-3 (composeRuntime wires JUDGE_AXIS_CRITERIA); v4 drops the anchor-at-5–6
    // instruction that flattened the scores.
    expect(JUDGE_AXIS_CRITERIA).toContain('anchor a typical idea at 5');
    expect(JUDGE_AXIS_CRITERIA_V4).not.toContain('anchor a typical idea at 5');
  });
});
