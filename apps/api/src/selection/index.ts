/**
 * selection — the scoring / novelty / fitness / reproduction surface for the selection track
 * (ARCHITECTURE.md §8). Consumes the frozen contracts from `@doppl/contracts` + the `ModelGateway`
 * port for embeddings — never a provider SDK (KEY SAFETY RULE #9). The runtime generation `scoring`
 * state (P3) is the first consumer of `scoreNovelty`.
 */
export { cosineSimilarity, noveltyFromSimilarities, noveltyScoreOf } from './novelty/cosine';
export { lexicalNoveltyScore } from './novelty/lexical-fallback';
export { embed } from './novelty/embed';
export type { EmbedDeps, EmbedResult } from './novelty/embed';
export { scoreNovelty } from './novelty/score-novelty';
export type {
  NoveltyComparison,
  NoveltyEmitter,
  ScoreNoveltyDeps,
  ScoreNoveltyInput,
  ScoreNoveltyResult,
} from './novelty/score-novelty';
export { energyEfficiency } from './components/energy-efficiency';
export type { EnergyEfficiencyResult } from './components/energy-efficiency';
export { criticScores } from './components/critic-scores';
export type { CriticScoresResult } from './components/critic-scores';
export { JUDGE_ACCEPTANCE_KEY, judgeAcceptance } from './components/judge-acceptance';
export type { JudgeAcceptanceResult } from './components/judge-acceptance';
export {
  CRITIC_SCORES_KEY,
  ENERGY_EFFICIENCY_KEY,
  NOVELTY_KEY,
  SUBTYPE_CHECK_KEY,
  applyScoringPolicy,
} from './fitness/policy';
export type { Contribution, ScoringResult } from './fitness/policy';
export { scoreFitness } from './fitness/score-fitness';
export type { FitnessEmitter, ScoreFitnessDeps, ScoreFitnessInput } from './fitness/score-fitness';
export { allocate } from './allocation';
export type { Allocation, AllocationParent } from './allocation';
export { assembleSuccessor } from './successor';
export type {
  SuccessorChild,
  SuccessorDeps,
  SuccessorInput,
  SuccessorParent,
  SuccessorResult,
} from './successor';
export { cull } from './cull';
export type {
  AgenomeFitness,
  CullDeps,
  CullEmitter,
  CullInput,
  CullPolicy,
  CullResult,
  ScoredCandidate,
} from './cull';
export { createRng } from './reproduction/rng';
export type { Rng } from './reproduction/rng';
export { parentDistance, selectDistantPair } from './reproduction/parent-distance';
export type { FusionParent } from './reproduction/parent-distance';
export { crossover, reconstructCrossover } from './reproduction/crossover';
export type {
  ChildTraits,
  CrossoverChoices,
  CrossoverResult,
  Parent,
} from './reproduction/crossover';
export { applyFusion, fuse } from './reproduction/fuse';
export type { FuseDeps, FuseInput, FuseResult, FusionEmitter } from './reproduction/fuse';
export { abortInsufficientParents, reproduceMutationOnly } from './reproduction/degenerate';
export type {
  DegenerateDeps,
  DegenerateOutcome,
  ReproductionContext,
  SelectionEmitter,
} from './reproduction/degenerate';
export { applyReproduction, reproduce } from './reproduction/reproduce';
export type { ReproduceDeps, ReproduceInput, ReproduceResult } from './reproduction/reproduce';
export { applyMutation, mutate } from './reproduction/mutate';
export type {
  ApplyMutationDeps,
  MutateDeps,
  MutationBounds,
  MutationSummary,
} from './reproduction/mutate';
export { createScoreSeam } from './seams/score-seam';
export type { ScoreSeamDeps } from './seams/score-seam';
export { createReproduceSeam } from './seams/reproduce-seam';
export type { ReproduceSeamDeps } from './seams/reproduce-seam';
export { createSuccessorThreading } from './seams/successor-threading';
export type { SuccessorThreadingDeps } from './seams/successor-threading';
