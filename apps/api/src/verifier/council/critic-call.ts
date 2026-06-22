import { z } from 'zod';
import { CriticReview, CURRENT_SCHEMA_VERSION, EvidenceRef } from '@doppl/contracts';
import type { CandidateIdea, CriticMandate } from '@doppl/contracts';
import { assembleIsolatedRequest } from '../isolation/candidate-as-data';
import type { ModelGateway } from '../../model-gateway';
import type { AppendInput, EventStore } from '../../event-store';

/**
 * P4.6 critic council — the per-mandate critic call (ARCHITECTURE.md §7/§14/§4). For one mandate:
 * emit the `critic.review_started` marker → assemble the request via the P4.4 isolation seam (candidate
 * as sentinel-wrapped DATA) under the `critic` ModelRole → `gateway.call` → assemble + validate a
 * `CriticReview` (the COUNCIL sets the trusted identity; the model fills only evidence) → emit
 * `critic.reviewed`, OR persist `output_schema_rejected` and return null (no fabricated review).
 *
 * KEY SAFETY RULE #5 (candidate is DATA, never instructions — via the seam, no bypass), #6 (emit-only —
 * the model never controls its review's identity; the council can't select/mutate/alter policy), #8 (the
 * marker debits NO energy — energy is P3's ledger). Persists ONLY through the EventStore port (no raw
 * run_events write — forbidden #4). `runContext` is injected (no P3 dependency).
 */

/** Run / generation / candidate correlation injected by the caller (P3 verifying phase / P4.7 rotation). */
export interface CouncilRunContext {
  runId: string;
  generationId: string;
  candidateId: string;
}

/**
 * Permissive critic-model-output schema (council-local — NOT the frozen `CriticReview`). The model fills
 * ONLY the evidence fields; `z.object` STRIPS any model-sent id/candidateId/mandate/authority field, so a
 * candidate/agent can never make the model control its own review's identity (rule #6 reward-hacking
 * defense). The council sets the trusted identity itself.
 */
const CriticModelOutput = z.object({
  critique: z.string().min(1),
  confidence: z.number().min(0).max(1),
  scores: z.record(z.string(), z.number()).optional(),
  evidenceRefs: z.array(EvidenceRef).optional(),
});

export interface RunCriticCallParams {
  gateway: ModelGateway;
  store: EventStore;
  candidate: CandidateIdea;
  mandate: CriticMandate;
  instruction: string;
  runContext: CouncilRunContext;
}

/** Deterministic, replay-faithful review id (no random/clock) — stable per (run, candidate, mandate). */
function reviewIdFor(runContext: CouncilRunContext, mandate: CriticMandate): string {
  return `critic-review:${runContext.runId}:${runContext.candidateId}:${mandate}`;
}

/** Canonical deterministic serialization of the candidate as untrusted DATA (the whole idea as data). */
export function serializeCandidate(candidate: CandidateIdea): string {
  return JSON.stringify({
    title: candidate.title,
    summary: candidate.summary,
    claims: candidate.claims,
    subtypePayload: candidate.subtypePayload,
  });
}

function baseEnvelope(
  id: string,
  type: AppendInput['type'],
  runContext: CouncilRunContext,
  payload: Record<string, unknown>,
): AppendInput {
  return {
    id,
    runId: runContext.runId,
    generationId: runContext.generationId,
    candidateId: runContext.candidateId,
    type,
    actor: 'critic',
    payload,
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
}

export async function runCriticCall(params: RunCriticCallParams): Promise<CriticReview | null> {
  const { gateway, store, candidate, mandate, instruction, runContext } = params;
  const reviewId = reviewIdFor(runContext, mandate);

  // 1. critic.review_started marker (actor critic, generic payload, NO energy) — BEFORE the call.
  await store.append(
    baseEnvelope(`${reviewId}:started`, 'critic.review_started', runContext, {
      mandate,
      candidateId: runContext.candidateId,
    }),
  );

  // 2. Build the critic request ONLY via the isolation seam (candidate as sentinel-wrapped DATA).
  const request = assembleIsolatedRequest({
    role: 'critic',
    instruction,
    candidate: serializeCandidate(candidate),
    schema: CriticModelOutput,
  });
  const response = await gateway.call(request);

  // 3. Rejected / un-assemblable output → output_schema_rejected, NO review (never a fabricated one).
  const emitRejected = async (reason: string): Promise<null> => {
    const rejected = baseEnvelope(`${reviewId}:rejected`, 'output_schema_rejected', runContext, {
      mandate,
      candidateId: runContext.candidateId,
      reason,
    });
    rejected.correlationId = response.providerMeta.gatewayRequestId;
    await store.append(rejected);
    return null;
  };
  if (!response.accepted) {
    return emitRejected(response.rejection?.reason ?? 'rejected');
  }
  const evidence = CriticModelOutput.safeParse(response.output);
  if (!evidence.success) {
    return emitRejected('critic_output_unassemblable');
  }

  // 4. Assemble + validate the CriticReview — the COUNCIL sets the trusted identity; the model filled
  //    only evidence; absent scores/evidenceRefs default to {}/[] (lesson 6 permissive).
  const review: CriticReview = CriticReview.parse({
    id: reviewId,
    candidateId: runContext.candidateId,
    mandate,
    scores: evidence.data.scores ?? {},
    critique: evidence.data.critique,
    confidence: evidence.data.confidence,
    evidenceRefs: evidence.data.evidenceRefs ?? [],
  });

  // 5. critic.reviewed (payload = the validated review) with the provider-call correlation handle +
  //    langfuse trace id (when present). The full ProviderMeta rides P3's EnergyEvent (rule #8).
  const reviewed = baseEnvelope(`${reviewId}:reviewed`, 'critic.reviewed', runContext, review);
  reviewed.correlationId = response.providerMeta.gatewayRequestId;
  if (response.langfuseTraceId !== undefined) {
    reviewed.langfuseTraceId = response.langfuseTraceId;
  }
  await store.append(reviewed);

  return review;
}
