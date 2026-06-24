import type { CSSProperties, ReactNode } from 'react';

/**
 * EmptyState — no data yet (pre-Gen-0 graph, no events, no candidates). One of the shared
 * system-state shells whose consistency makes degraded modes legible on a projector. TS-strict port
 * of docs/doppl-design-system/components/feedback/SystemState.jsx (adherence-clean — --space tokens).
 */
export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  /** Operator-only CTA (e.g. a <Button>). */
  action?: ReactNode;
}

const WRAP: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  gap: 8,
  padding: 'var(--space-6) var(--space-5)',
  fontFamily: 'var(--font-ui)',
  color: 'var(--fg-muted)',
};

export function EmptyState({ icon = '◌', title, description, action }: EmptyStateProps) {
  return (
    <div style={WRAP}>
      <div aria-hidden="true" style={{ fontSize: 30, color: 'var(--fg-faint)' }}>
        {icon}
      </div>
      <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--fg-default)' }}>{title}</div>
      {description && (
        <div style={{ fontSize: 14, color: 'var(--fg-muted)', maxWidth: 360 }}>{description}</div>
      )}
      {action && <div style={{ marginTop: 6 }}>{action}</div>}
    </div>
  );
}
