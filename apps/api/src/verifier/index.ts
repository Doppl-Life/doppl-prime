/**
 * Phase 4 public surface for verifier-track callers (Phase 5 selection,
 * Phase 6 HTTP surface, Phase 7 dashboard). The lint test under
 * apps/api/src/__tests__/verifier-isolation-lint.test.ts (U11) enforces
 * that no consumer reaches around the U1 isolation seam.
 */
export {
  DATA_CLOSE,
  DATA_FRAMING,
  DATA_OPEN,
  IsolationViolationError,
  assembleCheckRequest,
  assembleCriticRequest,
  assembleJudgeRequest,
  wrapCandidateAsData,
} from "./isolation/candidate-as-data.js";
export { criticCall } from "./council/critic-call.js";
export type { CriticCallInput, CriticCallResult } from "./council/critic-call.js";
export { runCouncil } from "./council/run-council.js";
export type {
  CouncilCandidate,
  CriticAssignment,
  RunCouncilInput,
} from "./council/run-council.js";
export {
  ROTATION_N_MAX,
  ROTATION_N_MIN,
  RotationConfigError,
  assignCriticsForGeneration,
} from "./council/rotation.js";
export type {
  AssignCriticsInput,
  AssignCriticsResult,
} from "./council/rotation.js";
export {
  FINAL_JUDGE_POLICY_VERSION,
  FINAL_JUDGE_RUBRIC,
  FINAL_JUDGE_RUBRIC_TEMPLATE,
} from "./judge/rubric.js";
export { judgeCall } from "./judge/judge-call.js";
export type {
  JudgeAxisScores,
  JudgeCallInput,
  JudgeCallResult,
} from "./judge/judge-call.js";
export { runFinalJudge } from "./judge/run-judge.js";
export type {
  JudgeAcceptance,
  JudgeCandidate,
  RunFinalJudgeInput,
} from "./judge/run-judge.js";
export { makeVerifyHook } from "./run-verification.js";
export type { MakeVerifyHookDeps, VerifyHook } from "./run-verification.js";
