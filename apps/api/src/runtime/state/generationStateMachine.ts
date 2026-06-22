import type { GenerationStatus } from '@doppl/contracts';
import { makeTransitionGuard } from './transitionGuard';
import type { TransitionTable } from './transitionGuard';

/**
 * Generation state machine (P3.2, ARCHITECTURE.md §3) — the §3 closed set incl. the resolved FIX edges:
 * `running → degraded → verifying` (partial-failure; `degraded` from kernel-016, one-shot — not
 * re-enterable), `scoring → completed` (zero-survivors), and per-state `{running,verifying,scoring,
 * reproducing} → failed` (deadline/wall-clock/kill). Terminal = {completed, failed, skipped}. Pure guard.
 */
export const GENERATION_TRANSITIONS: TransitionTable<GenerationStatus> = {
  pending: ['running', 'skipped'],
  running: ['verifying', 'degraded', 'failed'],
  degraded: ['verifying'],
  verifying: ['scoring', 'failed'],
  scoring: ['reproducing', 'completed', 'failed'],
  reproducing: ['completed', 'failed'],
  completed: [],
  failed: [],
  skipped: [],
};

export const GENERATION_TERMINALS: ReadonlySet<GenerationStatus> = new Set<GenerationStatus>([
  'completed',
  'failed',
  'skipped',
]);

export const canTransitionGeneration = makeTransitionGuard(
  GENERATION_TRANSITIONS,
  GENERATION_TERMINALS,
);
