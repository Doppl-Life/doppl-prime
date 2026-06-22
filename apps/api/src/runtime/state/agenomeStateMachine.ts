import type { AgenomeStatus } from '@doppl/contracts';
import { makeTransitionGuard } from './transitionGuard';
import type { TransitionTable } from './transitionGuard';

/**
 * Agenome state machine (P3.2, ARCHITECTURE.md §3). Terminal = {failed, reproduced, culled}. The
 * energy-spending status is `active`; NO transition from spent/failed/culled re-enters it (rule
 * #8-adjacent — no energy spend after an agenome is spent/failed/culled). `spent → eligible_parent` is
 * a valid SHAPE here; the fitness-score precondition is a P3.10 kernel gate, not this pure guard
 * (lesson §6 — the guard encodes transition shape, the kernel owns the semantic precondition). Pure.
 */
export const AGENOME_TRANSITIONS: TransitionTable<AgenomeStatus> = {
  seeded: ['active'],
  active: ['spent', 'failed'],
  spent: ['eligible_parent'],
  eligible_parent: ['reproduced', 'culled'],
  failed: [],
  reproduced: [],
  culled: [],
};

export const AGENOME_TERMINALS: ReadonlySet<AgenomeStatus> = new Set<AgenomeStatus>([
  'failed',
  'reproduced',
  'culled',
]);

export const canTransitionAgenome = makeTransitionGuard(AGENOME_TRANSITIONS, AGENOME_TERMINALS);
