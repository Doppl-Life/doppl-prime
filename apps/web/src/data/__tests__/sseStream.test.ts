import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { RunClient } from "../runClient.js";
import { type StreamMode, createSseStream } from "../sseStream.js";

interface FakeEventSourceInstance {
  url: string;
  closed: boolean;
  onmessage: ((ev: MessageEvent<string>) => void) | null;
  onerror: ((ev: Event) => void) | null;
  emit(data: string): void;
  emitError(): void;
  close(): void;
}

function makeFakeEventSource(): {
  ctor: typeof EventSource;
  instances: FakeEventSourceInstance[];
} {
  const instances: FakeEventSourceInstance[] = [];
  class FakeES implements FakeEventSourceInstance {
    url: string;
    closed = false;
    onmessage: ((ev: MessageEvent<string>) => void) | null = null;
    onerror: ((ev: Event) => void) | null = null;
    constructor(url: string) {
      this.url = url;
      instances.push(this);
    }
    emit(data: string) {
      const ev = { data } as MessageEvent<string>;
      this.onmessage?.(ev);
    }
    emitError() {
      this.onerror?.(new Event("error"));
    }
    close() {
      this.closed = true;
    }
  }
  return { ctor: FakeES as unknown as typeof EventSource, instances };
}

const VALID_ENVELOPE = (sequence: number) => ({
  id: `evt_${sequence}`,
  runId: "run_x",
  sequence,
  type: "generation.started",
  actor: "runtime",
  occurredAt: "2026-06-19T00:00:00Z",
  schemaVersion: 1,
  payload: { index: sequence },
});

function makeFakeClient(getEventsImpl: RunClient["getEvents"]): RunClient {
  return {
    listRuns: async () => ({ runs: [] }),
    getRun: async () => null,
    getEvents: getEventsImpl,
    getLineage: async () => ({ runId: "x", sequenceThrough: 0, nodes: [], edges: [] }),
    getReplay: async () => null,
    getCandidate: async () => null,
    getHealth: async () => ({
      runId: "x",
      status: "configured",
      currentGeneration: 0,
      candidatesInFlight: 0,
      lastEventOccurredAt: null,
      capsConsumed: { energy: 0, generations: 0, candidates: 0, toolCalls: 0 },
      lastHeartbeatMs: null,
    }),
    getModelRoutes: async () => ({ routes: [] }),
    startRun: async () => ({ runId: "x" }),
    stopRun: async () => null,
    getRunDetail: async () => ({
      runId: "x",
      headSequence: 0,
      sequenceThrough: 0,
      currentState: null,
    }),
    getCuratedPrompts: async () => [],
    startDemoLive: async () => ({
      runId: "x",
      runMode: "live",
      warnings: [],
      source: "operator",
    }),
    startDemoReplay: async () => ({
      runId: "x",
      runMode: "replay",
      eventsLoaded: 1,
      eventsSkipped: 0,
    }),
  };
}

describe("createSseStream — live phase", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("event with sequence > lastEventId is delivered", () => {
    const { ctor, instances } = makeFakeEventSource();
    const seen: number[] = [];
    const handle = createSseStream({
      runId: "run_x",
      onEvent: (e) => seen.push(e.sequence),
      eventSourceImpl: ctor,
      client: makeFakeClient(async () => ({ runId: "run_x", events: [], count: 0 })),
    });
    expect(handle.mode()).toBe("live");
    expect(instances).toHaveLength(1);
    instances[0]?.emit(JSON.stringify(VALID_ENVELOPE(0)));
    instances[0]?.emit(JSON.stringify(VALID_ENVELOPE(1)));
    expect(seen).toEqual([0, 1]);
    expect(handle.lastEventId()).toBe(1);
    handle.close();
  });

  test("event with sequence <= lastEventId is dropped (de-dup)", () => {
    const { ctor, instances } = makeFakeEventSource();
    const seen: number[] = [];
    const handle = createSseStream({
      runId: "run_x",
      initialLastEventId: 5,
      onEvent: (e) => seen.push(e.sequence),
      eventSourceImpl: ctor,
      client: makeFakeClient(async () => ({ runId: "run_x", events: [], count: 0 })),
    });
    instances[0]?.emit(JSON.stringify(VALID_ENVELOPE(3)));
    instances[0]?.emit(JSON.stringify(VALID_ENVELOPE(5)));
    instances[0]?.emit(JSON.stringify(VALID_ENVELOPE(7)));
    expect(seen).toEqual([7]);
    handle.close();
  });

  test("malformed JSON triggers onError with kind=parse, sequence not advanced", () => {
    const { ctor, instances } = makeFakeEventSource();
    const errors: unknown[] = [];
    const handle = createSseStream({
      runId: "run_x",
      onEvent: () => {},
      onError: (e) => errors.push(e),
      eventSourceImpl: ctor,
      client: makeFakeClient(async () => ({ runId: "run_x", events: [], count: 0 })),
    });
    instances[0]?.emit("{ not json");
    expect(errors).toHaveLength(1);
    expect(handle.lastEventId()).toBe(-1);
    handle.close();
  });

  test("after reconnectMax errors, switches to polling", () => {
    const { ctor, instances } = makeFakeEventSource();
    const modes: StreamMode[] = [];
    const handle = createSseStream({
      runId: "run_x",
      onEvent: () => {},
      onModeChange: (m) => modes.push(m),
      eventSourceImpl: ctor,
      reconnectMax: 2,
      pollIntervalMs: 1000,
      client: makeFakeClient(async () => ({ runId: "run_x", events: [], count: 0 })),
    });
    instances[0]?.emitError();
    vi.advanceTimersByTime(300);
    instances[1]?.emitError();
    vi.advanceTimersByTime(300);
    expect(handle.mode()).toBe("polling");
    expect(modes).toContain("polling");
    handle.close();
  });

  test("polling fallback dispatches new events from getEvents", async () => {
    const { ctor } = makeFakeEventSource();
    const seen: number[] = [];
    const polledEvents = [VALID_ENVELOPE(0), VALID_ENVELOPE(1)];
    const handle = createSseStream({
      runId: "run_x",
      onEvent: (e) => seen.push(e.sequence),
      eventSourceImpl: undefined as unknown as typeof EventSource, // force polling path
      reconnectMax: 0,
      pollIntervalMs: 100,
      client: makeFakeClient(async () => ({
        runId: "run_x",
        events: polledEvents,
        count: polledEvents.length,
      })),
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(handle.mode()).toBe("polling");
    // Let the in-flight tick complete
    vi.advanceTimersByTime(50);
    await Promise.resolve();
    await Promise.resolve();
    expect(seen).toEqual([0, 1]);
    handle.close();
  });

  test("close() stops EventSource + polling interval", () => {
    const { ctor, instances } = makeFakeEventSource();
    const handle = createSseStream({
      runId: "run_x",
      onEvent: () => {},
      eventSourceImpl: ctor,
      client: makeFakeClient(async () => ({ runId: "run_x", events: [], count: 0 })),
    });
    handle.close();
    expect(instances[0]?.closed).toBe(true);
    expect(handle.mode()).toBe("closed");
  });
});
