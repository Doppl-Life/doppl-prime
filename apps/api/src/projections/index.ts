/**
 * Phase 6 projections public surface.
 */
export {
  EMPTY_SEQUENCE_THROUGH,
  ProjectionForwardSchemaError,
  ProjectionGapError,
  buildProjection,
} from "./projection-builder.js";
export type { BuildProjectionInput, BuiltProjection } from "./projection-builder.js";
export { createWatermarkCache } from "./watermark.js";
export type { CachedEntry, WatermarkCache } from "./watermark.js";
export { buildCurrentState, emptyState } from "./current-state.js";
export type {
  AgenomeRow,
  BuildCurrentStateInput,
  BuiltCurrentState,
  CandidateRow,
  CheckResultRow,
  CriticReviewRow,
  CurrentState,
  FitnessRow,
  GenerationRow,
  LineageEdge,
  NoveltyRow,
  RunRow,
} from "./current-state.js";
export { buildLineageGraph } from "./lineage-graph.js";
export type { BuildLineageGraphInput, BuiltLineageGraph } from "./lineage-graph.js";
export { buildReplaySummary } from "./replay-summary.js";
export type {
  BuildReplaySummaryInput,
  BuiltReplaySummary,
  ReplaySummary,
  TopCandidateEntry,
} from "./replay-summary.js";
export { buildRunHealth } from "./run-health.js";
export type { BuildRunHealthInput, RunHealth, RunHealthStatus } from "./run-health.js";
