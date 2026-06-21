import { validRunEventEnvelope } from '@doppl/contracts';
import type { RunEventEnvelope, RunEventType } from '@doppl/contracts';
import type { RunClient } from '../../src/data/runClient';
import type { EventSourceLike } from '../../src/data/sseStream';

/** Build a RunEventEnvelope with an explicit sequence + type, defaulting the rest from the canonical
 *  envelope fixture. occurredAt is derived from sequence (ascending) so a test can prove ordering is
 *  by `sequence`, not occurredAt. */
export function makeEvent(
  sequence: number,
  type: RunEventType,
  overrides: Partial<RunEventEnvelope> = {},
): RunEventEnvelope {
  return {
    ...validRunEventEnvelope,
    id: `evt_${sequence}`,
    sequence,
    type,
    occurredAt: `2026-06-20T12:00:${String(sequence).padStart(2, '0')}.000Z`,
    ...overrides,
  };
}

/** The 7 failure / terminal event types that must be retained + surfaced (REQ-O-002). */
export const FAILURE_EVENT_FIXTURE_TYPES: readonly RunEventType[] = [
  'provider_call_failed',
  'output_schema_rejected',
  'candidate_invalidated',
  'energy_exhausted',
  'generation_failed',
  'reproduction_aborted_insufficient_parents',
  'novelty_scoring_degraded',
];

/** A recording fake RunClient exposing only `getEvents` (all the store's resync/poll path needs). */
export function fakeRunClient(
  getEvents: (
    runId: string,
    opts?: { sinceSequence?: number },
  ) => RunEventEnvelope[] | Promise<RunEventEnvelope[]>,
): RunClient & { calls: { runId: string; opts: { sinceSequence?: number } | undefined }[] } {
  const calls: { runId: string; opts: { sinceSequence?: number } | undefined }[] = [];
  const client = {
    getEvents: (runId: string, opts?: { sinceSequence?: number }) => {
      calls.push({ runId, opts });
      return Promise.resolve(getEvents(runId, opts));
    },
  } as unknown as RunClient;
  return Object.assign(client, { calls });
}

/** A fake EventSource (injected transport double) — captures its url + lets a test push envelopes. */
export class FakeEventSource implements EventSourceLike {
  readonly url: string;
  closed = false;
  private readonly listeners: ((e: { data: string }) => void)[] = [];
  constructor(url: string) {
    this.url = url;
  }
  addEventListener(_type: 'message', listener: (e: { data: string }) => void): void {
    this.listeners.push(listener);
  }
  close(): void {
    this.closed = true;
  }
  emit(envelope: RunEventEnvelope): void {
    const data = JSON.stringify(envelope);
    for (const cb of this.listeners) cb({ data });
  }
}
