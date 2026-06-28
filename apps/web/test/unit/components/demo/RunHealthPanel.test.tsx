// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { RunHealthPanel } from '../../../../src/components/demo/RunHealthPanel';
import type { RunHealth } from '../../../../src/data/health';

/**
 * PD.6 — RunHealthPanel BEHAVIOR (deterministic-in-CI regardless of the Playwright e2e, apps/web L§10):
 * renders the continue-vs-switch signal (generation / in-flight / last-event-at) + a colorblind-safe
 * freshness badge (shape+icon+LABEL — never color alone, rule #4) reading healthy / stale / absent.
 * `now` is injected for deterministic staleness.
 */

const NOW = 1_700_000_000_000;
const freshHealth: RunHealth = {
  runId: 'run_1',
  generationCount: 2,
  candidatesInFlight: 1,
  lastEventAt: new Date(NOW - 1_000).toISOString(),
  capsConsumed: { generations: { consumed: 2, ceiling: 5 } },
};

afterEach(() => cleanup());

describe('RunHealthPanel (PD.6 — continue-vs-switch surfacing)', () => {
  // §12/§13 — renders the health signal + a HEALTHY badge (label, not color-only) for fresh health.
  it('renders_health_signal', () => {
    render(<RunHealthPanel health={freshHealth} now={() => NOW} />);
    expect(screen.getByText(/generation 2/i)).toBeTruthy(); // specific — the capsConsumed key won't collide
    expect(screen.getByText(/in flight/i)).toBeTruthy();
    expect(screen.getByText(/healthy/i)).toBeTruthy(); // colorblind-safe label
  });

  // §17 + rule #4 — a stale last-event flags the continue-vs-switch cue (shape+label, colorblind-safe).
  it('flags_stale_health', () => {
    const stale: RunHealth = { ...freshHealth, lastEventAt: new Date(NOW - 60_000).toISOString() };
    render(<RunHealthPanel health={stale} now={() => NOW} />);
    expect(screen.getByText(/stale/i)).toBeTruthy();
    expect(screen.getByText(/replay/i)).toBeTruthy(); // "consider switching to replay"
  });

  // §13 — absent health (no signal) is visibly flagged, never blank.
  it('flags_absent_health', () => {
    render(<RunHealthPanel health={null} now={() => NOW} />);
    expect(screen.getByText(/unavailable/i)).toBeTruthy();
  });
});
