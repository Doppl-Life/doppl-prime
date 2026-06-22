/**
 * runtime — the kernel surface for apps/api: lifecycle state-machine transition guards (P3.2), the boot
 * config loader (P3.1), and the generation loop / caps / energy ledger (P3.4+) as they land. Guards are
 * PURE decisions; the loop/appender own emit + persist (§5 ownership split).
 */

// State-machine transition guards (P3.2 — all 4 machines: Run/Generation/Agenome from kernel-017, the
// Candidate machine completed in kernel-019 once `repairing` landed via the kernel-018 CandidateStatus
// amendment). Pure (from,to)→decision over per-machine tables on one shared builder (lesson §33).
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
export {
  canTransitionCandidate,
  CANDIDATE_TRANSITIONS,
  CANDIDATE_TERMINALS,
} from './state/candidateStateMachine';

// Seeded RNG + outcome-persistence bridge (P3.6 — KEY SAFETY RULE #7 determinism substrate). One
// deterministic mulberry32 PRNG derived from RunConfig.rngSeed + the LIVE/REPLAY outcome sources (LIVE
// records each draw to a JSON-safe ordered log for the open-JSONB mutation/fusion/cull payloads; REPLAY
// reconstructs from that log and is PRNG-free by construction — replay never re-samples). First consumers
// P3.9/P3.10/reproduction-dispatch construct LIVE from createSeededRng(readRngSeed(config)); emission
// wiring lands in P3.10/P3.12.
export { createSeededRng, readRngSeed, type SeededRng } from './rng/seededRng';
export {
  createLiveOutcomeSource,
  createReplayOutcomeSource,
  ReplayOutcomeError,
  type OutcomeSource,
  type OutcomeEntry,
  type OutcomeValue,
  type RngDraws,
} from './rng/persistOutcomes';
