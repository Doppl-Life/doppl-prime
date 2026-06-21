/**
 * runtime — the kernel surface for apps/api: lifecycle state-machine transition guards (P3.2), the boot
 * config loader (P3.1), and the generation loop / caps / energy ledger (P3.4+) as they land. Guards are
 * PURE decisions; the loop/appender own emit + persist (§5 ownership split).
 */

// State-machine transition guards (P3.2). Candidate machine follows the CandidateStatus +`repairing`
// amendment (finding: §3 requires `repairing`, the frozen enum omits it — escalated like degraded).
export {
  makeTransitionGuard,
  type TransitionDecision,
  type TransitionDenialReason,
  type TransitionTable,
  type TransitionGuard,
} from './state/transitionGuard';
export { canTransitionRun, RUN_TRANSITIONS, RUN_TERMINALS } from './state/runStateMachine';
export {
  canTransitionGeneration,
  GENERATION_TRANSITIONS,
  GENERATION_TERMINALS,
} from './state/generationStateMachine';
export {
  canTransitionAgenome,
  AGENOME_TRANSITIONS,
  AGENOME_TERMINALS,
} from './state/agenomeStateMachine';
