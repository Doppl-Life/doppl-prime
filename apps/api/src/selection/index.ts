/**
 * Phase 5 public surface for selection-track callers (Phase 6 HTTP,
 * Phase 7 dashboard).
 */
// Novelty
export { cosineDistance, cosineSimilarity, CosineMathError } from "./novelty/cosine.js";
export { embedCandidate, EmbedError } from "./novelty/embed.js";
export type { EmbedCandidateInput, EmbedCandidateResult } from "./novelty/embed.js";
export { charNGramSet, jaccardDistance, jaccardSimilarity } from "./novelty/lexical-fallback.js";
export { scoreCandidateNovelty } from "./novelty/score-novelty.js";
export type {
  ComparisonEntry,
  ScoreNoveltyInput,
  ScoreNoveltyOutput,
} from "./novelty/score-novelty.js";

// Components
export { energyEfficiencyForAgenome } from "./components/energy-efficiency.js";
export { criticScoreForCandidate } from "./components/critic-scores.js";
export { subtypeCheckScoreForCandidate } from "./components/subtype-checks.js";
export { judgeAcceptanceForCandidate } from "./components/judge-acceptance.js";

// Fitness
export { SCORING_POLICY_V1, applyPolicy } from "./fitness/policy.js";
export type { FitnessComponents, AppliedPolicy } from "./fitness/policy.js";
export { scoreFitness } from "./fitness/score-fitness.js";
export type { ScoreFitnessInput, ScoreFitnessOutput } from "./fitness/score-fitness.js";

// Cull + parent selection
export { cullWeakLineages } from "./cull.js";
export type { CullableCandidate, CullResult } from "./cull.js";
export { selectParents } from "./parent-selection.js";
export type { RankableCandidate, SelectParentsInput } from "./parent-selection.js";

// Reproduction
export {
  mutateAgenome,
  mutationSummaryString,
  reproductionEventFromMutation,
} from "./reproduction/mutate.js";
export type {
  MutateAgenomeInput,
  MutateAgenomeOutput,
  MutationBounds,
  MutationOutcome,
} from "./reproduction/mutate.js";
export { streamRng } from "./reproduction/rng.js";
export type { RngStreamKey } from "./reproduction/rng.js";
export { crossoverAgenomes } from "./reproduction/crossover.js";
export type { CrossoverInput, CrossoverOutput } from "./reproduction/crossover.js";
export { synthesizeFusedPrompt } from "./reproduction/output-synthesis.js";
export type {
  OutputSynthesisInput,
  OutputSynthesisResult,
} from "./reproduction/output-synthesis.js";
export { parentDistance } from "./reproduction/parent-distance.js";
export type { ParentDistanceInput } from "./reproduction/parent-distance.js";
export { fuseAgenomes } from "./reproduction/fuse.js";
export type { FuseAgenomesInput, FuseAgenomesOutput } from "./reproduction/fuse.js";
export { reproduceMutationOnly } from "./reproduction/degenerate.js";
export type {
  DegenerateReproductionInput,
  DegenerateReproductionOutput,
} from "./reproduction/degenerate.js";
export { reproduceWithFallback } from "./reproduction/reproduce.js";
export type { ReproduceInput, ReproduceOutput } from "./reproduction/reproduce.js";

// Allocation + successor
export { clampBudget, normalizeWeights, allocateSuccessorBudget } from "./allocation.js";
export { assembleSuccessorPopulation } from "./successor.js";
export type { AssembleSuccessorInput } from "./successor.js";

// Factories
export { makeScoreHook } from "./run-scoring.js";
export type { MakeScoreHookDeps, ScoreHook } from "./run-scoring.js";
export { makeReproduceHook } from "./run-reproduction.js";
export type { MakeReproduceHookDeps, ReproduceHook } from "./run-reproduction.js";
