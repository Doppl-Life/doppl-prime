import type { StructuredOutputResult } from "@doppl/api/model-gateway";
import type { CandidateStatus } from "@doppl/contracts";
import type { AppendEventInput, AppendEventResult } from "../event-store/append.js";
import { CandidateStateMachine } from "./state-machines/candidate.js";

/**
 * Wires Phase 2's `pipeStructuredOutput` result into the candidate
 * lifecycle (P3.8). Three terminal paths:
 *
 *   - {ok: true, repairAttempts: 0} → created → under_review.
 *   - {ok: true, repairAttempts: 1} → created → under_review.
 *     The successful-repair edge does NOT emit a kernel-side event —
 *     Phase 2 U4 already silently absorbs the repair, and the closed
 *     RunEventType registry from Phase 0 has no "candidate.repairing".
 *     The plan's intermediate "repairing" status is conceptual.
 *   - {ok: false, repairAttempts: 1} → created → invalid +
 *     `candidate_invalidated` event (the gateway already emitted
 *     `output_schema_rejected` per Phase 2 U4 — this is the matching
 *     candidate-side event so projections see both halves).
 *
 * Energy is never debited from this helper — Phase 2 U4 is responsible
 * for the success-only `energy.spent` emission and never emits one on
 * the rejection path. This helper additionally never emits energy
 * itself.
 */
export interface HandleStructuredOutputOptions<T> {
  candidateId: string;
  runId: string;
  correlationId: string;
  role: string;
  generationId?: string;
  agenomeId?: string;
  currentStatus: CandidateStatus;
  result: StructuredOutputResult<T>;
  appendEvent: (input: AppendEventInput) => Promise<AppendEventResult>;
}

export interface HandleStructuredOutputResult {
  nextStatus: CandidateStatus;
}

export async function handleStructuredOutput<T>(
  options: HandleStructuredOutputOptions<T>,
): Promise<HandleStructuredOutputResult> {
  if (options.result.ok) {
    // Both first-try success and repair-then-accept land here.
    const nextStatus = CandidateStateMachine.transition(options.currentStatus, "under_review");
    return { nextStatus };
  }

  // Repair failed: transition to invalid + emit candidate_invalidated.
  const nextStatus = CandidateStateMachine.transition(options.currentStatus, "invalid");
  await options.appendEvent({
    runId: options.runId,
    type: "candidate_invalidated",
    actor: "runtime",
    payload: {
      candidateId: options.candidateId,
      reason: options.result.validationError,
    },
    candidateId: options.candidateId,
    correlationId: options.correlationId,
    ...(options.generationId !== undefined ? { generationId: options.generationId } : {}),
    ...(options.agenomeId !== undefined ? { agenomeId: options.agenomeId } : {}),
  });
  return { nextStatus };
}
