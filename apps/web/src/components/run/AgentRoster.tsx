import type { CSSProperties } from 'react';
import type { LineageGraphProjection, LineageNode } from '@doppl/contracts';
import { EmptyState, Meter, StatusBadge } from '../ds';

/**
 * AgentRoster (FV.4) — the S2 left-rail roster, derived from the lineage's agenome nodes (no new API
 * call: the LineageGraphProjection + the event fold already carry agenome status). Each row shows the
 * agenome's status via the §12 StatusBadge (shape+icon+label, never color alone) + its id (the opaque
 * dataRef, machine-truth mono) + an energy Meter ONLY when the node actually carries one (honest —
 * LineageNode has no dedicated energy field; never fabricated). Empty/null → an honest SystemState.
 * FV.5 may wire onSelect → the inspector drawer.
 */
export interface AgentRosterProps {
  lineage: LineageGraphProjection | null;
  onSelect?: (dataRef: string) => void;
}

const list: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'grid',
  gap: 'var(--space-2)',
};
const row: CSSProperties = {
  display: 'grid',
  gap: 'var(--space-1)',
  background: 'var(--bg-surface)',
  border: 'thin solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
  padding: 'var(--space-2) var(--space-3)',
  width: '100%',
  textAlign: 'left',
  cursor: 'pointer',
  fontFamily: 'var(--font-ui)',
  color: 'var(--fg-default)',
};
const idText: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-mono)',
  color: 'var(--fg-muted)',
};

/** Energy value (0–1) IF the node carries one — honest, never fabricated. */
function energyOf(node: LineageNode): number | null {
  const e = node.metrics?.energy ?? node.metrics?.energyRemaining;
  return typeof e === 'number' ? e : null;
}

export function AgentRoster({ lineage, onSelect }: AgentRosterProps) {
  const agenomes = (lineage?.nodes ?? []).filter((n) => n.type === 'agenome');

  if (agenomes.length === 0) {
    return (
      <EmptyState icon="◌" title="No agenomes yet" description="The population seeds at gen-0." />
    );
  }

  return (
    <ul aria-label="Agent roster" style={list}>
      {agenomes.map((node) => {
        const energy = energyOf(node);
        const content = (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <StatusBadge domain="agenome" status={node.status ?? 'unknown'} size="sm" />
              <span style={{ marginLeft: 'auto', ...idText }}>{node.dataRef}</span>
            </div>
            {energy != null && <Meter kind="energy" value={energy} label="energy" height={6} />}
          </>
        );
        return (
          <li key={node.id}>
            {onSelect ? (
              <button type="button" onClick={() => onSelect(node.dataRef)} style={row}>
                {content}
              </button>
            ) : (
              <div style={row}>{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
