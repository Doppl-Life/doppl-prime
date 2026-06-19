import { z } from "zod";
import { Actor } from "./actor.js";
import { RunEventType } from "./event-type.js";

/**
 * RunEventEnvelope — the universal append-only event shape. `sequence` is
 * the sole ordering key (per-run monotonic int). `occurredAt` is
 * display/analytics-only and never used for ordering (ARCHITECTURE.md §4).
 *
 * `payload` is z.unknown() at envelope level; per-type narrowing is
 * provided by events/payloads/per-type-map.ts (U13). Readers must accept
 * any envelope whose schemaVersion is <= CONTRACTS_SCHEMA_VERSION
 * (forward-compatibility — ARCHITECTURE.md §4).
 */
export const RunEventEnvelope = z
  .object({
    id: z.string().min(1),
    runId: z.string().min(1),
    generationId: z.string().min(1).optional(),
    agenomeId: z.string().min(1).optional(),
    candidateId: z.string().min(1).optional(),
    type: RunEventType,
    sequence: z.number().int().nonnegative(),
    occurredAt: z.string().datetime(),
    actor: Actor,
    correlationId: z.string().min(1).optional(),
    langfuseTraceId: z.string().min(1).optional(),
    langfuseObservationId: z.string().min(1).optional(),
    payload: z.unknown(),
    schemaVersion: z.number().int().positive(),
  })
  .strict();
export type RunEventEnvelope = z.infer<typeof RunEventEnvelope>;
