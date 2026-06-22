import { describe, expect, test } from 'vitest';
import type { CandidateStatus } from '@doppl/contracts';
import { canTransitionCandidate } from '../../../../src/runtime/state/candidateStateMachine';

/**
 * P3.2 Candidate state machine (ARCHITECTURE.md §3) — the 4th + final kernel machine, completing P3.2.
 * The §3 candidate lifecycle incl. the structured-output repair FIX edge (created→repairing→under_review
 * / repairing→invalid; `repairing` live via kernel-018). Terminal = {selected, rejected, culled,
 * invalid}. Built on the existing shared `makeTransitionGuard` (kernel-017) — no new guard logic. Pure.
 */

const LEGAL: ReadonlyArray<[CandidateStatus, CandidateStatus]> = [
  ['created', 'under_review'],
  ['created', 'repairing'],
  ['created', 'invalid'],
  ['repairing', 'under_review'],
  ['repairing', 'invalid'],
  ['under_review', 'checked'],
  ['under_review', 'rejected'],
  ['checked', 'scored'],
  ['scored', 'selected'],
  ['scored', 'culled'],
];
const TERMINALS: readonly CandidateStatus[] = ['selected', 'rejected', 'culled', 'invalid'];
const ALL: readonly CandidateStatus[] = [
  'created',
  'repairing',
  'under_review',
  'checked',
  'scored',
  'selected',
  'rejected',
  'culled',
  'invalid',
];

describe('canTransitionCandidate — §3 candidate lifecycle', () => {
  // spec(§3) — every legal transition accepted (positive guard, lesson §10); exactly the 10 §3 edges.
  test('candidate_accepts_every_legal_transition', () => {
    for (const [from, to] of LEGAL) {
      expect(canTransitionCandidate(from, to), `${from}->${to}`).toEqual({ allowed: true });
    }
  });

  // spec(§3) — non-terminal disallowed pairs → illegal_transition.
  test('candidate_rejects_illegal_transition', () => {
    expect(canTransitionCandidate('created', 'under_review').allowed).toBe(true); // positive guard
    for (const [from, to] of [
      ['created', 'selected'],
      ['checked', 'under_review'],
      ['under_review', 'scored'],
    ] as ReadonlyArray<[CandidateStatus, CandidateStatus]>) {
      expect(canTransitionCandidate(from, to), `${from}->${to}`).toEqual({
        allowed: false,
        reason: 'illegal_transition',
        from,
        to,
      });
    }
  });

  // spec(§3) — no exit from any terminal: each terminal × every target → from_terminal.
  test('candidate_no_exit_from_terminal', () => {
    for (const from of TERMINALS) {
      for (const to of ALL) {
        const d = canTransitionCandidate(from, to);
        expect(d.allowed, `${from}->${to}`).toBe(false);
        if (!d.allowed) expect(d.reason).toBe('from_terminal');
      }
    }
  });

  // spec(§3) — the structured-output repair FIX edge (kernel-018 unblock): created→repairing,
  // repairing→under_review, repairing→invalid; repairing→checked ✗ (repair returns to under_review,
  // not directly to checked). The ≤1 repair budget itself is P3.8, not this pure guard.
  test('candidate_repair_edge', () => {
    expect(canTransitionCandidate('created', 'repairing')).toEqual({ allowed: true });
    expect(canTransitionCandidate('repairing', 'under_review')).toEqual({ allowed: true });
    expect(canTransitionCandidate('repairing', 'invalid')).toEqual({ allowed: true });
    expect(canTransitionCandidate('repairing', 'checked').allowed).toBe(false);
  });

  // spec(P3.2) — guards are pure: same (from,to) twice → equal decision.
  test('candidate_guard_is_pure', () => {
    expect(canTransitionCandidate('created', 'repairing')).toEqual(
      canTransitionCandidate('created', 'repairing'),
    );
    expect(canTransitionCandidate('repairing', 'checked')).toEqual(
      canTransitionCandidate('repairing', 'checked'),
    );
  });
});
