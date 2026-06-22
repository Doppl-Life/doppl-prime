/**
 * Operator-stop signal channel (PD.3, ARCHITECTURE.md §5 operator stop / kill-and-drain, KEY SAFETY
 * RULE #2). A composition-layer, in-memory latch shared between the REST stop route and the in-flight
 * worker: `POST /runs/:id/stop` calls `request(runId)` (set the latch + return an async accept); the
 * worker's generation loop polls `checker(runId)` (its `operatorStop: () => boolean` seam) at each
 * generation boundary and, when latched, drains the current generation + terminalizes `run.stopped`
 * (the worker owns the terminal, rule #2 — the route appends nothing).
 *
 * Lives in `boot/` because it is pure wiring: neither the runtime worker nor the route imports it (the
 * layer rule) — `main.ts` injects `request` into the route and `checker(runId)` into the worker as plain
 * functions. `clear(runId)` is called on run-settle (bounds the `Set`); a stale latch is a harmless no-op
 * (the worker already terminalized; a never-picked-up latch is cleaned by crash-forward next boot).
 */

export interface OperatorStopRegistry {
  /** Latch a stop for `runId` (idempotent — a repeat is a no-op). Called by the stop route. */
  request(runId: string): void;
  /** The poll fn the worker injects as its `operatorStop` seam — `true` once `request(runId)` ran. */
  checker(runId: string): () => boolean;
  /** Drop the latch for `runId` (called on run-settle to bound the set). */
  clear(runId: string): void;
}

export function createOperatorStopRegistry(): OperatorStopRegistry {
  const latched = new Set<string>();
  return {
    request(runId: string): void {
      latched.add(runId);
    },
    checker(runId: string): () => boolean {
      return () => latched.has(runId);
    },
    clear(runId: string): void {
      latched.delete(runId);
    },
  };
}
