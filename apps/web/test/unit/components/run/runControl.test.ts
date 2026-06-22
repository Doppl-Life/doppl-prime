import { describe, expect, it } from 'vitest';
import type { RunEventType } from '@doppl/contracts';
import { foldEvents } from '../../../../src/state/reducer';
import {
  RUN_TERMINAL_TYPES,
  deriveStopControlState,
  isRunTerminal,
  selectRunStatus,
} from '../../../../src/components/run/runControl';
import { makeEvent } from '../../../fixtures/events';

describe('runControl — pure run-stop control logic', () => {
  // spec(§11): isRunTerminal is true for EXACTLY the 3 run-terminal RunEventType members; a non-
  // terminal run lifecycle, an in-flight marker, a non-run lifecycle, and a failure event are false.
  it('test_isRunTerminal_classifier', () => {
    const terminal: RunEventType[] = ['run.completed', 'run.failed', 'run.stopped'];
    for (const t of terminal) expect(isRunTerminal(t), t).toBe(true);
    expect(RUN_TERMINAL_TYPES.size).toBe(3); // closed set — `run.cancelled` is NOT a RunEventType
    const nonTerminal: RunEventType[] = [
      'run.configured',
      'run.started',
      'critic.review_started', // an in-flight observability marker
      'candidate.created', // a non-run lifecycle event
      'energy_exhausted', // a failure event, but not a run-terminal
    ];
    for (const t of nonTerminal) expect(isRunTerminal(t), t).toBe(false);
  });

  // selectRunStatus reads the run entity's latest run-level event type from store state.
  it('test_selectRunStatus_reads_run_entity', () => {
    const state = foldEvents([makeEvent(0, 'run.started'), makeEvent(1, 'run.stopped')]);
    expect(selectRunStatus(state, 'run_1')).toBe('run.stopped');
    // an unknown run id (no run-level event folded yet) → undefined, NEVER treated as terminal.
    expect(selectRunStatus(state, 'nope')).toBeUndefined();
  });

  // deriveStopControlState precedence: terminal > stopping > errored > idle. The authoritative
  // terminal (folded event) ALWAYS wins over a local in-flight/error state — no optimistic terminal,
  // no stale local status surviving a settled terminal.
  it('test_derive_precedence', () => {
    expect(
      deriveStopControlState({ runStatus: undefined, stopping: false, errored: false }),
    ).toMatchObject({ phase: 'idle', disabled: false, label: 'Stop run' });
    expect(
      deriveStopControlState({ runStatus: 'run.started', stopping: false, errored: false }),
    ).toMatchObject({ phase: 'idle', disabled: false });
    expect(
      deriveStopControlState({ runStatus: 'run.started', stopping: true, errored: false }),
    ).toMatchObject({ phase: 'stopping', disabled: true });
    expect(
      deriveStopControlState({ runStatus: 'run.started', stopping: false, errored: true }),
    ).toMatchObject({ phase: 'error', disabled: false });
    // terminal wins even when a local stop is in flight AND errored.
    expect(
      deriveStopControlState({ runStatus: 'run.stopped', stopping: true, errored: true }),
    ).toMatchObject({ phase: 'terminal', disabled: true, terminalStatus: 'run.stopped' });
  });
});
