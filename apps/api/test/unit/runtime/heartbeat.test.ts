import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { createHeartbeat, isWorkerAlive, type Heartbeat } from '../../../src/runtime/heartbeat';

/**
 * P6.10 — the worker-alive heartbeat (ARCHITECTURE.md §11/§12). A heartbeat emits periodically while
 * the worker runs, driven by an INJECTED clock/interval (no real setInterval/Date.now — a throttle
 * keyed on the injected `now()` emits at most once per intervalMs). A pure
 * `isWorkerAlive(lastHeartbeatAt, now, staleAfterMs)` predicate makes a stalled/crashed worker
 * detectable. Structural pin: the heartbeat imports nothing from the event-store writer / run_events
 * (a heartbeat is a side signal, never an authoritative event — rule #2).
 */

const FORBIDDEN_IMPORT = /from\s+['"][^'"]*(event-store|run_events|drizzle|\bpg\b|database)/i;

describe('worker heartbeat — injected clock + staleness predicate (spec §11/§12)', () => {
  // §11/§12 — the heartbeat emits per the INJECTED clock/interval (never a real setInterval/Date.now):
  // a throttle keyed on now() emits at most once per intervalMs.
  test('test_heartbeat_emits_on_injected_interval', () => {
    const beats: Heartbeat[] = [];
    let clock = 1000;
    const hb = createHeartbeat({ now: () => clock, intervalMs: 500, emit: (beat) => beats.push(beat) });

    hb.beat(); // t=1000 → first emit
    clock = 1200;
    hb.beat(); // +200 < 500 → no emit
    clock = 1500;
    hb.beat(); // +500 ≥ 500 → emit

    expect(beats.map((beat) => beat.at)).toEqual([1000, 1500]);
  });

  // §12 — a stale last-heartbeat is detectable: fresh → alive; now − last > staleAfterMs → not-alive;
  // a never-beat (null) → not-alive (a crashed worker that never started is visible).
  test('test_isWorkerAlive_detects_staleness', () => {
    expect(isWorkerAlive(1000, 1400, 500)).toBe(true); // 400 ≤ 500 → alive
    expect(isWorkerAlive(1000, 1600, 500)).toBe(false); // 600 > 500 → stale/not-alive
    expect(isWorkerAlive(null, 1000, 500)).toBe(false); // never beat → not-alive
  });

  // rule #2 — the heartbeat imports nothing from the event-store writer / run_events (the closed
  // 36-member RunEventType registry has no heartbeat member; a heartbeat never touches the log).
  test('test_no_append_path_import', () => {
    const src = readFileSync(
      fileURLToPath(new URL('../../../src/runtime/heartbeat.ts', import.meta.url)),
      'utf8',
    );
    expect(FORBIDDEN_IMPORT.test(src)).toBe(false);
  });
});
