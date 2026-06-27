import type { CSSProperties } from 'react';

/**
 * ReplayScrubber (FV.8) — the replay step control: a native range slider over the persisted event
 * timeline + a mono "step N of M" readout. Pure presentational — the S2 shell holds the step state and
 * re-folds events[0..N] via foldAtStep (no refetch/provider, rule #7). Accessible: a labeled
 * <input type="range"> (keyboard-steppable); reduced-motion-safe (no animation). Token-only styling
 * (the amber accent mirrors the replay framing); pixel/legibility polish is the FV.9 /design-review pass.
 */
export interface ReplayScrubberProps {
  /** The number of persisted steps (events.length) — the slider max. */
  totalSteps: number;
  /** The current step index (0..totalSteps) — the parent holds this state. */
  value: number;
  /** Fired with the new numeric step index on scrub. */
  onChange: (step: number) => void;
}

const wrap: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-caption)',
  color: 'var(--fg-muted)',
  width: '100%',
};
const slider: CSSProperties = { flex: 1, accentColor: 'var(--info)' };
const readout: CSSProperties = { whiteSpace: 'nowrap', color: 'var(--fg-default)' };

export function ReplayScrubber({ totalSteps, value, onChange }: ReplayScrubberProps) {
  return (
    <div style={wrap}>
      <span aria-hidden="true">⏮</span>
      <input
        type="range"
        min={0}
        max={totalSteps}
        step={1}
        value={value}
        aria-label="Replay step"
        onChange={(e) => onChange(Number(e.target.value))}
        style={slider}
      />
      <span style={readout}>
        step {value} of {totalSteps}
      </span>
    </div>
  );
}
