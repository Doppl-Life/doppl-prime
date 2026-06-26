import { describe, expect, test } from 'vitest';
import { weakestJudgedAxis } from '../../../../src/selection/reproduction/directed';

/**
 * weakestJudgedAxis (Wave 1, Step 3 — directed reproduction) — the held-out judge's LOWEST-scoring axis,
 * the dimension directed fusion should repair. PURE over the persisted axisScores (rule #7 — read the
 * judge's OUTPUT, never recompute); tie-break by the canonical FinalJudgeAxis enum order (replay-stable).
 */
describe('weakestJudgedAxis — the judge axis directed fusion repairs', () => {
  test('null when no axis score is present', () => {
    expect(weakestJudgedAxis({})).toBeNull();
  });

  test('returns the lowest-scoring axis', () => {
    expect(
      weakestJudgedAxis({
        grounding: 4,
        novelty: 2,
        feasibility: 5,
        falsification_survival: 3,
        subtype_check_pass: 4,
      }),
    ).toEqual({ axis: 'novelty', score: 2 });
  });

  test('ties break to the canonical FinalJudgeAxis enum order (deterministic → replay-stable)', () => {
    // grounding + novelty both 2; grounding precedes novelty in FinalJudgeAxis.options.
    expect(weakestJudgedAxis({ grounding: 2, novelty: 2, feasibility: 5 })?.axis).toBe('grounding');
  });

  test('ignores non-axis keys + absent axes', () => {
    expect(weakestJudgedAxis({ feasibility: 1, not_an_axis: 0 })).toEqual({
      axis: 'feasibility',
      score: 1,
    });
  });
});
