import type { RunClient } from '../data/runClient';
import { foldEvents } from './reducer';
import type { ViewState } from './reducer';

/**
 * Guard the resync cursor: reject a non-integer or negative `sinceSequence` BEFORE any fetch (the
 * P7.1 [low] consumed here). The cursor is a per-run `sequence` watermark — always a nonnegative
 * integer; a corrupt value must fail fast rather than be forwarded to the backend query.
 */
export function assertValidCursor(sinceSequence: number): void {
  if (!Number.isInteger(sinceSequence) || sinceSequence < 0) {
    throw new RangeError(`Invalid resync cursor: ${String(sinceSequence)}`);
  }
}

/**
 * Sequence-keyed resync: fetch the events AFTER the last applied `sequence` and fold them onto the
 * current state, reaching the same state a fresh full load would (SSE is non-authoritative — drop +
 * resync is equivalent to an uninterrupted stream, safety rule #2). A null watermark fetches the
 * full event log.
 */
export async function resyncFromRest(
  runClient: RunClient,
  runId: string,
  current: ViewState,
): Promise<ViewState> {
  if (current.lastSequence === null) {
    return foldEvents(await runClient.getEvents(runId), current);
  }
  assertValidCursor(current.lastSequence);
  const events = await runClient.getEvents(runId, { sinceSequence: current.lastSequence });
  return foldEvents(events, current);
}

/** Polling fallback: one REST poll is a resync from the current watermark — preserves applied state. */
export const pollOnce = resyncFromRest;
