import type { RunEventEnvelope } from '../data/contracts';
import { createSseStream } from '../data/sseStream';
import type { EventSourceLike, SseStream, SseStreamOptions } from '../data/sseStream';
import type { RunStore } from '../state/runStore';

/**
 * dashboardWiring — the PURE (DOM-free) wiring of the P7.2 DEFERRED SSE-store IoC (LESSONS §2). It
 * resyncs the store from REST on mount, then constructs the `sseStream` with the store as the single
 * ViewState fold sink — `onEvent: store.applyEvent` — and the polling fallback — `onError: () =>
 * store.poll()`. The optional `onEnvelope` hook lets the shell ALSO accumulate the raw events list the
 * event-consuming panels need (the lean store deliberately retains only ViewState, not raw events).
 * The shell never re-folds ViewState; the store owns that.
 *
 * NOTE (live-SSE integration carry-forward): `createSseStream`'s `onError` fires on a PAYLOAD-VALIDATION
 * failure — the connection-DROP fallback (an EventSource `'error'` listener) is not modeled by the
 * current `EventSourceLike` and is added when the real EventSource wires at the demo→cody merge.
 */
export interface WireRunStreamOptions {
  store: Pick<RunStore, 'applyEvent' | 'poll' | 'resync'>;
  runId: string;
  baseUrl: string;
  eventSourceFactory: (url: string) => EventSourceLike;
  /** The shell's raw-events accumulator (delivery-level FoldState), in addition to the store sink. */
  onEnvelope?: (envelope: RunEventEnvelope) => void;
  /** Injected for tests; defaults to the real `createSseStream`. */
  createStream?: (options: SseStreamOptions) => SseStream;
}

export function wireRunStream(opts: WireRunStreamOptions): SseStream {
  const create = opts.createStream ?? createSseStream;
  // Resync-on-mount: a fresh load reaches the projection view before/alongside the stream (P7.2).
  void opts.store.resync().catch(() => undefined);
  return create({
    url: `${opts.baseUrl}/runs/${encodeURIComponent(opts.runId)}/stream`,
    eventSourceFactory: opts.eventSourceFactory,
    onEvent: (envelope) => {
      opts.store.applyEvent(envelope); // single ViewState fold sink (the shell never re-folds)
      opts.onEnvelope?.(envelope); // + the shell's raw-events accumulator for the panels
    },
    onError: () => {
      void opts.store.poll().catch(() => undefined); // polling fallback (LESSONS §2)
    },
  });
}
