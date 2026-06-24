// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RunListPanel } from '../../../../src/components/run/RunListPanel';
import type { RunSummary } from '../../../../src/data/runClient';

/**
 * PD.17 — RunListPanel: lists past runs (GET /runs via runClient.listRuns, reconciled PD.15) + clicking a
 * run observes it in REPLAY mode via onReplay (the existing Dashboard replay-switch). Read-only browse;
 * empty/loading/error states non-fatal; status via the §12 StatusBadge (shape+label+color, rule #4).
 */
const RUN_DIR = resolve(process.cwd(), 'src/components/run');
const SUMMARIES: RunSummary[] = [
  { runId: 'run_a', status: 'completed', sequenceThrough: 12 },
  { runId: 'run_b', status: 'running', sequenceThrough: 3 },
  { runId: 'run_c', status: null, sequenceThrough: 0 }, // a run with no current-state status
];

afterEach(() => cleanup());

describe('RunListPanel — run-list / replay browser (PD.17)', () => {
  // §12 — renders one entry per run (runId + status), incl. a null-status run (neutral badge).
  it('run_list_panel_renders_summaries', async () => {
    const listRuns = vi.fn(() => Promise.resolve(SUMMARIES));
    render(<RunListPanel runClient={{ listRuns }} onReplay={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('run_a')).toBeTruthy());
    expect(screen.getByText('run_b')).toBeTruthy();
    expect(screen.getByText('run_c')).toBeTruthy();
    expect(screen.getByLabelText('Run list')).toBeTruthy();
  });

  // §12/§11 — clicking a run observes it in REPLAY mode (onReplay called with the runId).
  it('run_list_click_switches_observed_run_replay', async () => {
    const listRuns = vi.fn(() => Promise.resolve(SUMMARIES));
    const onReplay = vi.fn();
    render(<RunListPanel runClient={{ listRuns }} onReplay={onReplay} />);
    await waitFor(() => screen.getByText('run_b'));
    fireEvent.click(screen.getByText('run_b').closest('button')!);
    expect(onReplay).toHaveBeenCalledWith('run_b');
  });

  // §12 — the currently-observed run is visually indicated (aria-current).
  it('run_list_indicates_observed_run', async () => {
    const listRuns = vi.fn(() => Promise.resolve(SUMMARIES));
    render(<RunListPanel runClient={{ listRuns }} onReplay={vi.fn()} observedRunId="run_a" />);
    await waitFor(() => screen.getByText('run_a'));
    expect(screen.getByText('run_a').closest('button')?.getAttribute('aria-current')).toBe('true');
    expect(screen.getByText('run_b').closest('button')?.getAttribute('aria-current')).toBeNull();
  });

  // robustness — zero runs → a clear empty state (no crash).
  it('run_list_empty_state', async () => {
    const listRuns = vi.fn(() => Promise.resolve([]));
    render(<RunListPanel runClient={{ listRuns }} onReplay={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/no runs/i)).toBeTruthy());
  });

  // robustness — a failed listRuns → a non-fatal accessible error affordance (never a crash).
  it('run_list_error_state', async () => {
    const listRuns = vi.fn(() => Promise.reject(new Error('network')));
    render(<RunListPanel runClient={{ listRuns }} onReplay={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBeTruthy());
  });

  // adherence (apps/web L§3) + forbidden #6 — var() tokens only (no raw hex/px) + no apps/api import.
  it('test_no_raw_hex_or_px_and_no_apps_api', () => {
    const src = readFileSync(`${RUN_DIR}/RunListPanel.tsx`, 'utf8');
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(src).not.toMatch(/\b\d+px\b/);
    expect(src).not.toMatch(/from\s+['"][^'"]*apps\/api/);
  });
});
