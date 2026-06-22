import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import type { RunEventEnvelope } from '../data/contracts';
import { deriveEnergyByAgenome, energyBudgetProgress } from './energyData';

/**
 * EnergyPanel — the §12 energy-per-agenome panel. Displays `doppl_energy` spend per agenome (from the
 * `energy.spent` events via the pure `deriveEnergyByAgenome`), making cost/energy scarcity legible as a
 * selection pressure (REQ-E-004). Reflects rule #8 success-only spend (the selector counts only
 * `energy.spent`; failures debit nothing) — the kernel is the authoritative ledger, the panel only
 * DISPLAYS. Shows progress against `RunCaps.energyBudget` (from `run.configured`) and surfaces the
 * kernel-owned `energy_exhausted` state distinctly (an accessible ⚠ chip — shape+label+color, not color
 * alone, rule #4). Each row links to the agenome's P7.7 lineage node by `agenomeId` (= its `dataRef`).
 * Read-only (safety rule #2). Mounted by the P7.14 shell.
 */
export interface EnergyPanelProps {
  events: readonly RunEventEnvelope[];
  /** Wired by the P7.14 shell to focus the agenome's lineage node (link target = agenomeId/dataRef). */
  onSelectAgenome?: (agenomeId: string) => void;
}

const wrap: CSSProperties = {
  display: 'grid',
  gap: 'var(--space-3)',
  fontFamily: 'var(--font-ui)',
};
const empty: CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-label)',
  color: 'var(--fg-muted)',
  padding: 'var(--space-4)',
};
const budgetLabel: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-label)',
  color: 'var(--fg-default)',
};
const track: CSSProperties = {
  height: 'var(--space-2)',
  background: 'var(--meter-track)',
  borderRadius: 'var(--radius-full)',
  overflow: 'hidden',
};
const exhaustedChip: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--space-1)',
  color: 'var(--danger)',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-caption)',
};
const rowList: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'grid',
  gap: 'var(--space-2)',
};
const rowButton: CSSProperties = {
  display: 'grid',
  gap: 'var(--space-1)',
  width: '100%',
  textAlign: 'left',
  background: 'var(--bg-surface)',
  border: 'thin solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
  padding: 'var(--space-2)',
  cursor: 'pointer',
  fontFamily: 'var(--font-ui)',
  color: 'var(--fg-default)',
};
const rowHead: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-caption)',
};

function pct(fraction: number): string {
  return `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`;
}

export function EnergyPanel({ events, onSelectAgenome }: EnergyPanelProps) {
  const rows = useMemo(() => deriveEnergyByAgenome(events), [events]);
  const budget = useMemo(() => energyBudgetProgress(events), [events]);

  if (rows.length === 0 && budget.spent === 0 && budget.budget === null) {
    return (
      <div role="img" aria-label="Energy per agenome — no data yet" style={empty}>
        No energy data yet — spend appears as agenomes do productive work.
      </div>
    );
  }

  const maxRow = rows.reduce((m, r) => Math.max(m, r.total), 0);
  const rowFraction = (total: number): number =>
    budget.budget && budget.budget > 0 ? total / budget.budget : maxRow > 0 ? total / maxRow : 0;

  return (
    <section aria-label="Energy per agenome" style={wrap}>
      <div style={{ display: 'grid', gap: 'var(--space-1)' }}>
        <span style={budgetLabel}>
          {budget.budget !== null
            ? `Energy ${budget.spent} / ${budget.budget} doppl_energy`
            : `Energy ${budget.spent} doppl_energy`}
        </span>
        {budget.fraction !== null && (
          <div style={track} role="progressbar" aria-valuenow={Math.round(budget.fraction * 100)}>
            <div
              style={{
                height: '100%',
                width: pct(budget.fraction),
                background: 'var(--energy-full)',
              }}
            />
          </div>
        )}
        {budget.exhausted && (
          <span role="status" style={exhaustedChip}>
            <span aria-hidden="true">⚠</span> Energy exhausted
          </span>
        )}
      </div>

      <ul style={rowList}>
        {rows.map((r) => (
          <li key={r.agenomeId}>
            <button
              type="button"
              data-lineage-ref={r.agenomeId}
              onClick={() => onSelectAgenome?.(r.agenomeId)}
              style={rowButton}
            >
              <span style={rowHead}>
                <span>{r.agenomeId}</span>
                <span>{r.total} doppl_energy</span>
              </span>
              <span style={track}>
                <span
                  style={{
                    display: 'block',
                    height: '100%',
                    width: pct(rowFraction(r.total)),
                    background: 'var(--energy-full)',
                  }}
                />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
