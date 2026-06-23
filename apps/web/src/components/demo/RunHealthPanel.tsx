import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { RunHealth } from '../../data/health';
import { healthFreshness, type HealthFreshness } from './runHealthStale';

/**
 * RunHealthPanel (PD.6, ARCHITECTURE.md §12/§13/§17) — the operator continue-vs-switch surface. Renders
 * the run-health signal (generation / candidates-in-flight / last-event-at / caps-consumed where the
 * web-local RunHealth exposes it) plus a COLORBLIND-SAFE freshness badge (shape glyph + label + a `var()`
 * color — never color alone, rule #4) reading healthy / stale / absent. Read-only: it consumes the
 * fetched RunHealth + an injected clock and issues NO command (rule #2); SSE stays non-authoritative
 * (the shell's lastEventId resync, rule #3).
 *
 * INTEGRATION CARRY-FORWARDS (demo→cody merge, NOT PD.6): (i) reconcile the web-local RunHealth shape vs
 * the api (`currentGeneration`↔`generationCount`, flat↔nested `capsConsumed` — LESSONS §34); (ii) wire the
 * EventSource real `'error'` (connection-drop) listener (today: payload-validation onError→poll only).
 */
export interface RunHealthPanelProps {
  health: RunHealth | null;
  /** Injected clock for the staleness check (default `Date.now`); tests pass a fixed `now`. */
  now?: () => number;
}

interface BadgeSpec {
  readonly glyph: string;
  readonly label: string;
  readonly colorToken: string;
}

const BADGE: Record<HealthFreshness, BadgeSpec> = {
  healthy: { glyph: '●', label: 'healthy — live', colorToken: 'var(--success)' },
  stale: {
    glyph: '△',
    label: 'stale — consider switching to replay',
    colorToken: 'var(--warning)',
  },
  absent: {
    glyph: '○',
    label: 'health unavailable — consider switching to replay',
    colorToken: 'var(--fg-muted)',
  },
};

const row: CSSProperties = {
  display: 'flex',
  gap: 'var(--space-4)',
  alignItems: 'center',
  flexWrap: 'wrap',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-caption)',
  color: 'var(--fg-muted)',
};

export function RunHealthPanel({ health, now = () => Date.now() }: RunHealthPanelProps) {
  // Re-evaluate on a timer so a STALLED stream (no new events → no prop change → no re-render) still
  // flips to the stale badge once the threshold passes. The tick only forces a re-render; freshness is a
  // pure fn of the injected `now()`, so unit tests (fixed `now`) stay deterministic. Cleared on unmount.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 2_000);
    return () => clearInterval(id);
  }, []);

  const freshness = healthFreshness(health?.lastEventAt ?? null, now());
  const badge = BADGE[freshness];

  return (
    <section aria-label="Run health" role="status" style={row}>
      {health && (
        <>
          <span>generation {health.currentGeneration}</span>
          <span>{health.candidatesInFlight} in flight</span>
          <span>last event {health.lastEventAt ?? '—'}</span>
          {Object.entries(health.capsConsumed).map(([cap, used]) => (
            <span key={cap}>
              {cap} {used}
            </span>
          ))}
        </>
      )}
      {/* Colorblind-safe freshness badge: shape (glyph) + label + var() color — never color alone (rule #4). */}
      <span
        style={{
          display: 'inline-flex',
          gap: 'var(--space-1)',
          alignItems: 'center',
          color: badge.colorToken,
          fontFamily: 'var(--font-ui)',
        }}
        title={badge.label}
      >
        <span aria-hidden="true">{badge.glyph}</span>
        <span>{badge.label}</span>
      </span>
    </section>
  );
}
