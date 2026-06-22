import type { EventStore, RunEventRow } from '../event-store';

/**
 * P6.9 — the demo-owned SSE event-bridge (ARCHITECTURE.md §11/§4). It feeds the run-event stream by
 * POLLING the authoritative log (`readByRun`) past a cursor and yielding only events with
 * `sequence > cursor`, in sequence order. It is DELIVERY-ONLY / non-authoritative (rule #2): it never
 * appends, mutates a projection, or touches any write path — it read-imports the `EventStore` reader
 * surface only (`Pick<EventStore,'readByRun'>`, like P6.7's `listRunIds` — NO kernel-file edit).
 *
 * The poll loop is fully injectable so unit/integration tests run with NO real timers: `sleep` is the
 * delay primitive (default = a real, abort-aware timeout), `maxIdlePolls` bounds how many consecutive
 * empty polls end the generator (default ∞ = a live stream that runs until the client disconnects),
 * and `signal` (the client-disconnect AbortSignal) ends it promptly. Tests pass a no-op `sleep` +
 * `maxIdlePolls: 1` so the generator delivers the appended set then closes after one empty poll.
 */
export interface EventBridgeOptions {
  /** Delay between polls, ms (default {@link DEFAULT_SSE_INTERVAL_MS}). */
  intervalMs?: number;
  /** Consecutive empty polls before the generator ends (default ∞ — a live stream). */
  maxIdlePolls?: number;
  /** Injectable delay primitive (default = an abort-aware real timeout). */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** Client-disconnect signal: when aborted, the generator ends promptly. */
  signal?: AbortSignal;
}

/** Default live-stream poll interval (ms) — paired with `maxIdlePolls: ∞` for the production stream. */
export const DEFAULT_SSE_INTERVAL_MS = 1000;

/** An abort-aware real timeout: resolves after `ms`, or immediately when `signal` aborts. */
function realSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Yield run events with `sequence > fromSequence` in order, polling `readByRun` until either
 * `maxIdlePolls` consecutive empty polls or the abort signal ends the stream. `fromSequence = -1`
 * (absent `Last-Event-ID`) yields the full run from sequence 0.
 */
export async function* streamRunEvents(
  store: Pick<EventStore, 'readByRun'>,
  runId: string,
  fromSequence: number,
  options: EventBridgeOptions = {},
): AsyncGenerator<RunEventRow> {
  const intervalMs = options.intervalMs ?? DEFAULT_SSE_INTERVAL_MS;
  const maxIdlePolls = options.maxIdlePolls ?? Number.POSITIVE_INFINITY;
  const sleep = options.sleep ?? realSleep;
  const signal = options.signal;

  let cursor = fromSequence;
  let idlePolls = 0;

  while (!signal?.aborted) {
    // readByRun returns rows already ordered by (run_id, sequence) asc, so filtering preserves order.
    const rows = await store.readByRun(runId);
    const fresh = rows.filter((row) => row.sequence > cursor);

    if (fresh.length > 0) {
      idlePolls = 0;
      for (const row of fresh) {
        if (signal?.aborted) return;
        yield row;
        cursor = row.sequence;
      }
    } else {
      idlePolls += 1;
      if (idlePolls >= maxIdlePolls) return;
    }

    if (signal?.aborted) return;
    await sleep(intervalMs, signal);
  }
}
