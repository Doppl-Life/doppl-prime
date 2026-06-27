import type { CSSProperties } from 'react';
import type { RunFilter, RunFilterCounts } from './runsSummary';

/**
 * RunsFilterBar — the runs-table toolbar: status filter chips (with per-bucket counts) plus a
 * free-text search. Fully controlled (the screen owns the state); emits intent via onFilter/onSearch.
 * Filtering is client-side over the already-loaded list — no refetch (rule #2 read path). Status is
 * encoded by label + count + selected-state, never color alone. Tokens only (run/ adherence test).
 */
export interface RunsFilterBarProps {
  filter: RunFilter;
  query: string;
  counts: RunFilterCounts;
  onFilter: (next: RunFilter) => void;
  onSearch: (query: string) => void;
}

const CHIPS: readonly { key: RunFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'running', label: 'Running' },
  { key: 'complete', label: 'Complete' },
  { key: 'failed', label: 'Failed' },
];

const bar: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
  flexWrap: 'wrap',
};
const chipRow: CSSProperties = { display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' };
const baseChip: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-label)',
  padding: 'var(--space-1) var(--space-3)',
  borderRadius: 'var(--radius-full)',
  border: 'thin solid var(--border-subtle)',
  background: 'transparent',
  color: 'var(--fg-muted)',
  cursor: 'pointer',
};
const activeChip: CSSProperties = {
  ...baseChip,
  border: 'thin solid var(--accent)',
  background: 'var(--accent-soft)',
  color: 'var(--accent)',
};
const countPill: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-mono)',
  opacity: 0.85,
};
const searchWrap: CSSProperties = { marginLeft: 'auto', position: 'relative' };
const search: CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-label)',
  color: 'var(--fg-default)',
  background: 'var(--bg-surface)',
  border: 'thin solid var(--border-strong)',
  borderRadius: 'var(--radius-sm)',
  padding: 'var(--space-2) var(--space-3)',
  minWidth: 'min(14rem, 60vw)',
};

export function RunsFilterBar({ filter, query, counts, onFilter, onSearch }: RunsFilterBarProps) {
  return (
    <div style={bar} role="toolbar" aria-label="Filter runs">
      <div style={chipRow} role="group" aria-label="Filter by status">
        {CHIPS.map(({ key, label }) => {
          const selected = filter === key;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={selected}
              onClick={() => onFilter(key)}
              style={selected ? activeChip : baseChip}
            >
              {label}
              <span style={countPill}>{counts[key]}</span>
            </button>
          );
        })}
      </div>
      <div style={searchWrap}>
        <input
          type="search"
          value={query}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search problems…"
          aria-label="Search runs by problem, idea, or id"
          style={search}
        />
      </div>
    </div>
  );
}
