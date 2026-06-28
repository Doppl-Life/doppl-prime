import { describe, expect, test } from 'vitest';
import {
  JUDGE_AXIS_CRITERIA,
  JUDGE_AXIS_CRITERIA_MVP3_BASELINE,
  loadJudgeCriteria,
} from '../../src/verifier/judge/judge-core';
import { buildJudgeInstruction } from '../../src/verifier/judge/judge-call';
import { buildComparativeJudgeInstruction } from '../../src/verifier/judge/comparative-judge';

/**
 * Phase J — POST-FLIP (operator-delegated 2026-06-27, rule #6): the live default judge criteria is now the
 * recalibrated final-judge-v4 (earn-from-zero). KEYLESS — the behavioral effect was validated by the live
 * `judge-calibration.eval.ts` (spread 0.26→0.57, gamed crushed, monotone); these tests pin only the FLIP: the
 * live default carries the v4 design into both judge instruction paths and has dropped the mvp-3 "anchor at
 * 5–6" text, while the retained {@link JUDGE_AXIS_CRITERIA_MVP3_BASELINE} (eval before-baseline) still has it.
 */

describe('the live default judge criteria IS the recalibrated v4 (Phase J flip)', () => {
  test('test_live_default_is_loadable', () => {
    expect(loadJudgeCriteria(JUDGE_AXIS_CRITERIA)).toBe(JUDGE_AXIS_CRITERIA);
  });

  test('test_live_default_carries_the_v4_design_into_both_instruction_paths', () => {
    for (const inst of [
      buildJudgeInstruction(JUDGE_AXIS_CRITERIA),
      buildComparativeJudgeInstruction(JUDGE_AXIS_CRITERIA),
    ]) {
      expect(inst).toContain('held-out final judge'); // the fixed framing is preserved
      expect(inst).toContain('EARNING UP FROM 0'); // earn-from-zero anchoring
      expect(inst).toContain('NAMES the build path'); // a per-axis sub-criterion
      expect(inst).toContain('Cheap-to-fake signals earn NOTHING'); // the anti-cheap-signal clause
    }
  });

  test('test_flip_dropped_the_mvp3_anchor_baseline_retains_it', () => {
    // The live default no longer carries the flattening "anchor a typical idea at 5–6"; the retained mvp-3
    // baseline (used only by the eval to characterize the BEFORE) still does.
    expect(JUDGE_AXIS_CRITERIA).not.toContain('anchor a typical idea at 5');
    expect(JUDGE_AXIS_CRITERIA_MVP3_BASELINE).toContain('anchor a typical idea at 5');
    expect(JUDGE_AXIS_CRITERIA).not.toBe(JUDGE_AXIS_CRITERIA_MVP3_BASELINE);
  });
});
