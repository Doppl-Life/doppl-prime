import type { RunEventType } from '@doppl/contracts';
import type { RunEventRow } from '../../event-store';

/**
 * P3.12 — sequence-watermark idempotency (ARCHITECTURE.md §5 "every job is idempotent, guarded by
 * event-sequence checks" + §4 per-run monotonic `sequence`). PURE over the persisted log: a step whose
 * events already exist is a no-op (no double-append, no double `energy.spent` debit — rule #8). Keys off the
 * PERSISTED log / sequence watermark, never the loop's in-memory `eventSeq` counter (which resets per call).
 */

/** The max persisted per-run `sequence` (the idempotency watermark); -1 for an empty log. */
export function sequenceWatermark(log: readonly RunEventRow[]): number {
  let max = -1;
  for (const row of log) if (row.sequence > max) max = row.sequence;
  return max;
}

/** Identifies a step by the event it would emit (+ optional correlation scope). */
export interface StepMatch {
  readonly type: RunEventType;
  readonly generationId?: string;
  readonly agenomeId?: string;
  readonly candidateId?: string;
}

/** Whether a step's event is already present in the log (matched by type + any supplied scope). */
export function stepAlreadyRecorded(log: readonly RunEventRow[], match: StepMatch): boolean {
  return log.some(
    (row) =>
      row.type === match.type &&
      (match.generationId === undefined || row.generationId === match.generationId) &&
      (match.agenomeId === undefined || row.agenomeId === match.agenomeId) &&
      (match.candidateId === undefined || row.candidateId === match.candidateId),
  );
}

export type StepDecision =
  | { readonly run: true }
  | { readonly run: false; readonly reason: 'already_recorded' };

/** Idempotency guard: a step whose events already exist is skipped (no-op), else it runs. */
export function guardStep(log: readonly RunEventRow[], match: StepMatch): StepDecision {
  return stepAlreadyRecorded(log, match)
    ? { run: false, reason: 'already_recorded' }
    : { run: true };
}
