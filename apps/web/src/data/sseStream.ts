import { RunEventEnvelope } from './contracts';
import { PayloadValidationError, parseOrThrow } from './errors';

/**
 * SSE consumer for the §11 run-event stream. SSE is NON-AUTHORITATIVE delivery only (safety rule
 * #2): events are ordered + de-duplicated by per-run `sequence` ALONE — never by wall-clock
 * `occurredAt` — and the stream carries `lastEventId == last applied sequence` so a reconnect
 * resumes from that watermark. Dropping the stream loses no authoritative state: the same events
 * re-folded from the REST events/replay path reach the identical view. Each payload is Zod-validated
 * at the boundary; a failure surfaces as a typed `PayloadValidationError` (the bad event is dropped,
 * the watermark unchanged) rather than corrupting view state (§12).
 *
 * The fold here is EVENT-level (ordered/deduped envelopes + the watermark). The entity/view-state
 * reducer (folding events into run/candidate/lineage rows) is P7.2 and reuses this core.
 */

/** The minimal structural shape of an `EventSource` this stream depends on (injected for tests). */
export interface EventSourceLike {
  addEventListener(type: 'message', listener: (event: { data: string }) => void): void;
  close(): void;
}

export interface FoldState {
  readonly lastSequence: number | null;
  readonly events: readonly RunEventEnvelope[];
}

export const emptyFoldState: FoldState = { lastSequence: null, events: [] };

/**
 * Apply one envelope by the MONOTONIC-WATERMARK rule: accept iff `sequence > lastApplied`; anything
 * `<=` the watermark (a duplicate OR a late lower sequence) is dropped; `occurredAt` is never
 * consulted. Idempotent — re-applying an already-seen sequence returns the same state reference.
 */
export function applyEnvelope(state: FoldState, envelope: RunEventEnvelope): FoldState {
  if (state.lastSequence !== null && envelope.sequence <= state.lastSequence) {
    return state;
  }
  return { lastSequence: envelope.sequence, events: [...state.events, envelope] };
}

/** Fold a batch of envelopes (e.g. a REST events/replay resync) through the watermark rule. */
export function foldEvents(
  envelopes: readonly RunEventEnvelope[],
  initial: FoldState = emptyFoldState,
): FoldState {
  return envelopes.reduce(applyEnvelope, initial);
}

export interface SseStreamOptions {
  url: string;
  /** Injected EventSource factory; defaults are wired by the caller (P7.2+ / integration). */
  eventSourceFactory: (url: string) => EventSourceLike;
  onEvent: (envelope: RunEventEnvelope) => void;
  onError?: (error: PayloadValidationError) => void;
  /** Resume watermark — the last applied sequence from a prior connection. */
  initialLastEventId?: number | null;
}

export interface SseStream {
  lastEventId(): number | null;
  close(): void;
}

function withLastEventId(url: string, lastSequence: number | null): string {
  if (lastSequence === null) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}lastEventId=${lastSequence}`;
}

export function createSseStream(options: SseStreamOptions): SseStream {
  const endpoint = 'GET /runs/:id/stream';
  let state: FoldState =
    options.initialLastEventId != null
      ? { lastSequence: options.initialLastEventId, events: [] }
      : emptyFoldState;

  const source = options.eventSourceFactory(withLastEventId(options.url, state.lastSequence));
  source.addEventListener('message', (event) => {
    let envelope: RunEventEnvelope;
    try {
      envelope = parseOrThrow(RunEventEnvelope, endpoint, JSON.parse(event.data));
    } catch (error) {
      options.onError?.(
        error instanceof PayloadValidationError
          ? error
          : new PayloadValidationError(endpoint, error),
      );
      return;
    }
    const next = applyEnvelope(state, envelope);
    if (next !== state) {
      state = next;
      options.onEvent(envelope);
    }
  });

  return {
    lastEventId: () => state.lastSequence,
    close: () => source.close(),
  };
}
