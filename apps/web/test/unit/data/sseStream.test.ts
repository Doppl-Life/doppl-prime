import { describe, expect, it, vi } from 'vitest';
import type { RunEventEnvelope } from '@doppl/contracts';
import {
  createSseStream,
  foldEvents,
  emptyFoldState,
  type EventSourceLike,
} from '../../../src/data/sseStream';
import { PayloadValidationError } from '../../../src/data/errors';
import { makeEnvelope } from '../../fixtures/lineage';

/** A fake EventSource (injected transport double): captures its url + lets a test push messages. */
class FakeEventSource implements EventSourceLike {
  readonly url: string;
  closed = false;
  private readonly listeners: ((e: { data: string }) => void)[] = [];
  constructor(url: string) {
    this.url = url;
  }
  addEventListener(_type: 'message', cb: (e: { data: string }) => void): void {
    this.listeners.push(cb);
  }
  close(): void {
    this.closed = true;
  }
  /** Push a server-sent payload (object is JSON-encoded; a raw string is sent verbatim). */
  emit(data: unknown): void {
    const body = typeof data === 'string' ? data : JSON.stringify(data);
    for (const cb of this.listeners) cb({ data: body });
  }
}

const T = (n: number) => `2026-06-20T12:00:0${n}.000Z`;

describe('sseStream — ordered/deduped, non-authoritative delivery', () => {
  // spec(§11)/rule #2: events are applied ordered + de-duped by per-run `sequence` ALONE; a
  // sequence <= the last applied is dropped; wall-clock occurredAt NEVER reorders.
  it('test_orders_and_dedupes_by_sequence_alone', () => {
    let es!: FakeEventSource;
    const applied: number[] = [];
    createSseStream({
      url: 'http://x/runs/run_1/stream',
      eventSourceFactory: (u) => (es = new FakeEventSource(u)),
      onEvent: (env) => applied.push(env.sequence),
    });
    // occurredAt DESCENDING while sequence ASCENDING — proves occurredAt is ignored for ordering.
    es.emit(makeEnvelope(0, T(9)));
    es.emit(makeEnvelope(1, T(8)));
    es.emit(makeEnvelope(1, T(7))); // duplicate sequence -> dropped
    es.emit(makeEnvelope(2, T(6)));
    es.emit(makeEnvelope(1, T(5))); // stale (<= watermark) -> dropped
    expect(applied).toEqual([0, 1, 2]);
  });

  // spec(§11): the stream carries lastEventId == last applied sequence; a reconnect resumes from
  // that watermark (the EventSource is opened with the watermark in its url).
  it('test_carries_last_event_id_watermark', () => {
    let es!: FakeEventSource;
    const stream = createSseStream({
      url: 'http://x/runs/run_1/stream',
      eventSourceFactory: (u) => (es = new FakeEventSource(u)),
      onEvent: () => {},
    });
    es.emit(makeEnvelope(0, T(0)));
    es.emit(makeEnvelope(5, T(1)));
    expect(stream.lastEventId()).toBe(5);

    // A reconnect resumes from the watermark: the new EventSource url carries lastEventId=5.
    let resumed!: FakeEventSource;
    createSseStream({
      url: 'http://x/runs/run_1/stream',
      eventSourceFactory: (u) => (resumed = new FakeEventSource(u)),
      onEvent: () => {},
      initialLastEventId: 5,
    });
    expect(resumed.url).toContain('lastEventId=5');
  });

  // spec(§11)/rule #2: SSE is non-authoritative — dropping the stream and resyncing the SAME events
  // via the REST events path (the shared fold) reaches the identical view state.
  it('test_sse_non_authoritative_resync_equivalent', () => {
    const events: RunEventEnvelope[] = [
      makeEnvelope(0, T(9)),
      makeEnvelope(1, T(8)),
      makeEnvelope(1, T(7)),
      makeEnvelope(2, T(6)),
    ];
    let es!: FakeEventSource;
    const viaSse: number[] = [];
    const stream = createSseStream({
      url: 'http://x/runs/run_1/stream',
      eventSourceFactory: (u) => (es = new FakeEventSource(u)),
      onEvent: (env) => viaSse.push(env.sequence),
    });
    for (const e of events) es.emit(e);

    // REST resync path: fold the same events through the shared pure reducer.
    const viaRest = foldEvents(events, emptyFoldState);
    expect(viaRest.events.map((e) => e.sequence)).toEqual(viaSse);
    expect(viaRest.lastSequence).toBe(stream.lastEventId());
  });

  // spec(§12): an invalid SSE payload surfaces a TYPED error; view state stays uncorrupted (the bad
  // event is dropped, the watermark unchanged) and a subsequent valid event still applies.
  it('test_validation_failure_typed_error_run_inspectable', () => {
    let es!: FakeEventSource;
    const applied: number[] = [];
    const onError = vi.fn();
    const stream = createSseStream({
      url: 'http://x/runs/run_1/stream',
      eventSourceFactory: (u) => (es = new FakeEventSource(u)),
      onEvent: (env) => applied.push(env.sequence),
      onError,
    });
    es.emit(makeEnvelope(0, T(0)));
    es.emit('{ not valid json'); // malformed -> typed error, dropped
    es.emit({ id: 'bad', sequence: 'not-a-number' }); // schema-invalid -> typed error, dropped
    es.emit(makeEnvelope(1, T(1)));
    expect(applied).toEqual([0, 1]);
    expect(stream.lastEventId()).toBe(1);
    expect(onError).toHaveBeenCalledTimes(2);
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(PayloadValidationError);
  });

  // spec(§11): the pure fold is idempotent — re-applying an already-seen sequence is a no-op.
  it('test_fold_is_idempotent', () => {
    const e0 = makeEnvelope(0, T(0));
    const once = foldEvents([e0], emptyFoldState);
    const twice = foldEvents([e0], once);
    expect(twice.events.map((e) => e.sequence)).toEqual([0]);
    expect(twice.lastSequence).toBe(0);
  });
});
