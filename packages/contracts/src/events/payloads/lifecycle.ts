import { z } from "zod";
import { RunConfig } from "../../run/run-config.js";

/**
 * Lifecycle payload shapes — what each run.* / generation.* event carries
 * beyond the envelope's runId/generationId. Minimal by design: the
 * authoritative entity state is reconstructed by projections folding the
 * event stream; payloads carry only what's incremental.
 */

export const RunConfiguredPayload = z.object({ config: RunConfig }).strict();

export const RunStartedPayload = z.object({ startedAt: z.string().datetime() }).strict();

export const RunCompletedPayload = z
  .object({
    completedAt: z.string().datetime(),
    terminalSummary: z.string().optional(),
  })
  .strict();

export const RunFailedPayload = z
  .object({
    completedAt: z.string().datetime(),
    reason: z.string().min(1),
  })
  .strict();

export const RunStoppedPayload = z
  .object({
    completedAt: z.string().datetime(),
    reason: z.string().min(1),
  })
  .strict();

export const GenerationStartedPayload = z
  .object({ index: z.number().int().nonnegative() })
  .strict();

export const GenerationCompletedPayload = z
  .object({
    completedAt: z.string().datetime(),
    candidateCount: z.number().int().nonnegative(),
  })
  .strict();
