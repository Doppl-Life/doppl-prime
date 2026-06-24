/**
 * The single typed seam between the dashboard and the frozen `@doppl/contracts` package. Every UI
 * module imports its schemas THROUGH this file (never redefines them — lesson L5 spirit). Each name
 * is both the runtime Zod schema (used to validate-at-boundary, safety rule #9) and its inferred
 * type (consumed by the view layer). The dashboard is a read-only consumer; it defines no
 * Appendix-A model.
 *
 * NOTE — GET /runs/:id/health is intentionally absent: the §11 health signal has no frozen contract
 * yet (it is API-owned, P6.8). Its client method + schema are deferred to P7.14 (health/diagnostics
 * panel), built against the real shape rather than a web-local guess.
 */
export {
  Run,
  RunStatus,
  RunConfig,
  RunCaps,
  GenerationOperator,
  RunEventEnvelope,
  RunEventType,
  CandidateIdea,
  CheckResult,
  CriticMandate,
  CriticReview,
  EnergyEvent,
  FitnessScore,
  NoveltyScore,
  JudgeResult,
  LlmCallTelemetry,
  LineageGraphProjection,
  LineageNode,
  LineageEdge,
  LineageNodeType,
  ModelRoute,
} from '@doppl/contracts';
