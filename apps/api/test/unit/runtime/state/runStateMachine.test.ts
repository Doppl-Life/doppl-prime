import { describe, expect, test } from 'vitest';
import type { RunStatus } from '@doppl/contracts';
import { canTransitionRun } from '../../../../src/runtime/state/runStateMachine';

/**
 * P3.2 Run state machine (ARCHITECTURE.md §3). Closed transition set; terminal = {completed, stopped,
 * failed, cancelled} → no outgoing transition. Pure guard.
 */

const LEGAL: ReadonlyArray<[RunStatus, RunStatus]> = [
  ['configured', 'running'],
  ['configured', 'cancelled'],
  ['running', 'completing'],
  ['running', 'stopping'],
  ['running', 'failed'],
  ['completing', 'completed'],
  ['stopping', 'stopped'],
];
const TERMINALS: readonly RunStatus[] = ['completed', 'stopped', 'failed', 'cancelled'];
const ALL: readonly RunStatus[] = [
  'configured',
  'running',
  'completing',
  'completed',
  'stopping',
  'stopped',
  'failed',
  'cancelled',
];

describe('canTransitionRun — §3 run lifecycle', () => {
  // spec(§3) — every legal transition is accepted (positive guard, lesson §10).
  test('run_accepts_every_legal_transition', () => {
    for (const [from, to] of LEGAL) {
      expect(canTransitionRun(from, to), `${from}->${to}`).toEqual({ allowed: true });
    }
  });

  // spec(§3) — a non-terminal disallowed pair → illegal_transition.
  test('run_rejects_illegal_transition', () => {
    expect(canTransitionRun('configured', 'running').allowed).toBe(true); // positive guard
    expect(canTransitionRun('configured', 'completed')).toEqual({
      allowed: false,
      reason: 'illegal_transition',
      from: 'configured',
      to: 'completed',
    });
  });

  // spec(§3) — no exit from any terminal state: every terminal × every target → from_terminal.
  test('run_no_exit_from_terminal', () => {
    for (const from of TERMINALS) {
      for (const to of ALL) {
        const d = canTransitionRun(from, to);
        expect(d.allowed, `${from}->${to}`).toBe(false);
        if (!d.allowed) expect(d.reason).toBe('from_terminal');
      }
    }
  });
});
