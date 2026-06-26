import { FinalJudgeAxis } from '@doppl/contracts';

/**
 * Directed reproduction (Wave 1, Step 3, ARCHITECTURE.md §8) — turn the held-out judge's per-axis OUTPUT
 * into a steering signal for fusion, so offspring REPAIR a parent's weakest dimension instead of blending
 * toward the mean (`E[offspring] ≤ max(parent)`). The judge, its rubric, and the scoring policy stay
 * BYTE-IDENTICAL (KEY SAFETY RULE #6 — this only READS the judge's result to steer breeding, like the FB.3/
 * FB.4 generation dials); the targeted axis NAME is a member of the immutable, agent-independent
 * `FinalJudgeAxis` enum (so it can never carry candidate text into the synthesis instruction — rule #5).
 */
export interface AxisWeakness {
  /** A member of the closed `FinalJudgeAxis` enum (trusted, agent-independent). */
  readonly axis: string;
  /** The persisted 0–5 judge score on that axis (read VERBATIM — rule #7). */
  readonly score: number;
}

/**
 * The judge's LOWEST-scoring axis for a candidate (the dimension to repair), or `null` when no axis score is
 * present. PURE over the persisted `JudgeResult.axisScores` (rule #7 — never recompute). Tie-break by the
 * canonical `FinalJudgeAxis` enum order, and only enum members are considered, so the result is deterministic
 * (replay-stable) and confined to the immutable axis set (rule #6 — never a free-text/candidate-derived key).
 */
export function weakestJudgedAxis(axisScores: Record<string, number>): AxisWeakness | null {
  let weakest: AxisWeakness | null = null;
  for (const axis of FinalJudgeAxis.options) {
    const score = axisScores[axis];
    if (typeof score !== 'number') continue;
    if (weakest === null || score < weakest.score) {
      weakest = { axis, score };
    }
  }
  return weakest;
}
