import type { CSSProperties } from 'react';

/**
 * DegradedState — the run continues but evidence is partial: the honest-degradation surface. The
 * system tells the truth when something is off, never hides it (DS rule #5). Announced via
 * role="status". TS-strict port of docs/doppl-design-system/components/feedback/SystemState.jsx.
 */
export interface DegradedStateProps {
  kind?: 'novelty_degraded' | 'langfuse_off' | 'provider_failure' | 'all_culled';
  detail?: string;
}

interface DegradedSpec {
  label: string;
  note: string;
}

const DEGRADED: Record<NonNullable<DegradedStateProps['kind']>, DegradedSpec> = {
  novelty_degraded: {
    label: 'Novelty degraded',
    note: 'Showing estimated novelty; the fitness novelty-component is flagged.',
  },
  langfuse_off: {
    label: 'Tracing off',
    note: 'Trace links unavailable — local metadata only.',
  },
  provider_failure: {
    label: 'Provider failure',
    note: 'Affected lineages flagged; switch to the fallback ladder if it persists.',
  },
  all_culled: {
    label: 'No survivors',
    note: 'Generation completed with 0 survivors — strongest culled lineage shown.',
  },
};

const STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  fontFamily: 'var(--font-ui)',
  fontSize: 13,
  color: 'var(--health-degraded)',
  padding: 'var(--space-2) var(--space-3)',
  borderRadius: 'var(--radius-sm)',
  border: 'thin dashed var(--health-degraded)',
  background: 'color-mix(in oklab, var(--warning) 8%, transparent)',
};

export function DegradedState({ kind = 'novelty_degraded', detail }: DegradedStateProps) {
  const d = DEGRADED[kind];
  return (
    <div role="status" style={STYLE}>
      <span aria-hidden="true" style={{ fontSize: 15 }}>
        ⚠
      </span>
      <span style={{ fontWeight: 600 }}>{d.label}</span>
      <span style={{ color: 'var(--fg-muted)' }}>— {detail || d.note}</span>
    </div>
  );
}
