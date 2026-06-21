import { FinalJudgeAxis } from '@doppl/contracts';
import type { FinalJudgeRubric, JudgeResult } from '@doppl/contracts';

/**
 * Held-out-judge acceptance fitness component (P5.5 judge half, ARCHITECTURE.md §7/§8/§14).
 *
 * Pure read of the persisted `JudgeResult.acceptance` — selection READS the held-out judge's measurement
 * and NEVER recomputes it (KEY SAFETY RULE #6, the bedrock anti-reward-hacking anchor): the value is
 * `acceptance` verbatim, never re-derived from `axisScores`. The held-out judge is IMMUTABLE to selection
 * — this never invokes or mutates the judge or its rubric, and exposes no path to do so.
 *
 * It also enforces the held-out-rubric LOAD validation the contract can NOT pin (the carry-forward):
 * `FinalJudgeRubric.axes` is `z.array(FinalJudgeAxis)` (shape only — `[grounding]` alone still parses,
 * lesson §17), so before producing a value this asserts the FULL 5-axis set + `immutableToAgents===true`
 * and FAILS CLOSED (throws) on a misconfigured immutable anchor — a fail-fast boot/programmer error,
 * distinct from the per-candidate data boundaries (absence / policyVersion mismatch → `present:false`).
 *
 * Replay-faithful (rule #7): a pure function over the persisted `JudgeResult` — there is nothing to
 * re-invoke. The rubric is INJECTED (loaded from immutable config — never an agent-writable path, rule
 * #6/§14 — by the boot/runtime composition root); selection validates it but does not own the loader.
 */

/** The shared `FitnessScore.components` key for this component — P5.6 composes the value under it. */
export const JUDGE_ACCEPTANCE_KEY = 'judge_acceptance';

export interface JudgeAcceptanceResult {
  /** True only when a valid, policy-matched acceptance was read; false for absence / version mismatch. */
  present: boolean;
  /** `JudgeResult.acceptance` verbatim when present; the neutral 0 (no acceptance evidence) otherwise. */
  value: number;
  explanation: string;
  /** The immutable rubric's policyVersion this component validated against. */
  policyVersion: string;
}

/**
 * assertImmutableRubricLoaded — the held-out-judge LOAD gate (rule #6, the carry-forward). Throws on a
 * structurally-incomplete or non-immutable rubric: a misconfigured immutable anchor is a fail-fast error,
 * never a silent score.
 */
function assertImmutableRubricLoaded(rubric: FinalJudgeRubric): void {
  if (rubric.immutableToAgents !== true) {
    throw new Error('held-out rubric load: immutableToAgents must be true (immutable anchor)');
  }
  const axisSet = new Set(rubric.axes);
  const missing = FinalJudgeAxis.options.filter((axis) => !axisSet.has(axis));
  if (missing.length > 0) {
    throw new Error(
      `held-out rubric load: incomplete axis set — missing ${missing.join(', ')} (full 5-axis set required)`,
    );
  }
}

export function judgeAcceptance(
  judgeResult: JudgeResult | undefined,
  rubric: FinalJudgeRubric,
): JudgeAcceptanceResult {
  // Load gate first — a misconfigured immutable anchor fails CLOSED regardless of the result.
  assertImmutableRubricLoaded(rubric);
  const policyVersion = rubric.policyVersion;

  // Absence boundary — not accepted by default (no fabricated acceptance).
  if (judgeResult === undefined) {
    return {
      present: false,
      value: 0,
      explanation: 'No held-out-judge result for this candidate — not accepted by default.',
      policyVersion,
    };
  }

  // PolicyVersion binding — a result produced under a different/superseded rubric can't move fitness.
  if (judgeResult.rubricPolicyVersion !== policyVersion) {
    return {
      present: false,
      value: 0,
      explanation:
        `Held-out-judge result policyVersion ${judgeResult.rubricPolicyVersion} does not match the ` +
        `immutable rubric policyVersion ${policyVersion} — version mismatch, not accepted.`,
      policyVersion,
    };
  }

  // Read the acceptance VERBATIM — never recompute from axisScores (rule #6).
  const axisDetail = FinalJudgeAxis.options
    .map((axis) => `${axis}=${judgeResult.axisScores[axis]}`)
    .join(', ');
  return {
    present: true,
    value: judgeResult.acceptance,
    explanation:
      `Held-out-judge acceptance ${judgeResult.acceptance} (read verbatim) under rubric policyVersion ` +
      `${judgeResult.rubricPolicyVersion}; per-axis scores: ${axisDetail}.`,
    policyVersion,
  };
}
