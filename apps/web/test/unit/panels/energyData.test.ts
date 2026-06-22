import { describe, expect, it } from 'vitest';
import { validRunCaps, validRunConfig } from '@doppl/contracts';
import type { RunEventEnvelope } from '@doppl/contracts';
import { deriveEnergyByAgenome, energyBudgetProgress } from '../../../src/panels/energyData';
import { makeEvent } from '../../fixtures/events';

function energyEvent(sequence: number, agenomeId: string, actual: number): RunEventEnvelope {
  return makeEvent(sequence, 'energy.spent', {
    agenomeId,
    payload: {
      id: `en_${sequence}`,
      runId: 'run_1',
      agenomeId,
      eventType: 'llm',
      estimate: actual + 5, // estimate differs from actual — the selector must read `actual`
      actual,
      unit: 'doppl_energy',
      reason: 'generation',
    },
  });
}

function configuredEvent(sequence: number, energyBudget: number): RunEventEnvelope {
  return makeEvent(sequence, 'run.configured', {
    payload: { ...validRunConfig, caps: { ...validRunCaps, energyBudget } },
  });
}

describe('energyData — pure event-derived energy selectors (success-only, rule #8)', () => {
  // spec(REQ-E-004): sum EnergyEvent.actual per agenomeId from energy.spent events, ordered by first-seen.
  it('test_derive_energy_by_agenome_sums_actual', () => {
    const rows = deriveEnergyByAgenome([
      energyEvent(1, 'agn_0', 100),
      energyEvent(2, 'agn_0', 50),
      energyEvent(3, 'agn_1', 30),
    ]);
    expect(rows.map((r) => r.agenomeId)).toEqual(['agn_0', 'agn_1']); // first-seen sequence order
    expect(rows[0]).toMatchObject({ agenomeId: 'agn_0', total: 150, spendCount: 2 });
    expect(rows[1]).toMatchObject({ agenomeId: 'agn_1', total: 30, spendCount: 1 });
  });

  // spec(rule #8 / §5): provider_call_failed / output_schema_rejected (and any non-energy.spent type)
  // add NOTHING to an agenome's total — success-only spend.
  it('test_failures_do_not_debit_energy', () => {
    const rows = deriveEnergyByAgenome([
      energyEvent(1, 'agn_0', 100),
      makeEvent(2, 'provider_call_failed', { agenomeId: 'agn_0', payload: { reason: 'timeout' } }),
      makeEvent(3, 'output_schema_rejected', { agenomeId: 'agn_0', payload: { reason: 'bad' } }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ agenomeId: 'agn_0', total: 100, spendCount: 1 }); // failures excluded
  });

  // spec(§5): budget from RunConfig.caps.energyBudget (run.configured); spent = Σ energy.spent.actual;
  // exhausted from the energy_exhausted EVENT (not a client total≥budget compare).
  it('test_budget_progress_and_exhausted', () => {
    const base = [
      configuredEvent(0, 1000),
      energyEvent(1, 'agn_0', 400),
      energyEvent(2, 'agn_1', 200),
    ];
    const prog = energyBudgetProgress(base);
    expect(prog).toMatchObject({ budget: 1000, spent: 600, exhausted: false });
    expect(prog.fraction).toBeCloseTo(0.6);

    const exhausted = energyBudgetProgress([
      ...base,
      makeEvent(9, 'energy_exhausted', { payload: {} }),
    ]);
    expect(exhausted.exhausted).toBe(true);

    // no run.configured → budget null, fraction null (never throws / divides by zero)
    const noBudget = energyBudgetProgress([energyEvent(1, 'agn_0', 50)]);
    expect(noBudget).toMatchObject({ budget: null, spent: 50, fraction: null, exhausted: false });
  });

  // spec(§12 traceability): each row carries the lineage-node link target (agenomeId = the P7.7 dataRef).
  it('test_rows_link_to_lineage_node', () => {
    const rows = deriveEnergyByAgenome([energyEvent(1, 'agn_0', 10)]);
    expect(rows[0]!.agenomeId).toBe('agn_0'); // the dataRef the P7.7 graph resolves
  });

  // partial-data: zero events → empty rows + zero/null budget (no throw).
  it('test_selectors_zero_data', () => {
    expect(deriveEnergyByAgenome([])).toEqual([]);
    expect(energyBudgetProgress([])).toMatchObject({ budget: null, spent: 0, fraction: null });
  });
});
