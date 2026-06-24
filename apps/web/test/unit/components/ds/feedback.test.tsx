// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import {
  DegradedState,
  EmptyState,
  ErrorState,
  LoadingState,
  ModeBanner,
} from '../../../../src/components/ds';

afterEach(() => cleanup());

describe('ds/feedback — ModeBanner + system-state shells', () => {
  // spec(rule #2 / §12): LIVE vs REPLAY are unmistakable — distinct text labels (not color alone),
  // role="status" for assistive tech, and the banner declares the top z-banner layer token.
  it('test_mode_banner_live_vs_replay_distinct', () => {
    const live = render(<ModeBanner mode="live" />);
    expect(screen.getByText(/LIVE/)).toBeTruthy();
    const liveBanner = screen.getByRole('status');
    expect(liveBanner.getAttribute('style')).toContain('--z-banner'); // top z-layer (rule #2)
    live.unmount();

    render(<ModeBanner mode="replay" />);
    expect(screen.getByText('REPLAY')).toBeTruthy();
    // the non-color "static, recorded" signal — never let a recording look live.
    expect(screen.getByText(/recorded run · no live calls/)).toBeTruthy();
  });

  // spec(§12): the four state shells render their title/label; ErrorState exposes an onRetry
  // affordance; DegradedState is an accessible, labelled honest-degradation surface (never blank).
  it('test_system_state_shells_render', () => {
    render(<EmptyState title="No runs yet" description="Seed your first run." />);
    expect(screen.getByText('No runs yet')).toBeTruthy();
    expect(screen.getByText('Seed your first run.')).toBeTruthy();
    cleanup();

    render(<LoadingState shape="graph" label="Loading runs…" />);
    expect(screen.getByText('Loading runs…')).toBeTruthy();
    cleanup();

    const onRetry = vi.fn();
    render(<ErrorState title="Fetch failed" detail="net::ERR" onRetry={onRetry} />);
    expect(screen.getByText('Fetch failed')).toBeTruthy();
    const retry = screen.getByRole('button', { name: /retry/i });
    retry.click();
    expect(onRetry).toHaveBeenCalledTimes(1);
    cleanup();

    render(<DegradedState kind="novelty_degraded" />);
    expect(screen.getByText('Novelty degraded')).toBeTruthy();
    expect(screen.getByRole('status')).toBeTruthy(); // announced, not silent
  });
});
