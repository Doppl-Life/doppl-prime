// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { RunCard } from '../../../../src/components/run/RunCard';
import type { RunSummary } from '../../../../src/data/runClient';

afterEach(() => cleanup());

function summary(over: Partial<RunSummary> = {}): RunSummary {
  return { runId: 'run_1', status: 'completed', sequenceThrough: 42, ...over };
}

const noop = () => undefined;

describe('RunCard — minimal machine-truth run card (FV.2)', () => {
  // spec(§12 / rule #4 / DS rule 5): the card shows exactly the RunSummary fields — runId (mono) +
  // run-domain StatusBadge (glyph + text label, never color alone) + sequenceThrough. No fabricated
  // title/energy/winner (RunSummary carries none).
  it('test_card_renders_summary_fields_and_badge', () => {
    render(
      <RunCard
        run={summary({ runId: 'run_7f3a', status: 'completed', sequenceThrough: 42 })}
        onOpenLive={noop}
        onReplay={noop}
        onFinal={noop}
      />,
    );
    expect(screen.getByText('run_7f3a')).toBeTruthy();
    expect(screen.getByText(/seq 42/i)).toBeTruthy();
    expect(screen.getByText('complete')).toBeTruthy(); // run.completed label (shape+label, not color)
    expect(document.querySelector('[aria-hidden="true"]')?.textContent).toBeTruthy(); // the glyph
  });

  // spec(§12 / null-safe): a null/unknown status renders the neutral badge, never crashes.
  it('test_card_null_status_neutral', () => {
    render(
      <RunCard run={summary({ status: null })} onOpenLive={noop} onReplay={noop} onFinal={noop} />,
    );
    expect(screen.getByText('unknown')).toBeTruthy(); // neutral handler
  });

  // spec(§12): per-card actions are derived from status — live→Open live; completed/stopped→Replay+Final
  // idea; failed/cancelled→Replay only; configured→no action. Clicking fires the matching callback.
  it('test_card_actions_derived_from_status', () => {
    // running → Open live only
    const onOpenLive = vi.fn();
    render(
      <RunCard
        run={summary({ runId: 'r_live', status: 'running' })}
        onOpenLive={onOpenLive}
        onReplay={noop}
        onFinal={noop}
      />,
    );
    expect(screen.queryByRole('button', { name: /replay/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /final idea/i })).toBeNull();
    screen.getByRole('button', { name: /open live/i }).click();
    expect(onOpenLive).toHaveBeenCalledWith('r_live');
    cleanup();

    // completed → Replay + Final idea (no Open live)
    const onReplay = vi.fn();
    const onFinal = vi.fn();
    render(
      <RunCard
        run={summary({ runId: 'r_done', status: 'completed' })}
        onOpenLive={noop}
        onReplay={onReplay}
        onFinal={onFinal}
      />,
    );
    expect(screen.queryByRole('button', { name: /open live/i })).toBeNull();
    screen.getByRole('button', { name: /replay/i }).click();
    screen.getByRole('button', { name: /final idea/i }).click();
    expect(onReplay).toHaveBeenCalledWith('r_done');
    expect(onFinal).toHaveBeenCalledWith('r_done');
    cleanup();

    // failed → Replay only (partial — no Final idea)
    render(
      <RunCard
        run={summary({ runId: 'r_fail', status: 'failed' })}
        onOpenLive={noop}
        onReplay={noop}
        onFinal={noop}
      />,
    );
    expect(screen.getByRole('button', { name: /replay/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /final idea/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /open live/i })).toBeNull();
    cleanup();

    // configured → no observe action yet (nothing to observe)
    render(
      <RunCard
        run={summary({ runId: 'r_cfg', status: 'configured' })}
        onOpenLive={noop}
        onReplay={noop}
        onFinal={noop}
      />,
    );
    expect(screen.queryByRole('button', { name: /open live|replay|final idea/i })).toBeNull();
  });
});
