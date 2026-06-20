import { RunEventTypeValues } from "@doppl/contracts";
import type { z } from "zod";
import { RunEventEnvelope } from "./contracts.js";
import { type RunClient, createRunClient } from "./runClient.js";

/**
 * SSE consumer for Phase 6's GET /runs/:id/stream (P7.1, D6).
 *
 * Live phase: subscribes via EventSource against
 * `/runs/:id/stream?lastEventId=<n>` (EventSource cannot set custom
 * headers — query param is the resume contract Phase 6 wired).
 *
 * Each message: parse JSON → validate against RunEventEnvelope. If
 * sequence > lastApplied, dispatch onEvent. Otherwise drop (sequence
 * is the SOLE ordering key per §11; occurredAt is never consulted).
 *
 * Disconnect / error: reconnect with the latest applied sequence. After
 * `reconnectMax` (default 3) consecutive failures, switch to polling
 * fallback: `getEvents(runId, { afterSequence: lastApplied })` every
 * pollIntervalMs (default 2000). Resync from polling produces the
 * identical fold state to live streaming.
 *
 * close(): unsubscribe + stop polling.
 */

export type StreamMode = "idle" | "live" | "polling" | "closed";

export interface SseStreamOptions {
  runId: string;
  baseUrl?: string;
  initialLastEventId?: number;
  onEvent: (event: z.infer<typeof RunEventEnvelope>) => void;
  onError?: (err: { kind: "parse" | "network"; detail: unknown }) => void;
  onModeChange?: (mode: StreamMode) => void;
  /** Injected for tests. */
  eventSourceImpl?: typeof EventSource;
  /** Injected for tests. */
  client?: RunClient;
  reconnectMax?: number;
  pollIntervalMs?: number;
}

export interface SseStreamHandle {
  close(): void;
  /** Returns the most recently applied event sequence. */
  lastEventId(): number;
  /** Returns the active stream mode. */
  mode(): StreamMode;
}

const DEFAULT_RECONNECT_MAX = Number(
  (typeof import.meta !== "undefined" &&
    (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_SSE_RECONNECT_MAX) ??
    "3",
);
const DEFAULT_POLL_INTERVAL_MS = Number(
  (typeof import.meta !== "undefined" &&
    (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_POLL_INTERVAL_MS) ??
    "2000",
);

export function createSseStream(options: SseStreamOptions): SseStreamHandle {
  const baseUrl = options.baseUrl ?? "";
  const reconnectMax = options.reconnectMax ?? DEFAULT_RECONNECT_MAX;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const EventSourceCtor = options.eventSourceImpl ?? globalThis.EventSource;
  const client = options.client ?? createRunClient({ baseUrl });

  let lastApplied = options.initialLastEventId ?? -1;
  let mode: StreamMode = "idle";
  let consecutiveErrors = 0;
  let eventSource: EventSource | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const setMode = (next: StreamMode) => {
    if (mode === next) return;
    mode = next;
    options.onModeChange?.(next);
  };

  const dispatchRawMessage = (raw: string) => {
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch (err) {
      options.onError?.({ kind: "parse", detail: { message: (err as Error).message, raw } });
      return;
    }
    const parsed = RunEventEnvelope.safeParse(json);
    if (!parsed.success) {
      options.onError?.({ kind: "parse", detail: parsed.error.errors });
      return;
    }
    if (parsed.data.sequence <= lastApplied) return;
    lastApplied = parsed.data.sequence;
    options.onEvent(parsed.data);
  };

  const startPolling = () => {
    if (pollTimer || closed) return;
    setMode("polling");
    const tick = async () => {
      if (closed) return;
      try {
        const out = await client.getEvents(options.runId, { afterSequence: lastApplied });
        for (const raw of out.events) {
          const parsed = RunEventEnvelope.safeParse(raw);
          if (!parsed.success) continue;
          if (parsed.data.sequence <= lastApplied) continue;
          lastApplied = parsed.data.sequence;
          options.onEvent(parsed.data);
        }
      } catch (err) {
        options.onError?.({ kind: "network", detail: err });
      }
    };
    pollTimer = setInterval(() => {
      void tick();
    }, pollIntervalMs);
    void tick();
  };

  const startLive = () => {
    if (closed) return;
    if (!EventSourceCtor) {
      startPolling();
      return;
    }
    const url = `${baseUrl}/runs/${encodeURIComponent(options.runId)}/stream?lastEventId=${lastApplied}`;
    const source = new EventSourceCtor(url);
    eventSource = source;
    setMode("live");
    // The server emits each frame as `event: <type>\ndata: …`, so EventSource
    // routes them to named listeners — `onmessage` only catches frames with no
    // event field and would never fire here. Subscribe to every contract-known
    // event type plus a default fallback so unanticipated types still surface.
    const handle = (event: MessageEvent<string>): void => {
      consecutiveErrors = 0;
      dispatchRawMessage(event.data);
    };
    for (const type of RunEventTypeValues) {
      source.addEventListener(type, handle as EventListener);
    }
    source.onmessage = handle;
    source.onerror = (event: Event) => {
      options.onError?.({ kind: "network", detail: event });
      consecutiveErrors += 1;
      source.close();
      eventSource = null;
      if (consecutiveErrors >= reconnectMax) {
        startPolling();
      } else if (!closed) {
        // Reconnect attempt
        setTimeout(() => {
          if (!closed && mode !== "polling") startLive();
        }, 250);
      }
    };
  };

  startLive();

  return {
    close() {
      closed = true;
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      setMode("closed");
    },
    lastEventId() {
      return lastApplied;
    },
    mode() {
      return mode;
    },
  };
}
