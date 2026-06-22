import type { EnergyEvent } from '@doppl/contracts';

/**
 * P3.5 — the energy ledger (ARCHITECTURE.md §4/§5 — the kernel owns the energy ledger). A PURE cumulative
 * fold over `energy.spent` events that sums the reconciled ACTUAL `doppl_energy` per scope, feeding the
 * P3.4 cap enforcer with TRUE successful spend (not estimated reservations that a failure would roll
 * back). Non-energy events are ignored.
 *
 * The fold TRUSTS the write-time validation boundary (P1.3 validated every payload at append) and casts
 * the persisted `energy.spent` payload without re-parsing — exactly the replay reader's discipline
 * (lesson §31: re-check ordering only, fold the validated row, never re-validate shape).
 */

export type EnergyScopeKind = 'run' | 'generation' | 'agenome';

export interface ScopeSelector {
  readonly kind: EnergyScopeKind;
  readonly id: string;
}

/** A persisted event as the worker reads it: the envelope `type` + its payload. */
export interface LedgerEvent {
  readonly type: string;
  readonly payload: unknown;
}

const ENERGY_SPENT_TYPE = 'energy.spent';

function matchesScope(event: EnergyEvent, scope: ScopeSelector): boolean {
  switch (scope.kind) {
    case 'run':
      return event.runId === scope.id;
    case 'generation':
      return event.generationId === scope.id;
    case 'agenome':
      return event.agenomeId === scope.id;
  }
}

/**
 * Sum the reconciled ACTUAL `doppl_energy` over the `energy.spent` events matching `scope`. Pure: reads
 * `events`, mutates nothing; same inputs → same total.
 */
export function cumulativeSpend(events: readonly LedgerEvent[], scope: ScopeSelector): number {
  let total = 0;
  for (const ev of events) {
    if (ev.type !== ENERGY_SPENT_TYPE) {
      continue; // ignore non-energy events
    }
    // Trust the append-time validation (lesson §31) — cast the validated payload, never re-parse.
    const event = ev.payload as EnergyEvent;
    if (matchesScope(event, scope)) {
      total += event.actual; // ACTUAL, not estimate — true successful spend
    }
  }
  return total;
}
