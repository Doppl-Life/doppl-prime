import type { RunEventEnvelope } from '../data/contracts';
import type { RunClient } from '../data/runClient';
import { applyEvent as foldEvent, emptyViewState } from './reducer';
import type { RunMode, ViewState } from './reducer';
import { pollOnce, resyncFromRest } from './resync';

/**
 * The client run store — the panels' subscribable state container over the reducer. It is the
 * onEvent SINK an external `sseStream` drives (inversion of control: the integration/P7.14 wiring
 * does `createSseStream({ onEvent: store.applyEvent, onError: () => store.poll() })`), so the store
 * is decoupled from stream construction and testable in isolation. It never mutates authoritative
 * state — it only folds validated events and resyncs/polls read-only via `runClient` (safety rules
 * #2/#9). `mode` (live | replay) is carried for downstream indicators without affecting the fold.
 */
export interface RunStore {
  getState(): ViewState;
  getMode(): RunMode;
  subscribe(listener: (state: ViewState) => void): () => void;
  /** The sink an external sseStream's onEvent calls — folds one live delta into view state. */
  applyEvent(envelope: RunEventEnvelope): void;
  /** Resync from the REST events projection (after the watermark) — same view as a fresh load. */
  resync(): Promise<void>;
  /** Polling fallback when streaming stalls/fails — a REST poll from the current watermark. */
  poll(): Promise<void>;
}

export interface RunStoreOptions {
  runId: string;
  runClient: RunClient;
  mode?: RunMode;
  initial?: ViewState;
}

export function createRunStore(options: RunStoreOptions): RunStore {
  const { runId, runClient } = options;
  const mode: RunMode = options.mode ?? 'live';
  let state: ViewState = options.initial ?? emptyViewState;
  const listeners = new Set<(state: ViewState) => void>();

  function setState(next: ViewState): void {
    if (next !== state) {
      state = next;
      for (const listener of listeners) listener(state);
    }
  }

  return {
    getState: () => state,
    getMode: () => mode,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    applyEvent: (envelope) => setState(foldEvent(state, envelope)),
    resync: async () => setState(await resyncFromRest(runClient, runId, state)),
    poll: async () => setState(await pollOnce(runClient, runId, state)),
  };
}
