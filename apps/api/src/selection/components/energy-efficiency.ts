import type { EnergyEvent } from '@doppl/contracts';

/**
 * Energy-efficiency fitness component (P5.4, ARCHITECTURE.md §4/§5/§8).
 *
 * Pure over the candidate's agenome's persisted `energy.spent` events. SUCCESS-ONLY by construction
 * (KEY SAFETY RULE #8): the input is `EnergyEvent[]`, which has NO failure member — failed / retried /
 * repaired attempts are separate `provider_call_failed` events the caller never passes in, so they
 * contribute zero structurally. Read-only over persisted events (no live counters) →
 * replay-reconstructable.
 *
 * value = 1 / (1 + totalActualSpend) over the reconciled `actual` spend; zero successful spend → 1.0
 * (defined boundary — the denominator is always ≥ 1, so no divide-by-zero). The do-nothing→max
 * incentive is mitigated downstream — P5.6 combines efficiency with achievement (judge/critic).
 */
export interface EnergyEfficiencyResult {
  value: number;
  explanation: string;
}

export function energyEfficiency(energyEvents: readonly EnergyEvent[]): EnergyEfficiencyResult {
  const totalActualSpend = energyEvents.reduce((sum, event) => sum + event.actual, 0);
  const value = 1 / (1 + totalActualSpend);
  const explanation =
    `Energy efficiency ${value} = 1 / (1 + ${totalActualSpend}) over ` +
    `${energyEvents.length} energy.spent event(s) (success-only reconciled actual spend).`;
  return { value, explanation };
}
