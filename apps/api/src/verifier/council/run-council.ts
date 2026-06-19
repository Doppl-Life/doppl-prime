import { type CriticMandate, CriticMandateValues, type CriticReview } from "@doppl/contracts";
import type { AppendEventInput, AppendEventResult } from "../../event-store/append.js";
import type { ModelGateway } from "../../model-gateway/gateway.js";
import { criticCall } from "./critic-call.js";

/**
 * Critic council orchestrator (IMPLEMENTATION_PLAN.md P4.6). Runs all
 * five CriticMandate values per candidate, gateway-routed under the
 * critic role, schema-validated and persisted via U3's `criticCall`.
 *
 * Parallelism shape: candidates in parallel (Promise.all), mandates
 * serial within each candidate. Serial within a candidate keeps the
 * critic.reviewed event sequence ordered per (candidate, generation);
 * parallel across candidates keeps wall-clock bounded for the demo.
 *
 * The return type is structurally `CriticReview[]` — no winner, no score
 * mutation, no policy mutation. Adding such a field would require
 * widening the return type, which `apps/api/src/__tests__/verifier-
 * surface.test.ts` (U11) pins against drift.
 */

export type CriticAssignment = Record<CriticMandate, string>;

export interface CouncilCandidate {
  candidateId: string;
  candidate: unknown;
}

export interface RunCouncilInput {
  gateway: ModelGateway;
  appendEvent: (input: AppendEventInput) => Promise<AppendEventResult>;
  candidates: CouncilCandidate[];
  criticAssignment: CriticAssignment;
  rubricByMandate: Record<CriticMandate, string>;
  runId: string;
  generationId: string;
  correlationIdFor: (candidateId: string, mandate: CriticMandate) => string;
}

export async function runCouncil(input: RunCouncilInput): Promise<CriticReview[]> {
  const perCandidate = input.candidates.map(async ({ candidateId, candidate }) => {
    const reviewsForCandidate: CriticReview[] = [];
    for (const mandate of CriticMandateValues) {
      const result = await criticCall({
        gateway: input.gateway,
        appendEvent: input.appendEvent,
        mandate,
        rubricTemplate: input.rubricByMandate[mandate],
        candidate,
        candidateId,
        criticAgenomeId: input.criticAssignment[mandate],
        runId: input.runId,
        generationId: input.generationId,
        correlationId: input.correlationIdFor(candidateId, mandate),
      });
      if (result.ok) {
        reviewsForCandidate.push(result.review);
      }
      // Rejected/failed mandates leave no review in the return array; their
      // failure events were already persisted by criticCall.
    }
    return reviewsForCandidate;
  });

  const batches = await Promise.all(perCandidate);
  return batches.flat();
}
