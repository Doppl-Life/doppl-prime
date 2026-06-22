import type { RunEventRow } from '../../event-store';
import { RUN_TERMINALS } from '../state/runStateMachine';

/**
 * P3.12 — single-active-run guard (ARCHITECTURE.md §5 "MVP serializes to one active run at a time —
 * kernel-enforced; replay is read-only and viewable concurrently"). PURE decisions over the authoritative
 * log: reject a new start while ANY OTHER run is non-terminal. "Terminal" = the log carries one of the 4
 * REAL run-terminal events — the set derived DIRECTLY from `RUN_TERMINALS` (the P3.2 run state machine), so
 * there is no fold mirroring `projections/reducers/lifecycle.ts`. `energy_exhausted` is mid-flight (∉ the
 * set ⇒ still active), consistent with P3.11. A replayed run is terminal in the log ⇒ never active.
 */

/** The 4 real run-terminal EVENT types: a terminal status `s` (∈ RUN_TERMINALS) is reached by `run.${s}`. */
const RUN_TERMINAL_EVENTS: ReadonlySet<string> = new Set(
  [...RUN_TERMINALS].map((status) => `run.${status}`),
);

/** Whether a run's log shows it reached a terminal (a real run-terminal event is present). */
export function isRunTerminal(log: readonly RunEventRow[]): boolean {
  return log.some((row) => RUN_TERMINAL_EVENTS.has(row.type));
}

export interface ActiveRunEntry {
  readonly runId: string;
  /** Derived via `isRunTerminal` over the run's persisted log. A non-terminal run is "active". */
  readonly terminal: boolean;
}

export type ActiveRunDecision =
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      readonly reason: 'run_already_active';
      readonly activeRunId: string;
    };

/**
 * Decide whether `candidateRunId` may start: reject if any OTHER run is non-terminal (active). The
 * candidate is excluded from the scan (a run never blocks itself — run-level idempotency handles a
 * candidate that is itself already running/terminal). Pure: same input → same decision.
 */
export function activeRunGuard(
  runs: readonly ActiveRunEntry[],
  candidateRunId: string,
): ActiveRunDecision {
  for (const run of runs) {
    if (run.runId === candidateRunId) continue;
    if (!run.terminal) {
      return { allowed: false, reason: 'run_already_active', activeRunId: run.runId };
    }
  }
  return { allowed: true };
}
