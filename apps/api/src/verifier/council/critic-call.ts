import { randomUUID } from "node:crypto";
import { type CriticMandate, CriticReview, EvidenceRef } from "@doppl/contracts";
import { z } from "zod";
import type { AppendEventInput, AppendEventResult } from "../../event-store/append.js";
import type { ModelGateway } from "../../model-gateway/gateway.js";
import { pipeStructuredOutput } from "../../model-gateway/structured-output.js";
import { assembleCriticRequest } from "../isolation/candidate-as-data.js";

/**
 * Critic-call primitive (IMPLEMENTATION_PLAN.md P4.6 — per-mandate
 * gateway hop). Builds a critic ModelGatewayRequest through U1's
 * candidate-as-DATA chokepoint, calls the gateway under role=critic, pipes
 * the raw output through Phase 2's `pipeStructuredOutput` (accept /
 * repair≤1 / reject), and persists a `critic.reviewed` event on accept.
 *
 * The model emits only the EVIDENCE fields (scores, critique, confidence,
 * evidenceRefs). The trusted metadata (id, candidateId, mandate) is
 * stamped by this helper — a model output asserting a different
 * candidateId or mandate is silently ignored. This closes a path where a
 * malicious candidate could try to re-target its own review.
 */

const CriticReviewModelOutput = z
  .object({
    scores: z.record(z.string(), z.number()),
    critique: z.string(),
    confidence: z.number().min(0).max(1),
    evidenceRefs: z.array(EvidenceRef),
  })
  .strict();

export interface CriticCallInput {
  gateway: ModelGateway;
  appendEvent: (input: AppendEventInput) => Promise<AppendEventResult>;
  mandate: CriticMandate;
  rubricTemplate: string;
  candidate: unknown;
  candidateId: string;
  criticAgenomeId: string;
  runId: string;
  generationId: string;
  correlationId: string;
}

export type CriticCallResult =
  | { ok: true; review: import("@doppl/contracts").CriticReview }
  | { ok: false; reason: "provider_failed" | "schema_rejected"; detail?: string };

export async function criticCall(input: CriticCallInput): Promise<CriticCallResult> {
  const request = assembleCriticRequest({
    mandate: input.mandate,
    rubricTemplate: input.rubricTemplate,
    candidate: input.candidate,
    common: {
      runId: input.runId,
      correlationId: input.correlationId,
      generationId: input.generationId,
      agenomeId: input.criticAgenomeId,
      candidateId: input.candidateId,
    },
  });

  let firstResponse: import("@doppl/contracts").ModelGatewayResponse;
  try {
    firstResponse = await input.gateway.invoke(request);
  } catch (_err) {
    return { ok: false, reason: "provider_failed" };
  }
  if (!firstResponse.ok) {
    return {
      ok: false,
      reason: "provider_failed",
      ...(firstResponse.validationError !== undefined
        ? { detail: firstResponse.validationError }
        : {}),
    };
  }

  const piped = await pipeStructuredOutput({
    raw: firstResponse.output,
    schema: CriticReviewModelOutput,
    repair: async () => {
      const repaired = await input.gateway.invoke(request);
      return repaired.output;
    },
    ctx: {
      appendEvent: input.appendEvent,
      runId: input.runId,
      correlationId: input.correlationId,
      role: "critic",
      routeId: "critic",
      generationId: input.generationId,
      agenomeId: input.criticAgenomeId,
      candidateId: input.candidateId,
      ...(firstResponse.providerTraceId !== undefined
        ? { langfuseTraceId: firstResponse.providerTraceId }
        : {}),
      ...(firstResponse.langfuseObservationId !== undefined
        ? { langfuseObservationId: firstResponse.langfuseObservationId }
        : {}),
    },
  });

  if (!piped.ok) {
    return { ok: false, reason: "schema_rejected", detail: piped.validationError };
  }

  // Stamp trusted metadata + validate the full CriticReview.
  const review = CriticReview.parse({
    id: `crit_${randomUUID()}`,
    candidateId: input.candidateId,
    mandate: input.mandate,
    scores: piped.output.scores,
    critique: piped.output.critique,
    confidence: piped.output.confidence,
    evidenceRefs: piped.output.evidenceRefs,
  });

  await input.appendEvent({
    runId: input.runId,
    type: "critic.reviewed",
    actor: "critic",
    payload: { review },
    correlationId: input.correlationId,
    generationId: input.generationId,
    agenomeId: input.criticAgenomeId,
    candidateId: input.candidateId,
    ...(firstResponse.providerTraceId !== undefined
      ? { langfuseTraceId: firstResponse.providerTraceId }
      : {}),
    ...(firstResponse.langfuseObservationId !== undefined
      ? { langfuseObservationId: firstResponse.langfuseObservationId }
      : {}),
  });

  return { ok: true, review };
}
