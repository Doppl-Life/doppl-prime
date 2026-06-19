// Caps + kill switch
export {
  type CapEnforcementResult,
  type CapEnforcer,
  type CapName,
  createCapEnforcer,
  createKillSwitch,
  type KillSwitch,
  type RunState,
} from "./caps.js";
// Energy ledger
export { createEnergyLedger, type EnergyLedger } from "./energy-ledger.js";
// Errors
export { CapExhaustedError, RunAlreadyActiveError } from "./errors.js";
// Generation loop
export {
  type PersistedCandidate,
  runGeneration,
  type RunGenerationDeps,
  type RunGenerationInput,
  type RunGenerationOutput,
} from "./generation-loop.js";
// Crash-forward recovery
export {
  recoverIncompleteRuns,
  type RecoveryMode,
  type RecoveryResult,
} from "./recovery.js";
// Repair-state edge
export {
  handleStructuredOutput,
  type HandleStructuredOutputOptions,
  type HandleStructuredOutputResult,
} from "./repair-state.js";
// Seeded RNG
export { createSeededRng, type SeededRng } from "./rng.js";
// Gen-0 seeds
export {
  defaultGen0Bundle,
  type MaterializeGen0Options,
  materializeGen0Bundle,
} from "./seeds/gen-0-agenomes.js";
// Start-run + worker
export { startRun, type StartRunOptions } from "./start-run.js";
// State machines
export {
  AgenomeStateMachine,
  CandidateStateMachine,
  GenerationStateMachine,
  IllegalTransitionError,
  RunStateMachine,
} from "./state-machines/index.js";
// Terminal classifier
export {
  classifyTerminal,
  type TerminalClassification,
  type TerminalStatus,
  type TerminalSummary,
} from "./terminal-classifier.js";
export { Worker, type WorkerOptions } from "./worker.js";
