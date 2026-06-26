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
        onOpenCard={noop}
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
      <RunCard
        run={summary({ status: null })}
        onOpenCard={noop}
        onOpenLive={noop}
        onReplay={noop}
        onFinal={noop}
      />,
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
        onOpenCard={noop}
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
        onOpenCard={noop}
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
        onOpenCard={noop}
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
        onOpenCard={noop}
        onOpenLive={noop}
        onReplay={noop}
        onFinal={noop}
      />,
    );
    expect(screen.queryByRole('button', { name: /open live|replay|final idea/i })).toBeNull();
  });

  // spec(card-as-link): clicking anywhere on the card body fires onOpenCard with the run id; clicking
  // one of the per-action buttons fires only that action (stopPropagation — the card click does NOT
  // also fire).
  it('test_card_body_click_navigates_actions_stop_propagation', () => {
    const onOpenCard = vi.fn();
    const onReplay = vi.fn();
    render(
      <RunCard
        run={summary({ runId: 'r_card', status: 'completed' })}
        onOpenCard={onOpenCard}
        onOpenLive={noop}
        onReplay={onReplay}
        onFinal={noop}
      />,
    );
    // Card body click (the outer button, NOT one of the inner action buttons) → onOpenCard.
    screen.getByRole('button', { name: /open run r_card/i }).click();
    expect(onOpenCard).toHaveBeenCalledWith('r_card');
    expect(onReplay).not.toHaveBeenCalled();

    onOpenCard.mockClear();
    // Inner action button click → only the action fires, NOT a bubbled card click.
    screen.getByRole('button', { name: /replay/i }).click();
    expect(onReplay).toHaveBeenCalledWith('r_card');
    expect(onOpenCard).not.toHaveBeenCalled();
  });
});
