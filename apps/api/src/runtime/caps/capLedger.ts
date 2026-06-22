import type { RunCaps } from '@doppl/contracts';
import type { CapDimension } from './capEnforcer';

/**
 * P3.4 — cap ledger (ARCHITECTURE.md §5). A PURE view of consumed-vs-remaining per dimension, queried by
 * the worker + `GET /runs/:id/health` (P3.12) so they read cap state without re-deriving it. Sourcing the
 * `consumed` tallies (live accumulation vs event-fold) is the worker's concern — out of scope here.
 */

export interface CapLedgerView {
  /** Per dimension: `max(0, cap - consumed)` — never negative. */
  readonly remaining: Record<CapDimension, number>;
  /** Per dimension: `consumed >= cap` — at or over the ceiling (no headroom left). */
  readonly breached: Record<CapDimension, boolean>;
}

const DIMENSIONS: readonly CapDimension[] = [
  'maxPopulation',
  'maxGenerations',
  'energyBudget',
  'maxSpawnDepth',
  'maxToolCalls',
  'wallClockTimeoutMs',
];

/**
 * Compute the ledger view. Pure: reads `consumed` + `caps`, mutates neither; same inputs → equal view.
 */
export function capLedger(consumed: Record<CapDimension, number>, caps: RunCaps): CapLedgerView {
  const remaining = {} as Record<CapDimension, number>;
  const breached = {} as Record<CapDimension, boolean>;
  for (const dimension of DIMENSIONS) {
    remaining[dimension] = Math.max(0, caps[dimension] - consumed[dimension]);
    breached[dimension] = consumed[dimension] >= caps[dimension];
  }
  return { remaining, breached };
}
