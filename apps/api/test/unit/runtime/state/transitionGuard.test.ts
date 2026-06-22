import { describe, expect, test } from 'vitest';
import { makeTransitionGuard } from '../../../../src/runtime/state/transitionGuard';

/**
 * P3.2 shared transition-guard builder (ARCHITECTURE.md §3/§5, lesson §5 single-source). A pure
 * `(from,to) → {allowed:true} | {allowed:false, reason, from, to}` over a per-machine table + a
 * terminal set: a from-terminal attempt → `from_terminal`; a non-terminal disallowed pair →
 * `illegal_transition`; a listed edge → allowed. The table IS the spec; this is the one builder all
 * four machines share. Never emits/mutates.
 */

type S = 'a' | 'b' | 'c' | 't';
const TABLE: Readonly<Record<S, readonly S[]>> = { a: ['b'], b: ['c'], c: ['t'], t: [] };
const TERMINALS: ReadonlySet<S> = new Set<S>(['t']);
const guard = makeTransitionGuard(TABLE, TERMINALS);

describe('makeTransitionGuard — pure table-driven decision (§3/§5)', () => {
  // spec(§3) — a listed edge is allowed.
  test('makeTransitionGuard_allows_listed_transition', () => {
    expect(guard('a', 'b')).toEqual({ allowed: true });
    expect(guard('c', 't')).toEqual({ allowed: true });
  });

  // spec(§3) — a non-terminal disallowed pair → illegal_transition, echoing from/to (enum values, safe).
  test('makeTransitionGuard_rejects_unlisted_pair', () => {
    expect(guard('a', 'b').allowed).toBe(true); // positive guard
    expect(guard('a', 'c')).toEqual({
      allowed: false,
      reason: 'illegal_transition',
      from: 'a',
      to: 'c',
    });
  });

  // spec(§3) — a from-terminal attempt → distinct from_terminal reason (a likely-bug, not a wrong pair).
  test('makeTransitionGuard_rejects_from_terminal', () => {
    expect(guard('c', 't').allowed).toBe(true); // positive guard
    expect(guard('t', 'a')).toEqual({
      allowed: false,
      reason: 'from_terminal',
      from: 't',
      to: 'a',
    });
  });

  // spec(P3.2) — pure: same (from,to) twice → equal decision; no observable module-level mutation.
  test('makeTransitionGuard_is_pure', () => {
    expect(guard('a', 'b')).toEqual(guard('a', 'b'));
    expect(guard('a', 'z' as S)).toEqual(guard('a', 'z' as S));
  });
});
