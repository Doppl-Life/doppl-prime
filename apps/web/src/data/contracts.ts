/**
 * Re-exports of the Zod schemas Phase 7 consumes. The web app NEVER
 * defines its own Appendix-A models — every payload is parsed through
 * these schemas at the seam.
 *
 * RunHealth is currently a TS-only type on the server (Phase 6
 * apps/api/src/projections/run-health.ts); we mirror its shape in a
 * local Zod schema here so the typed-client invariant holds at every
 * payload boundary. Mirror MUST stay in sync — if the server shape
 * changes, this schema is the single failure point in CI.
 */

import { z } from "zod";

export {
  Agenome,
  AgenomeStatus,
  CandidateIdea,
  CandidateStatus,
  CheckResult,
  CheckStatus,
  CriticMandate,
  CriticReview,
  EvidenceRef,
  EvidenceKind,
  FitnessScore,
  LineageEdge,
  LineageGraphProjection,
  LineageNode,
  LineageNodeType,
  ModelRole,
  NoveltyScore,
  RunCaps,
  RunConfig,
  RunEventEnvelope,
  RunEventType,
  RunStatus,
  ScoringPolicy,
  SubtypeName,
} from "@doppl/contracts";

export type {
  Agenome as AgenomeT,
  CandidateIdea as CandidateIdeaT,
  CheckResult as CheckResultT,
  CriticReview as CriticReviewT,
  EvidenceRef as EvidenceRefT,
  FitnessScore as FitnessScoreT,
  LineageEdge as LineageEdgeT,
  LineageGraphProjection as LineageGraphProjectionT,
  LineageNode as LineageNodeT,
  ModelRole as ModelRoleT,
  NoveltyScore as NoveltyScoreT,
  RunCaps as RunCapsT,
  RunConfig as RunConfigT,
  RunEventEnvelope as RunEventEnvelopeT,
  RunEventType as RunEventTypeT,
  ScoringPolicy as ScoringPolicyT,
  SubtypeName as SubtypeNameT,
} from "@doppl/contracts";

/**
 * GET /runs/:id/health response shape. Mirrors the server's RunHealth
 * type. Refresh this schema if the server shape changes.
 */
export const RunHealth = z
  .object({
    runId: z.string().min(1),
    status: z.enum([
      "configured",
      "running",
      "completed",
      "stopped",
      "failed",
      "cancelled",
      "stalled",
      "unknown",
    ]),
    currentGeneration: z.number().int().nonnegative(),
    candidatesInFlight: z.number().int().nonnegative(),
    lastEventOccurredAt: z.string().nullable(),
    capsConsumed: z
      .object({
        energy: z.number().nonnegative(),
        generations: z.number().int().nonnegative(),
        candidates: z.number().int().nonnegative(),
        toolCalls: z.number().int().nonnegative(),
      })
      .strict(),
    lastHeartbeatMs: z.number().nullable(),
  })
  .strict();
export type RunHealth = z.infer<typeof RunHealth>;

/** GET /runs list shape. */
export const RunListEntry = z
  .object({
    id: z.string().min(1),
    status: z.string().min(1),
    configuredAt: z.string().min(1),
    runMode: z.string().min(1).optional(),
    completedAt: z.string().nullable().optional(),
    problemTitle: z.string().nullable().optional(),
    terminalSummary: z.string().nullable().optional(),
  })
  .strict();
export type RunListEntry = z.infer<typeof RunListEntry>;

export const RunListResponse = z.object({ runs: z.array(RunListEntry) }).strict();
export type RunListResponse = z.infer<typeof RunListResponse>;

/** GET /runs/:id/events response shape. */
export const EventsListResponse = z
  .object({
    runId: z.string().min(1),
    events: z.array(z.unknown()), // each event re-parsed via RunEventEnvelope at use site
    count: z.number().int().nonnegative(),
  })
  .strict();
export type EventsListResponse = z.infer<typeof EventsListResponse>;

/** GET /model-routes shape. */
export const ModelRoutesResponse = z
  .object({
    routes: z.array(
      z
        .object({
          role: z.string().min(1),
          provider: z.string().min(1).optional(),
          modelId: z.string().min(1).optional(),
          capabilities: z
            .object({
              structuredOutputs: z.boolean().optional(),
              jsonMode: z.boolean().optional(),
              streamable: z.boolean().optional(),
            })
            .partial()
            .optional(),
          fallbackRouteIds: z.array(z.string()).optional(),
          error: z.string().optional(),
        })
        .strict(),
    ),
  })
  .strict();
export type ModelRoutesResponse = z.infer<typeof ModelRoutesResponse>;
