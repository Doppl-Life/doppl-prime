import { describe, expect, test } from 'vitest';
import type { RunEventType } from '@doppl/contracts';
import { CURRENT_SCHEMA_VERSION } from '@doppl/contracts';
import type { RunEventRow } from '../../../../src/event-store';
import {
  activeRunGuard,
  isRunTerminal,
  type ActiveRunEntry,
} from '../../../../src/runtime/worker/activeRunGuard';

/**
 * P3.12 — single-active-run guard (ARCHITECTURE.md §5 "MVP serializes to one active run at a time —
 * kernel-enforced; replay is read-only and viewable concurrently"). A PURE decision: reject a new start
 * while ANY OTHER run is non-terminal. "Terminal" = the log carries one of the 4 REAL run-terminal events
 * (the set derived from `RUN_TERMINALS`, the same P3.11 uses); energy_exhausted is mid-flight ⇒ still active.
 */

let autoSeq = 0;
function row(type: RunEventType): RunEventRow {
  const sequence = autoSeq++;
  return {
    id: `e-${sequence}`,
    runId: 'run_a',
    generationId: null,
    agenomeId: null,
    candidateId: null,
    type,
    sequence,
    occurredAt: new Date(0),
    actor: 'runtime',
    correlationId: null,
    langfuseTraceId: null,
    langfuseObservationId: null,
    payload: {},
    schemaVersion: CURRENT_SCHEMA_VERSION,
  } as RunEventRow;
}

describe('activeRunGuard (P3.12 — kernel-authoritative single-active-run decision)', () => {
  // spec(§5) — a non-terminal OTHER run blocks a new start.
  test('rejects_start_when_nonterminal_run_exists', () => {
    const decision = activeRunGuard([{ runId: 'r-other', terminal: false }], 'r-new');
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.reason).toBe('run_already_active');
      expect(decision.activeRunId).toBe('r-other');
    }
  });

  // spec(§5) — every prior run terminal ⇒ a new start is allowed; a run never blocks ITSELF (excluded).
  test('allows_start_when_all_runs_terminal', () => {
    const terminal: readonly ActiveRunEntry[] = [
      { runId: 'a', terminal: true },
      { runId: 'b', terminal: true },
    ];
    expect(activeRunGuard(terminal, 'r-new').allowed).toBe(true);
    expect(activeRunGuard([{ runId: 'r-self', terminal: false }], 'r-self').allowed).toBe(true);
  });

  // spec(§5) — a read-only replay reads a TERMINAL run's log; it never executes/appends, so the replayed
  // run is terminal and never registers as active ⇒ a concurrent new start is allowed.
  test('replay_is_not_active', () => {
    expect(activeRunGuard([{ runId: 'r-replayed', terminal: true }], 'r-live').allowed).toBe(true);
  });

  // spec(§5/§3) — isRunTerminal detects the 4 REAL run-terminal events (set derived from RUN_TERMINALS);
  // energy_exhausted is mid-flight (NOT terminal ⇒ still active), a configured/running run is not terminal.
  test('is_run_terminal_detects_real_terminals', () => {
    expect(isRunTerminal([])).toBe(false);
    expect(isRunTerminal([row('run.configured')])).toBe(false);
    expect(isRunTerminal([row('run.configured'), row('run.started')])).toBe(false);
    expect(isRunTerminal([row('run.started'), row('energy_exhausted')])).toBe(false); // mid-flight
    for (const t of ['run.completed', 'run.failed', 'run.stopped', 'run.cancelled'] as const) {
      expect(isRunTerminal([row('run.started'), row(t)])).toBe(true);
    }
  });
});
