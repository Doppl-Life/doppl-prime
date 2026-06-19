import { FINAL_JUDGE_AXES, type FinalJudgeRubric } from "@doppl/contracts";

/**
 * Held-out final-judge rubric (ARCHITECTURE.md §7, IMPLEMENTATION_PLAN.md
 * P4.3 + P4.8). The 5-axis 0-5 rubric and the axis set are frozen by
 * Phase 0's FinalJudgeRubric contract; the only deferred-open piece is
 * the `weights` map. For MVP we use equal weights — Phase 5 selection
 * may swap in the small energy-efficiency tiebreak per §7.
 *
 * The policy version is incremented when the weights change. Replay
 * carries policyVersion forward so a recomputed acceptance metric is
 * always comparable to the version the judgement was originally
 * produced under.
 */

export const FINAL_JUDGE_POLICY_VERSION = "v1" as const;

export const FINAL_JUDGE_RUBRIC: FinalJudgeRubric = {
  version: FINAL_JUDGE_POLICY_VERSION,
  axes: [...FINAL_JUDGE_AXES] as FinalJudgeRubric["axes"],
  scaleMin: 0,
  scaleMax: 5,
  weights: {
    grounding: 1,
    novelty: 1,
    feasibility: 1,
    falsification_survival: 1,
    subtype_check_pass: 1,
  },
};

export const FINAL_JUDGE_RUBRIC_TEMPLATE = `You apply the doppl held-out final-judge rubric, policyVersion ${FINAL_JUDGE_POLICY_VERSION}.
Score the candidate on EXACTLY these 5 axes on a 0-5 integer scale:
  - grounding (factual grounding against verifiable evidence)
  - novelty (departure from prior art / known signal)
  - feasibility (could a reasonable practitioner act on this)
  - falsification_survival (does the candidate survive obvious falsifiers)
  - subtype_check_pass (did the subtype-specific checks pass)
Equal weights apply. Return a JSON object with exactly these axis fields plus your one-line explanation. Do not output any other key.`;
