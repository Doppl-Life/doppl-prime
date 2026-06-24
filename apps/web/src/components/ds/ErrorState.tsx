import type { CSSProperties, ReactNode } from 'react';

/**
 * ErrorState — a recoverable failure (fetch failed, stream lost, provider unavailable). Offers a
 * Retry affordance + an optional secondary action. TS-strict port of
 * docs/doppl-design-system/components/feedback/SystemState.jsx (adherence-clean — --space tokens).
 */
export interface ErrorStateProps {
  title?: string;
  detail?: string;
  onRetry?: () => void;
  /** Secondary action (e.g. "Switch to replay"). */
  action?: ReactNode;
  severity?: 'recoverable' | 'fatal';
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

const RETRY_BTN: CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--fg-default)',
  background: 'var(--bg-surface-2)',
  border: 'thin solid var(--border-strong)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-2) var(--space-4)',
  cursor: 'pointer',
};

export function ErrorState({
  title = 'Something went wrong',
  detail,
  onRetry,
  action,
  severity = 'recoverable',
}: ErrorStateProps) {
  const accent = severity === 'fatal' ? 'var(--danger)' : 'var(--warning)';
  return (
    <div
      style={{
        ...WRAP,
        background: 'var(--danger-soft)',
        borderRadius: 'var(--radius-lg)',
        border: `thin solid ${accent}`,
      }}
    >
      <div aria-hidden="true" style={{ fontSize: 26, color: accent }}>
        △
      </div>
      <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--fg-default)' }}>{title}</div>
      {detail && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-muted)' }}>
          {detail}
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
        {onRetry && (
          <button type="button" onClick={onRetry} style={RETRY_BTN}>
            Retry
          </button>
        )}
        {action}
      </div>
    </div>
  );
}
