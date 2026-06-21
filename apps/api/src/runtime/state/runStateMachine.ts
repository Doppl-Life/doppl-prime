import type { RunStatus } from '@doppl/contracts';
import { makeTransitionGuard } from './transitionGuard';
import type { TransitionTable } from './transitionGuard';

/**
 * Run state machine (P3.2, ARCHITECTURE.md §3). The table IS the §3 closed transition set; terminal
 * statuses (completed/stopped/failed/cancelled) have no outgoing edge. Pure guard.
 */
export const RUN_TRANSITIONS: TransitionTable<RunStatus> = {
  configured: ['running', 'cancelled'],
  running: ['completing', 'stopping', 'failed'],
  completing: ['completed'],
  stopping: ['stopped'],
  completed: [],
  stopped: [],
  failed: [],
  cancelled: [],
};

export const RUN_TERMINALS: ReadonlySet<RunStatus> = new Set<RunStatus>([
  'completed',
  'stopped',
  'failed',
  'cancelled',
]);

export const canTransitionRun = makeTransitionGuard(RUN_TRANSITIONS, RUN_TERMINALS);
