import type { ZodTypeAny } from "zod";
import type { RunEventType } from "../event-type.js";
import {
  AgenomeFusedPayload,
  AgenomeMutatedPayload,
  AgenomeReproducedPayload,
  AgenomeSpawnedPayload,
} from "./agenome.js";
import { EnergySpentPayload } from "./energy.js";
import {
  CandidateInvalidatedPayload,
  EnergyExhaustedPayload,
  GenerationFailedPayload,
  NoveltyScoringDegradedPayload,
  OutputSchemaRejectedPayload,
  ProviderCallFailedPayload,
  ReproductionAbortedInsufficientParentsPayload,
} from "./failures.js";
import {
  GenerationCompletedPayload,
  GenerationStartedPayload,
  RunCompletedPayload,
  RunConfiguredPayload,
  RunFailedPayload,
  RunStartedPayload,
  RunStoppedPayload,
} from "./lifecycle.js";
import { FitnessScoredPayload, LineageCulledPayload, NoveltyScoredPayload } from "./scoring.js";
import {
  CandidateCreatedPayload,
  CheckCompletedPayload,
  CriticReviewedPayload,
} from "./verification.js";

/**
 * RunEventPayloadMap — the per-RunEventType payload schema lookup.
 *
 * Implemented as a const-typed plain object keyed by RunEventType enum
 * values. The `satisfies` constraint at the bottom is the exhaustiveness
 * pin: if a future RunEventType is added without a matching entry here,
 * TypeScript fails the type-check at the `satisfies` line. This is the
 * §2.5 cross-track guarantee that the event-type registry and the
 * payload-shape map never drift.
 *
 * Payloads are deliberately minimal. The authoritative entity state is
 * reconstructed by projections folding the event stream; per-type
 * payloads carry only what's incremental beyond the envelope.
 */
export const RunEventPayloadMap = {
  "run.configured": RunConfiguredPayload,
  "run.started": RunStartedPayload,
  "run.completed": RunCompletedPayload,
  "run.failed": RunFailedPayload,
  "run.stopped": RunStoppedPayload,
  "generation.started": GenerationStartedPayload,
  "generation.completed": GenerationCompletedPayload,
  "agenome.spawned": AgenomeSpawnedPayload,
  "agenome.fused": AgenomeFusedPayload,
  "agenome.mutated": AgenomeMutatedPayload,
  "agenome.reproduced": AgenomeReproducedPayload,
  "candidate.created": CandidateCreatedPayload,
  "critic.reviewed": CriticReviewedPayload,
  "check.completed": CheckCompletedPayload,
  "novelty.scored": NoveltyScoredPayload,
  "fitness.scored": FitnessScoredPayload,
  "lineage.culled": LineageCulledPayload,
  "energy.spent": EnergySpentPayload,
  provider_call_failed: ProviderCallFailedPayload,
  output_schema_rejected: OutputSchemaRejectedPayload,
  candidate_invalidated: CandidateInvalidatedPayload,
  energy_exhausted: EnergyExhaustedPayload,
  generation_failed: GenerationFailedPayload,
  reproduction_aborted_insufficient_parents: ReproductionAbortedInsufficientParentsPayload,
  novelty_scoring_degraded: NoveltyScoringDegradedPayload,
} as const satisfies Record<z.infer<typeof RunEventType>, ZodTypeAny>;

import type { z } from "zod";

export type RunEventPayloadFor<T extends z.infer<typeof RunEventType>> = z.infer<
  (typeof RunEventPayloadMap)[T]
>;

/**
 * Look up the payload schema for an event type and parse a raw payload
 * against it. Throws ZodError (the schema's own validation error) when
 * the payload doesn't match.
 */
export function parseEventPayload<T extends z.infer<typeof RunEventType>>(
  type: T,
  raw: unknown,
): RunEventPayloadFor<T> {
  const schema = RunEventPayloadMap[type] as ZodTypeAny;
  return schema.parse(raw) as RunEventPayloadFor<T>;
}
