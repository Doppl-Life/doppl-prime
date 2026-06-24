import type { CSSProperties } from 'react';

/**
 * LoadingState — data in flight; skeletons matching the target layout (less jarring on a projector
 * than a spinner). The shimmer sweep uses the named --motion-shimmer-ms token (DS rule #4); the
 * global prefers-reduced-motion guard in tokens/base.css neutralizes it. TS-strict port of
 * docs/doppl-design-system/components/feedback/SystemState.jsx.
 */
export interface LoadingStateProps {
  shape?: 'graph' | 'card' | 'chart' | 'inspector' | 'inline';
  label?: string;
}

const WRAP: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
  justifyContent: 'center',
  textAlign: 'center',
  gap: 10,
  padding: 'var(--space-6) var(--space-5)',
  fontFamily: 'var(--font-ui)',
  color: 'var(--fg-muted)',
};

function rowCount(shape: NonNullable<LoadingStateProps['shape']>): number {
  if (shape === 'graph') return 3;
  if (shape === 'chart') return 2;
  if (shape === 'inspector') return 5;
  return 2;
}

export function LoadingState({ shape = 'inline', label = 'Loading…' }: LoadingStateProps) {
  const shimmer: CSSProperties = {
    height: shape === 'graph' ? 40 : 14,
    borderRadius: 'var(--radius-sm)',
    backgroundImage:
      'linear-gradient(90deg, var(--bg-surface) 0%, var(--bg-surface-2) 40%, var(--bg-surface) 80%)',
    backgroundSize: '220% 100%',
    animation: 'doppl-shimmer var(--motion-shimmer-ms) linear infinite',
  };
  return (
    <div style={WRAP}>
      {Array.from({ length: rowCount(shape) }).map((_, i) => (
        <div key={i} style={{ ...shimmer, width: i % 2 ? '78%' : '100%' }} />
      ))}
      <div style={{ fontSize: 13, color: 'var(--fg-faint)', textAlign: 'center', marginTop: 4 }}>
        {label}
      </div>
    </div>
  );
}
