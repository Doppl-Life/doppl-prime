import { describe, expect, it, vi } from 'vitest';
import type { PayloadValidationError } from '../../../src/data/errors';
import type { EventSourceLike, SseStream, SseStreamOptions } from '../../../src/data/sseStream';
import { applyEnvelope, foldEvents } from '../../../src/data/sseStream';
import { wireRunStream } from '../../../src/routes/dashboardWiring';
import { makeEvent } from '../../fixtures/events';

function fakeStore() {
  return {
    applyEvent: vi.fn(),
    poll: vi.fn(() => Promise.resolve()),
    resync: vi.fn(() => Promise.resolve()),
  };
}

/** Capture the SseStreamOptions the shell wires, so the test can drive onEvent/onError directly. */
function captureCreateStream() {
  let captured: SseStreamOptions | null = null;
  const createStream = (opts: SseStreamOptions): SseStream => {
    captured = opts;
    return { lastEventId: () => null, close: vi.fn() };
  };
  return { createStream, options: () => captured! };
}

const noopFactory = (): EventSourceLike => ({ addEventListener() {}, close() {} });

describe('dashboardWiring — the P7.2 deferred SSE-store IoC', () => {
  // spec(§11/§2): a live envelope delivered to the wired onEvent folds into the store (single sink)
  // AND feeds the shell's events-list accumulator.
  it('test_sse_onEvent_folds_into_store', () => {
    const store = fakeStore();
    const cap = captureCreateStream();
    const onEnvelope = vi.fn();
    wireRunStream({
      store,
      runId: 'run_1',
      baseUrl: '/api',
      eventSourceFactory: noopFactory,
      createStream: cap.createStream,
      onEnvelope,
    });
    const env = makeEvent(1, 'run.started');
    cap.options().onEvent(env);
    expect(store.applyEvent).toHaveBeenCalledWith(env); // the store is the single ViewState fold sink
    expect(onEnvelope).toHaveBeenCalledWith(env); // + the shell's events-list accumulator
  });

  // spec(§11): a stream error triggers the polling fallback (LESSONS §2).
  it('test_sse_onError_polls', () => {
    const store = fakeStore();
    const cap = captureCreateStream();
    wireRunStream({
      store,
      runId: 'run_1',
      baseUrl: '/api',
      eventSourceFactory: noopFactory,
      createStream: cap.createStream,
    });
    cap.options().onError?.(undefined as unknown as PayloadValidationError);
    expect(store.poll).toHaveBeenCalled();
  });

  // spec(§11): the shell resyncs the store from REST on mount; the stream url carries the runId.
  it('test_resync_on_mount', () => {
    const store = fakeStore();
    const cap = captureCreateStream();
    wireRunStream({
      store,
      runId: 'run_1',
      baseUrl: '/api',
      eventSourceFactory: noopFactory,
      createStream: cap.createStream,
    });
    expect(store.resync).toHaveBeenCalled();
    expect(cap.options().url).toContain('run_1');
  });

  // spec(§11 / flag-2): the events FoldState is sequence-keyed — a resync/reconnect re-delivering an
  // already-applied sequence is a no-op (never double-appends), matching the store watermark.
  it('test_events_foldstate_dedup_sequence_keyed', () => {
    const folded = foldEvents([
      makeEvent(1, 'run.started'),
      makeEvent(2, 'candidate.created', { candidateId: 'c1' }),
    ]);
    const reapplied = applyEnvelope(
      folded,
      makeEvent(2, 'candidate.created', { candidateId: 'c1' }),
    );
    expect(reapplied).toBe(folded); // same reference — deduped by sequence
    expect(reapplied.events).toHaveLength(2);
  });
});
