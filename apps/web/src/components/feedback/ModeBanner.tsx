import type { CSSProperties } from 'react';
import type { RunStatus } from '../../data/contracts';
import type { RunMode } from '../../state/reducer';

/**
 * ModeBanner — the unmistakable, projector-legible LIVE vs REPLAY signal (ARCHITECTURE.md §12,
 * REQ-UX-002). A reviewer must NEVER confuse a recording for a live run: LIVE = cyan breathing dot;
 * REPLAY = amber hatched, static ribbon; COMPLETE/STOPPED/FAILED = steady terminal. Status is shape
 * + icon + label + color — never color alone (live pulses, replay is hatched + labelled). Renders at
 * the top z-banner layer so it can never be occluded (the persistent across-panels mount is the
 * P7.14 shell). TS-strict port of docs/doppl-design-system/components/feedback/ModeBanner.jsx;
 * adherence-clean (var() tokens only — the port fixes the prototype's raw-px styles).
 */

export type ModeBannerMode = 'live' | 'replay' | 'complete' | 'stopped' | 'failed';

export interface ModeBannerProps {
  mode?: ModeBannerMode;
  /** e.g. "Gen 3/5" — shown beside LIVE / terminal states. */
  generationLabel?: string;
  /** Recorded-at stamp shown on REPLAY. */
  recordedAt?: string;
  /** REPLAY only — stretch to a full-width hatched ribbon (projector). */
  fullWidth?: boolean;
}

/**
 * Derive the banner state from the run-store `mode` (live|replay) + the run's RunStatus. PURE +
 * TOTAL over all 8 frozen RunStatus values: `replay` overrides; otherwise non-terminal
 * (configured/running/completing) → `live`; `completed` → `complete`; stopping/stopped/cancelled →
 * `stopped`; `failed` → `failed`. (The live RunStatus is sourced from the stream at the P7.14 mount.)
 */
export function deriveMode(mode: RunMode, runStatus: RunStatus): ModeBannerMode {
  if (mode === 'replay') return 'replay';
  switch (runStatus) {
    case 'completed':
      return 'complete';
    case 'failed':
      return 'failed';
    case 'stopping':
    case 'stopped':
    case 'cancelled':
      return 'stopped';
    case 'configured':
    case 'running':
    case 'completing':
      return 'live';
  }
}

const BASE: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 9,
  fontFamily: 'var(--font-ui)',
  fontSize: 14,
  fontWeight: 600,
  lineHeight: 1,
  padding: 'var(--space-2) var(--space-4)',
  borderRadius: 'var(--radius-full)',
  letterSpacing: '0.02em',
};

// Amber hatch via a token (color-mix over --warning) + spacing-token stops — no raw rgba/px.
const REPLAY_HATCH =
  'repeating-linear-gradient(45deg, color-mix(in oklab, var(--warning) 16%, transparent) 0 var(--space-2), color-mix(in oklab, var(--warning) 5%, transparent) var(--space-2) var(--space-4))';

export function ModeBanner({
  mode = 'live',
  generationLabel,
  recordedAt,
  fullWidth,
}: ModeBannerProps) {
  if (mode === 'replay') {
    const style: CSSProperties = {
      ...BASE,
      borderRadius: 'var(--radius-sm)',
      color: 'var(--warning)',
      border: 'thin solid var(--warning)',
      background: REPLAY_HATCH,
    };
    if (fullWidth) {
      style.width = '100%';
      style.justifyContent = 'center';
    }
    return (
      <div role="status" style={style}>
        <span aria-hidden="true">⏮</span>
        <span>REPLAY</span>
        <span style={{ color: 'var(--fg-muted)', fontWeight: 400 }}>
          · recorded run · no live calls{recordedAt ? ` · ${recordedAt}` : ''}
        </span>
      </div>
    );
  }

  if (mode === 'complete' || mode === 'stopped' || mode === 'failed') {
    const color =
      mode === 'failed'
        ? 'var(--danger)'
        : mode === 'stopped'
          ? 'var(--warning)'
          : 'var(--success)';
    const glyph = mode === 'failed' ? '△' : mode === 'stopped' ? '■' : '✔';
    return (
      <div
        role="status"
        style={{
          ...BASE,
          color,
          border: `thin solid ${color}`,
          background: `color-mix(in oklab, ${color} 12%, transparent)`,
        }}
      >
        <span aria-hidden="true">{glyph}</span>
        <span>{mode.toUpperCase()}</span>
        {generationLabel && (
          <span style={{ color: 'var(--fg-muted)', fontWeight: 400 }}>· {generationLabel}</span>
        )}
      </div>
    );
  }

  // LIVE
  return (
    <div
      role="status"
      style={{
        ...BASE,
        color: 'var(--accent)',
        border: 'thin solid var(--accent)',
        background: 'var(--accent-soft)',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 9,
          height: 9,
          borderRadius: '50%',
          background: 'var(--accent)',
          boxShadow: 'var(--glow-active)',
          animation: 'doppl-pulse var(--motion-pulse-ms) var(--ease-in-out) infinite',
        }}
      />
      <span>● LIVE</span>
      {generationLabel && (
        <span style={{ color: 'var(--fg-default)', fontWeight: 500 }}>— {generationLabel}</span>
      )}
    </div>
  );
}
