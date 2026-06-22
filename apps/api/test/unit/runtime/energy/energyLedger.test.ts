import { describe, expect, test } from 'vitest';
import { cumulativeSpend, type LedgerEvent } from '../../../../src/runtime/energy/energyLedger';

/**
 * P3.5 energy ledger (ARCHITECTURE.md §4/§5 — the kernel owns the energy ledger). A PURE cumulative fold
 * over `energy.spent` events summing ACTUAL `doppl_energy` per scope — feeds the P3.4 cap enforcer with
 * true successful spend (not estimated reservations). Non-energy events are ignored.
 */

function spent(
  runId: string,
  actual: number,
  extra: { generationId?: string; agenomeId?: string; estimate?: number } = {},
): LedgerEvent {
  return {
    type: 'energy.spent',
    payload: {
      id: `e_${runId}_${actual}_${extra.generationId ?? ''}_${extra.agenomeId ?? ''}`,
      runId,
      ...(extra.generationId ? { generationId: extra.generationId } : {}),
      ...(extra.agenomeId ? { agenomeId: extra.agenomeId } : {}),
      eventType: 'llm',
      estimate: extra.estimate ?? actual,
      actual,
      unit: 'doppl_energy',
      reason: 'llm_generation',
    },
  };
}

describe('energyLedger (P3.5 — cumulative success-only spend)', () => {
  test('cumulative_sums_actual_per_scope', () => {
    // spec(§4): sum ACTUAL over energy.spent events per run/generation/agenome scope; ignore non-energy.
    const events: LedgerEvent[] = [
      spent('run_1', 10, { generationId: 'gen_1', agenomeId: 'agn_1' }),
      spent('run_1', 20, { generationId: 'gen_1', agenomeId: 'agn_2' }),
      spent('run_1', 5, { generationId: 'gen_2', agenomeId: 'agn_3' }),
      spent('run_2', 99), // different run
      { type: 'critic.reviewed', payload: { foo: 'bar' } }, // non-energy → ignored
      { type: 'run.started', payload: {} }, // non-energy → ignored
    ];
    expect(cumulativeSpend(events, { kind: 'run', id: 'run_1' })).toBe(35); // 10+20+5
    expect(cumulativeSpend(events, { kind: 'generation', id: 'gen_1' })).toBe(30); // 10+20
    expect(cumulativeSpend(events, { kind: 'agenome', id: 'agn_1' })).toBe(10);
    expect(cumulativeSpend(events, { kind: 'run', id: 'run_2' })).toBe(99);
  });

  test('cumulative_uses_actual_not_estimate', () => {
    // spec(§4): the cap-relevant total is ACTUAL (true successful spend), NOT estimate.
    const events: LedgerEvent[] = [
      spent('run_1', 30, { estimate: 100 }), // estimate 100, actual 30
      spent('run_1', 7, { estimate: 1 }), // estimate 1, actual 7
    ];
    expect(cumulativeSpend(events, { kind: 'run', id: 'run_1' })).toBe(37); // 30+7 (actual), NOT 101
  });

  test('energy_ledger_is_pure', () => {
    // lesson §33/§26: same inputs → equal result; the input events are not mutated.
    const events: LedgerEvent[] = [spent('run_1', 10), spent('run_1', 20)];
    const snapshot = JSON.parse(JSON.stringify(events));
    expect(cumulativeSpend(events, { kind: 'run', id: 'run_1' })).toBe(
      cumulativeSpend(events, { kind: 'run', id: 'run_1' }),
    );
    expect(events).toEqual(snapshot);
  });
});
