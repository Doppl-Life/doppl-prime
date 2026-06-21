/**
 * selection — the scoring / novelty / fitness / reproduction surface for the selection track
 * (ARCHITECTURE.md §8). Consumes the frozen contracts from `@doppl/contracts` + the `ModelGateway`
 * port for embeddings — never a provider SDK (KEY SAFETY RULE #9). The runtime generation `scoring`
 * state (P3) is the first consumer of `scoreNovelty`.
 */
export { cosineSimilarity, noveltyFromSimilarities, noveltyScoreOf } from './novelty/cosine';
export { jaccardSimilarity, lexicalNoveltyScore } from './novelty/lexical-fallback';
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
