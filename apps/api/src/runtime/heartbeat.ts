/**
 * P6.10 — the worker-alive heartbeat (ARCHITECTURE.md §11/§12). While the in-process worker runs it
 * emits a periodic "alive" beat; the operator (and the P6.8 /health surfacing, wired at integration)
 * reads the last beat to tell a live worker from a stalled/crashed one.
 *
 * Fully deterministic + timer-free: the clock is INJECTED (`now()` — never `Date.now`) and emission is
 * a THROTTLE keyed on that clock (`beat()` emits at most once per `intervalMs`), driven by the caller's
 * loop — never a real `setInterval`. This keeps the heartbeat unit-testable with a fake clock and lets
 * the P3 worker loop call `beat()` each iteration without a second scheduler.
 *
 * A heartbeat is a SIDE SIGNAL, not an authoritative event: this module imports nothing from the
 * event-store writer / `run_events` (rule #2 — the closed 36-member RunEventType has no heartbeat
 * member), so it can never touch the authoritative log. The live-worker loop that calls `beat()` and
 * the /health read of the last beat wire at P3/integration (the worker doesn't exist on the demo fork).
 */
export interface Heartbeat {
  /** The injected clock value `now()` at the moment the beat was emitted. */
  at: number;
}

export interface HeartbeatDeps {
  /** Injected monotonic-ish clock in ms (never `Date.now` — keeps the heartbeat deterministic). */
  now: () => number;
  /** Minimum spacing between emitted beats, ms (the throttle window). */
  intervalMs: number;
  /** Injected sink for an emitted beat (e.g. update last-heartbeat state / a structured-log sink). */
  emit: (beat: Heartbeat) => void;
}

export interface HeartbeatController {
  /** Emit a beat if at least `intervalMs` has elapsed (per the injected clock) since the last one. */
  beat(): void;
}

export function createHeartbeat(deps: HeartbeatDeps): HeartbeatController {
  let lastEmitAt: number | null = null;
  return {
    beat(): void {
      const at = deps.now();
      if (lastEmitAt === null || at - lastEmitAt >= deps.intervalMs) {
        lastEmitAt = at;
        deps.emit({ at });
      }
    },
  };
}

/**
 * Pure staleness predicate: a worker is alive iff it beat within `staleAfterMs` of `now`. A
 * never-beat worker (`lastHeartbeatAt === null`) is not alive (a crashed/never-started worker is
 * visible), and a beat older than the window is not alive (a stalled worker is detectable).
 */
export function isWorkerAlive(
  lastHeartbeatAt: number | null,
  now: number,
  staleAfterMs: number,
): boolean {
  if (lastHeartbeatAt === null) return false;
  return now - lastHeartbeatAt <= staleAfterMs;
}
