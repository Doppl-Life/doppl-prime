import { z } from "zod";

/**
 * Closed registry of every lifecycle + failure/terminal event type emitted
 * by the Doppl runtime. Per ARCHITECTURE.md §4 and IMPLEMENTATION_PLAN.md
 * P0.1, this enum is the authoritative cross-track contract: any unlisted
 * value is rejected at the envelope boundary.
 *
 * Naming convention is preserved verbatim from IMPLEMENTATION_PLAN.md line
 * 161 — lifecycle types use dot.notation (run.configured, agenome.spawned);
 * failure/terminal types use underscore_form (provider_call_failed,
 * energy_exhausted). Both are opaque string enum values to the schema.
 */
export const RunEventTypeValues = [
  "run.configured",
  "run.started",
  "run.completed",
  "run.failed",
  "run.stopped",
  "generation.started",
  "generation.completed",
  "agenome.spawned",
  "agenome.fused",
  "agenome.mutated",
  "agenome.reproduced",
  "candidate.created",
  "critic.reviewed",
  "check.completed",
  "novelty.scored",
  "fitness.scored",
  "lineage.culled",
  "energy.spent",
  "provider_call_failed",
  "output_schema_rejected",
  "candidate_invalidated",
  "energy_exhausted",
  "generation_failed",
  "reproduction_aborted_insufficient_parents",
  "novelty_scoring_degraded",
] as const;

export const RunEventType = z.enum(RunEventTypeValues);
export type RunEventType = z.infer<typeof RunEventType>;
