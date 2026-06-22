import { describe, expect, test } from 'vitest';
import type { EventStore, RunEventRow } from '../../../src/event-store';
import { streamRunEvents, type EventBridgeOptions } from '../../../src/sse/event-bridge';

/**
 * P6.9 — the demo-owned event-bridge cursor logic (unit). The bridge polls `readByRun` past a cursor
 * and yields only sequence > cursor in order; the poll interval is INJECTED (no real timers — a
 * bounded `maxIdlePolls` + a no-op `sleep` keeps the generator deterministic and terminating). A
 * client-disconnect `AbortController.abort()` ends the stream. spec(§11) resume cursor; bridge logic.
 */

/** A minimal fake store: `readByRun` returns the same fixed rows every poll (cursor does the work). */
function fakeStore(sequences: number[]): Pick<EventStore, 'readByRun'> {
  const rows = sequences.map((sequence) => ({ sequence }) as unknown as RunEventRow);
  return { readByRun: async () => rows };
}

async function collect(gen: AsyncGenerator<RunEventRow>): Promise<number[]> {
  const out: number[] = [];
  for await (const row of gen) out.push(row.sequence);
  return out;
}

describe('streamRunEvents — bridge cursor logic (spec §11)', () => {
  // The bridge yields ONLY sequence > cursor, in ascending order, via readByRun; the poll interval
  // is injected (a no-op sleep + maxIdlePolls=1 closes after one empty poll — no real timer).
  test('test_bridge_reads_past_cursor_injectable_interval', async () => {
    let sleepCalls = 0;
    const sleep: NonNullable<EventBridgeOptions['sleep']> = async () => {
      sleepCalls += 1;
    };
    const opts: EventBridgeOptions = { sleep, maxIdlePolls: 1, intervalMs: 0 };

    // cursor=2 → only sequence 3,4 (past the cursor), in order.
    const past = await collect(streamRunEvents(fakeStore([0, 1, 2, 3, 4]), 'r', 2, opts));
    expect(past).toEqual([3, 4]);
    expect(sleepCalls).toBeGreaterThanOrEqual(1); // the INJECTED interval was used (no real timer)

    // cursor=-1 (absent Last-Event-ID) → the full ordered set from sequence 0.
    const all = await collect(streamRunEvents(fakeStore([0, 1, 2, 3, 4]), 'r', -1, opts));
    expect(all).toEqual([0, 1, 2, 3, 4]);

    // an already-aborted signal (client disconnect) ends the stream — yields nothing.
    const controller = new AbortController();
    controller.abort();
    const aborted = await collect(
      streamRunEvents(fakeStore([0, 1, 2]), 'r', -1, { ...opts, signal: controller.signal }),
    );
    expect(aborted).toEqual([]);
  });
});
