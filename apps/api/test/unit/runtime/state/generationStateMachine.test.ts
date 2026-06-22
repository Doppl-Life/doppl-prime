import { describe, expect, test } from 'vitest';
import type { GenerationStatus } from '@doppl/contracts';
import { canTransitionGeneration } from '../../../../src/runtime/state/generationStateMachine';

/**
 * P3.2 Generation state machine (ARCHITECTURE.md §3, incl. resolved FIX edges: degraded partial-failure
 * [kernel-016], zero-survivors scoring→completed, per-state→failed). Terminal = {completed, failed,
 * skipped}. Pure guard.
 */

const LEGAL: ReadonlyArray<[GenerationStatus, GenerationStatus]> = [
  ['pending', 'running'],
  ['pending', 'skipped'],
  ['running', 'verifying'],
  ['running', 'degraded'],
  ['running', 'failed'],
  ['degraded', 'verifying'],
  ['verifying', 'scoring'],
  ['verifying', 'failed'],
  ['scoring', 'reproducing'],
  ['scoring', 'completed'], // zero-survivors
  ['scoring', 'failed'],
  ['reproducing', 'completed'],
  ['reproducing', 'failed'],
];
const TERMINALS: readonly GenerationStatus[] = ['completed', 'failed', 'skipped'];

describe('canTransitionGeneration — §3 generation lifecycle', () => {
  test('generation_accepts_every_legal_transition', () => {
    for (const [from, to] of LEGAL) {
      expect(canTransitionGeneration(from, to), `${from}->${to}`).toEqual({ allowed: true });
    }
  });

  test('generation_rejects_illegal_transition', () => {
    expect(canTransitionGeneration('pending', 'running').allowed).toBe(true); // positive guard
    expect(canTransitionGeneration('pending', 'completed')).toEqual({
      allowed: false,
      reason: 'illegal_transition',
      from: 'pending',
      to: 'completed',
    });
  });

  test('generation_no_exit_from_terminal', () => {
    const ALL: readonly GenerationStatus[] = [
      'pending',
      'running',
      'degraded',
      'verifying',
      'scoring',
      'reproducing',
      'completed',
      'failed',
      'skipped',
    ];
    for (const from of TERMINALS) {
      for (const to of ALL) {
        const d = canTransitionGeneration(from, to);
        expect(d.allowed, `${from}->${to}`).toBe(false);
        if (!d.allowed) expect(d.reason).toBe('from_terminal');
      }
    }
  });

  // spec(§3) — partial-failure FIX edge (kernel-016 unblock): degraded is one-shot
  // running→degraded→verifying; degraded→running is NOT accepted.
  test('generation_degraded_partial_failure_edge', () => {
    expect(canTransitionGeneration('running', 'degraded')).toEqual({ allowed: true });
    expect(canTransitionGeneration('degraded', 'verifying')).toEqual({ allowed: true });
    expect(canTransitionGeneration('degraded', 'running').allowed).toBe(false);
    expect(canTransitionGeneration('verifying', 'degraded').allowed).toBe(false); // no re-entry
  });

  // spec(§3) — zero-survivors FIX: scoring→completed valid alongside scoring→reproducing.
  test('generation_zero_survivors_edge', () => {
    expect(canTransitionGeneration('scoring', 'completed')).toEqual({ allowed: true });
    expect(canTransitionGeneration('scoring', 'reproducing')).toEqual({ allowed: true });
  });

  // spec(§3) — per-state deadline/kill: running/verifying/scoring/reproducing→failed; pending→failed ✗.
  test('generation_per_state_failed_edges', () => {
    for (const from of ['running', 'verifying', 'scoring', 'reproducing'] as const) {
      expect(canTransitionGeneration(from, 'failed'), `${from}->failed`).toEqual({ allowed: true });
    }
    expect(canTransitionGeneration('pending', 'failed').allowed).toBe(false); // pending only →running/skipped
  });
});
