// @vitest-environment happy-dom
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { validRunCaps, validRunConfig } from '@doppl/contracts';
import type { RunEventEnvelope } from '@doppl/contracts';
import { EnergyPanel } from '../../../src/panels/EnergyPanel';
import { makeEvent } from '../../fixtures/events';

const PANELS_DIR = resolve(process.cwd(), 'src/panels');

afterEach(() => cleanup());

function energyEvent(sequence: number, agenomeId: string, actual: number): RunEventEnvelope {
  return makeEvent(sequence, 'energy.spent', {
    agenomeId,
    payload: {
      id: `en_${sequence}`,
      runId: 'run_1',
      agenomeId,
      eventType: 'llm',
      estimate: actual,
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

describe('EnergyPanel — energy-per-agenome panel', () => {
  // renders per-agenome rows + budget progress; rows expose the lineage link target + fire onSelectAgenome.
  it('test_renders_rows_and_budget_and_links', () => {
    const onSelectAgenome = vi.fn();
    render(
      <EnergyPanel
        events={[
          configuredEvent(0, 1000),
          energyEvent(1, 'agn_0', 400),
          energyEvent(2, 'agn_1', 200),
        ]}
        onSelectAgenome={onSelectAgenome}
      />,
    );
    expect(screen.getByText('agn_0')).toBeTruthy();
    expect(screen.getByText('agn_1')).toBeTruthy();
    // budget progress is shown (spent 600 of 1000).
    expect(screen.getByText(/600/)).toBeTruthy();
    expect(screen.getByText(/1000/)).toBeTruthy();
    // the row link target is the agenomeId (the P7.7 dataRef); clicking fires onSelectAgenome.
    const link = screen.getByText('agn_0');
    expect(link.closest('[data-lineage-ref="agn_0"]')).toBeTruthy();
    fireEvent.click(link);
    expect(onSelectAgenome).toHaveBeenCalledWith('agn_0');
  });

  // spec(§5): a distinct energy_exhausted state surfaces when the event is present.
  it('test_exhausted_state_surfaces', () => {
    render(
      <EnergyPanel
        events={[
          configuredEvent(0, 500),
          energyEvent(1, 'agn_0', 500),
          makeEvent(2, 'energy_exhausted', { payload: {} }),
        ]}
      />,
    );
    expect(screen.getByText(/exhausted/i)).toBeTruthy();
  });

  // spec(§12 partial-data): zero data → an empty-state affordance (no throw/blank).
  it('test_partial_data_empty_state', () => {
    render(<EnergyPanel events={[]} />);
    expect(screen.getByText(/no energy data/i)).toBeTruthy();
  });

  // spec(rule #6): the panel imports nothing from apps/api.
  it('test_no_apps_api_import', () => {
    const files = readdirSync(PANELS_DIR).filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const src = readFileSync(`${PANELS_DIR}/${f}`, 'utf8');
      expect(src, f).not.toMatch(/from\s+['"][^'"]*apps\/api/);
      expect(src, f).not.toMatch(/@doppl\/api/);
    }
  });

  // spec(_adherence): styling colors via var() tokens — no raw hex (geometry numerics exempt).
  it('test_no_raw_hex', () => {
    const files = readdirSync(PANELS_DIR).filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));
    for (const f of files) {
      const src = readFileSync(`${PANELS_DIR}/${f}`, 'utf8');
      expect(src, `${f} contains a raw hex color`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    }
  });
});
