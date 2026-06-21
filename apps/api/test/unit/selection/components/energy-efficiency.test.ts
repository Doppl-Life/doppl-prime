import { describe, expect, test } from 'vitest';
import { EnergyEvent } from '@doppl/contracts';
import { energyEfficiency } from '../../../../src/selection/components/energy-efficiency';

/** A valid `energy.spent` EnergyEvent with the given reconciled `actual` spend (success-only). */
function spent(actual: number, eventType: EnergyEvent['eventType'] = 'llm'): EnergyEvent {
  return {
    id: `enr_${actual}_${eventType}`,
    runId: 'run_1',
    agenomeId: 'agn_1',
    eventType,
    estimate: actual,
    actual,
    unit: 'doppl_energy',
    reason: 'productive_spend',
  };
}

/**
 * Energy-efficiency component (P5.4, §4/§5/§8) — pure over the agenome's persisted `energy.spent`
 * events. Success-only by construction (the input is `EnergyEvent[]`, which has no failure member);
 * replay-reconstructable (no live counters).
 */
describe('energyEfficiency — success-only fitness component', () => {
  // 11 — spec(§4): the value derives from the summed reconciled `actual` spend.
  test('efficiency_sums_actual_spend', () => {
    const { value } = energyEfficiency([spent(3), spent(5)]);
    expect(value).toBe(1 / (1 + 8));
  });

  // 12 — spec(§5): zero successful spend is a defined boundary (Q5: → 1.0), never NaN/divide-by-zero.
  test('efficiency_zero_spend_defined_boundary', () => {
    const { value } = energyEfficiency([]);
    expect(Number.isNaN(value)).toBe(false);
    expect(value).toBe(1);
  });

  // 13 — spec(§8): value == the pinned formula 1/(1+totalActualSpend) for a known total.
  test('efficiency_formula', () => {
    const { value } = energyEfficiency([spent(10), spent(10), spent(5)]);
    expect(value).toBe(1 / (1 + 25));
  });

  // 14 — KEY SAFETY RULE #8: a provider_call_failed-shaped record is NOT a valid EnergyEvent, so it can
  // never enter the EnergyEvent[] the function sums (failed attempts debit no energy, structurally).
  test('efficiency_success_only', () => {
    const failureShaped = {
      id: 'enr_fail',
      runId: 'run_1',
      eventType: 'provider_call_failed',
      estimate: 5,
      actual: 5,
      unit: 'doppl_energy',
      reason: 'timeout',
    };
    expect(EnergyEvent.safeParse(failureShaped).success).toBe(false);
    const { value } = energyEfficiency([spent(3, 'tool'), spent(5, 'spawn')]);
    expect(value).toBe(1 / (1 + 8));
  });

  // 15 — spec(§8): the explanation references the events consumed (count + total spend) — explainable.
  test('efficiency_explanation_references_events', () => {
    const { explanation } = energyEfficiency([spent(3), spent(5)]);
    expect(explanation).toContain('2');
    expect(explanation).toContain('8');
  });

  // 16 — spec(§9): same persisted events → same value (replay-reconstructable).
  test('efficiency_deterministic', () => {
    const events = [spent(7), spent(2)];
    expect(energyEfficiency(events).value).toBe(energyEfficiency(events).value);
  });
});
