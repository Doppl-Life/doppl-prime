import type { CandidateStatus } from '@doppl/contracts';
import { makeTransitionGuard } from './transitionGuard';
import type { TransitionTable } from './transitionGuard';

/**
 * Candidate state machine (P3.2, ARCHITECTURE.md §3) — the 4th + final kernel machine, completing P3.2.
 * The §3 candidate lifecycle incl. the structured-output repair FIX edge: `created → repairing →
 * under_review` (on a successful repair) and `repairing → invalid` (repair budget exhausted) — repair
 * returns to under_review, never directly to checked (`repairing` live via kernel-018). The ≤1 repair
 * budget itself is a P3.8 kernel gate, not this pure (from,to) guard (lesson §6). Terminal = {selected,
 * rejected, culled, invalid}. Built on the existing shared `makeTransitionGuard` (kernel-017) — no new
 * guard logic. Pure decide-only.
 */
export const CANDIDATE_TRANSITIONS: TransitionTable<CandidateStatus> = {
  created: ['under_review', 'repairing', 'invalid'],
  repairing: ['under_review', 'invalid'],
  under_review: ['checked', 'rejected'],
  checked: ['scored'],
  scored: ['selected', 'culled'],
  selected: [],
  rejected: [],
  culled: [],
  invalid: [],
};

export const CANDIDATE_TERMINALS: ReadonlySet<CandidateStatus> = new Set<CandidateStatus>([
  'selected',
  'rejected',
  'culled',
  'invalid',
]);

export const canTransitionCandidate = makeTransitionGuard(
  CANDIDATE_TRANSITIONS,
  CANDIDATE_TERMINALS,
);
