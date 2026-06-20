import { z } from 'zod';
import { Actor } from './actor';
import { RunEventType } from './event-type';

/**
 * RunEventEnvelope — the append-only `run_events` row shape (ARCHITECTURE.md §4 / Appendix A).
 *
 * Strict object: unknown keys are rejected, never stripped. `sequence` is the SOLE ordering key
 * (per-run monotonic integer ≥ 0); `occurredAt` is an ISO-8601 UTC string treated as
 * display/analytics-only and never used for ordering. `payload` is the generic JSON object at
 * envelope level; per-type narrowing is layered later by P0.10. Exactly 14 fields:
 * 8 required, 6 optional.
 */
export const RunEventEnvelope = z.strictObject({
  id: z.string().min(1),
  runId: z.string().min(1),
  generationId: z.string().min(1).optional(),
  agenomeId: z.string().min(1).optional(),
  candidateId: z.string().min(1).optional(),
  type: RunEventType,
  sequence: z.int().nonnegative(),
  occurredAt: z.iso.datetime(),
  actor: Actor,
  correlationId: z.string().min(1).optional(),
  langfuseTraceId: z.string().min(1).optional(),
  langfuseObservationId: z.string().min(1).optional(),
  payload: z.record(z.string(), z.unknown()),
  schemaVersion: z.int().positive(),
});

export type RunEventEnvelope = z.infer<typeof RunEventEnvelope>;
