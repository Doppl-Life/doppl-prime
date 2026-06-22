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

// RunCaps enforcement + kill switch (P3.4 — KEY SAFETY RULE #1: caps kernel-enforced, never prompt). PURE
// fail-closed decisions (caps only from RunConfig.caps; an external hint can't raise a ceiling by shape) +
// the per-state kill-switch plan (validated through the P3.2 guards; emits nothing) + the queryable cap
// ledger. DECIDE only — the loop (P3.10) appends the named cap-breach events + the worker (P3.12) halts
// scheduling + drains the excluded/in-flight states (§5 ownership split).
export {
  enforceCap,
  enforceWallClock,
  type CapDecision,
  type CapAllowed,
  type CapDenied,
  type CapDimension,
} from './caps/capEnforcer';
export {
  planKillSwitch,
  type KillTrigger,
  type KillPlan,
  type RunTransitionPlan,
  type GenerationTransitionPlan,
  type GenerationRef,
  type KillPlanSummary,
} from './caps/killSwitch';
export { capLedger, type CapLedgerView } from './caps/capLedger';

// Success-only energy ledger (P3.5 — KEY SAFETY RULE #8: energy = successful productive spend only). PURE
// compute: the config-driven doppl_energy cost map (DEFAULT_COST_MAP); estimate (pre-call) + reconcile
// (post-call, llm actual from real ProviderMeta usage — never the estimate) building the frozen
// EnergyEvent; and the cumulative fold over ACTUAL spend per scope (feeds the P3.4 capLedger energy dim).
// COMPUTE only — the loop (P3.10) appends energy.spent (applying the scrub) + emits provider_call_failed
// on a failure (no debit); emission/scrub/exhaustion are deferred to P3.10 (§5 ownership split).
export {
  energyForLlm,
  energyForTool,
  energyForSpawn,
  DEFAULT_COST_MAP,
  type CostMapConfig,
} from './energy/costMap';
export {
  estimateEnergy,
  reconcileEnergy,
  type EnergyDraw,
  type EnergyScope,
  type ReconcileInput,
} from './energy/estimateReconcile';
export {
  cumulativeSpend,
  type LedgerEvent,
  type ScopeSelector,
  type EnergyScopeKind,
} from './energy/energyLedger';

// spawnBudget clamp (P3.9 — KEY SAFETY RULE #1: spawnBudget is an allocation hint, never cap-raising).
// PURE clampSpawnBudget(spawnBudget, remainingPopulation) → {effectiveSpawns, clamped}; effectiveSpawns =
// min(spawnBudget, max(0, remaining)) so the hint can't raise maxPopulation. Decision only — the spawn
// caller (gen-0 seed spawn / P3.10 reproduction) emits the clamp-decision event when clamped; the
// spawn-depth ceiling is a separate P3.4 enforceCap('maxSpawnDepth',…) gate.
export { clampSpawnBudget, type SpawnClampResult } from './spawn/spawnBudgetClamp';

// Gen-0 authored seed set (P3.9, REQ-F-017). The boot-validated authored baseline (SeedAgenomeTemplate
// traits-only; DEFAULT_SEED_SET) + the PURE materializeGen0 — authored templates → the run's gen-0
// Agenome[] (empty parentIds, seeded status, deterministic positional ids), count clamped to maxPopulation
// via clampSpawnBudget. The agenome.spawned emission is the loop's (P3.10/P3.12).
export { SeedAgenomeTemplate, SeedAgenomeSet, DEFAULT_SEED_SET } from './seed/seedAgenomes.config';
export { materializeGen0 } from './seed/gen0SeedSet';

// Generation loop skeleton (P3.10b — the substrate's first real consumer; §5/§3/§4 ownership). Bounded
// happy-path orchestration: guard-checked lifecycle → append-path emits (kernel-owned events only) →
// gateway candidates → INJECTED verify/score/reproduce seams consumed as DATA (option-b, never authored).
// The named caller is the P3.12 worker (deferred); energy/kill/edges/run-terminal are 10c/10d/10e/P3.11.
export {
  runGenerationLoop,
  transitionGenerationOrThrow,
  transitionAgenomeOrThrow,
  IllegalGenerationTransitionError,
  IllegalAgenomeTransitionError,
  type GenerationLoopDeps,
  type GenerationLoopResult,
  type GenerationGateway,
  type GenerateResult,
  type ToolCallObservation,
  type GenerationSeams,
  type VerifySeam,
  type ScoreSeam,
  type ReproduceSeam,
  type SeamContext,
  type ReproduceContext,
} from './loop/generationLoop';
export { executeKillAndDrain, type KillAppend } from './loop/killDrain';

// Run-terminal classification (P3.11 — §3 terminal rule + §5 kill/crash + energy "score already-verified").
// PURE classifyRunTerminal over the persisted log (completed iff a scored survivor — finalIdeaRef = the
// best-so-far; else failed{no_scored_survivor}; stopped/cancelled from the P3.10e KillPlanSummary;
// failed{crash} for P3.13) + the runTerminalPath guard helper + buildPartialTerminalSummary. The loop's exit
// is the executor (appends the single terminal, guard-validated); P3.13 crash-forward reuses
// classifyRunTerminal(crashed:true). energy_exhausted is mid-flight (NOT a terminal) — the real terminal
// still follows.
export {
  classifyRunTerminal,
  runTerminalPath,
  type ClassifyRunTerminalInput,
  type RunTerminalVerdict,
  type RunTerminalStatus,
} from './terminal/terminalClassifier';
export {
  buildPartialTerminalSummary,
  scoredSurvivors,
  bestScoredSurvivor,
  type PartialTerminalSummary,
  type ScoredSurvivor,
} from './terminal/partialSummary';
