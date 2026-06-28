// @vitest-environment happy-dom
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RunSummary } from '../../../../src/data/runClient';
import { RunsTable } from '../../../../src/components/run/RunsTable';

const RUN_DIR = resolve(process.cwd(), 'src/components/run');

afterEach(() => cleanup());

const run = (over: Partial<RunSummary>): RunSummary => ({
  runId: 'aaaaaaaa-1111-2222-3333-444444444444',
  status: 'completed',
  sequenceThrough: 100,
  createdAt: '2026-06-26T10:00:00.000Z',
  problem: 'Smooth ER patient flow',
  finalIdeaTitle: 'Yield-managed triage',
  finalIdeaSummary: 'Apply airline yield management to ER capacity.',
  generations: 5,
  candidates: 12,
  reproductions: 8,
  culls: 4,
  mutations: 3,
  ...over,
});

describe('RunsTable', () => {
  it('renders a row per run with problem, final idea, counts, and a date-order index', () => {
    const runs = [
      run({ runId: 'aaa-newest' }),
      run({ runId: 'bbb-older', finalIdeaTitle: 'Other idea' }),
    ];
    render(<RunsTable runs={runs} onOpen={vi.fn()} onReplay={vi.fn()} onOpenLive={vi.fn()} />);
    expect(screen.getAllByText('Smooth ER patient flow').length).toBe(2);
    expect(screen.getByText('Yield-managed triage')).toBeTruthy();
    expect(screen.getByText('Other idea')).toBeTruthy();
    // date-order index (1 = first/newest row, the backend already sorts desc)
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    // activity counts (compound, unique cell text)
    expect(screen.getByTestId('run-gens-aaa-newest').textContent).toBe('5');
    expect(screen.getByTestId('run-cands-aaa-newest').textContent).toBe('12');
    expect(screen.getByTestId('run-activity-aaa-newest').textContent).toContain('8');
  });

  it('fires onReplay for a terminal run via the Replay button', () => {
    const onReplay = vi.fn();
    render(
      <RunsTable
        runs={[run({ runId: 'r1', status: 'completed' })]}
        onOpen={vi.fn()}
        onReplay={onReplay}
        onOpenLive={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /replay/i }));
    expect(onReplay).toHaveBeenCalledWith('r1');
  });

  it('shows Open live (not Replay) for a running run', () => {
    const onOpenLive = vi.fn();
    render(
      <RunsTable
        runs={[run({ runId: 'r2', status: 'running' })]}
        onOpen={vi.fn()}
        onReplay={vi.fn()}
        onOpenLive={onOpenLive}
      />,
    );
    expect(screen.queryByRole('button', { name: /replay/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /open live/i }));
    expect(onOpenLive).toHaveBeenCalledWith('r2');
  });

  it('renders a status badge (label, not color alone) and a clear failure note for missing metadata', () => {
    render(
      <RunsTable
        runs={[run({ status: 'failed', problem: null, finalIdeaTitle: null, createdAt: null })]}
        onOpen={vi.fn()}
        onReplay={vi.fn()}
        onOpenLive={vi.fn()}
      />,
    );
    expect(screen.getAllByText(/failed/i).length).toBeGreaterThanOrEqual(1); // StatusBadge label (rule #4)
    // A failed run with no winner reads "Failed before generating" rather than a bare em-dash.
    expect(screen.getByText('Failed before generating')).toBeTruthy();
    // The remaining missing metadata (time + problem) still renders as em-dashes.
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });

  it('opens a run when its id is clicked', () => {
    const onOpen = vi.fn();
    render(
      <RunsTable
        runs={[run({ runId: 'r3', status: 'completed' })]}
        onOpen={onOpen}
        onReplay={vi.fn()}
        onOpenLive={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /open run r3/i }));
    expect(onOpen).toHaveBeenCalledWith('r3', 'completed');
  });

  it('fires onSort when a sortable column header is clicked', () => {
    const onSort = vi.fn();
    render(
      <RunsTable
        runs={[run({ runId: 'r1' })]}
        onOpen={vi.fn()}
        onReplay={vi.fn()}
        onOpenLive={vi.fn()}
        onSort={onSort}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /sort by progress/i }));
    expect(onSort).toHaveBeenCalledWith('cands');
  });

  it('omits the day-group header when rendered flat (grouped=false)', () => {
    render(
      <RunsTable
        runs={[run({ runId: 'r1', createdAt: '2026-06-26T10:00:00.000Z' })]}
        onOpen={vi.fn()}
        onReplay={vi.fn()}
        onOpenLive={vi.fn()}
        grouped={false}
      />,
    );
    // The row is still there…
    expect(screen.getByRole('button', { name: /open run r1/i })).toBeTruthy();
    // …but no Today/Yesterday/date bucket header is rendered.
    expect(screen.queryByText(/today|yesterday/i)).toBeNull();
  });

  it('expands an inline peek with the run detail when the chevron is toggled', () => {
    render(
      <RunsTable
        runs={[run({ runId: 'r1', reproductions: 7 })]}
        onOpen={vi.fn()}
        onReplay={vi.fn()}
        onOpenLive={vi.fn()}
      />,
    );
    expect(screen.queryByText('repro')).toBeNull(); // collapsed: no peek
    fireEvent.click(screen.getByRole('button', { name: /expand detail for run r1/i }));
    expect(screen.getByText('repro')).toBeTruthy(); // peek activity breakdown is shown
    fireEvent.click(screen.getByRole('button', { name: /collapse detail for run r1/i }));
    expect(screen.queryByText('repro')).toBeNull(); // toggled closed again
  });

  it('styling uses var() tokens — no raw hex / no raw px', () => {
    const files = readdirSync(RUN_DIR).filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'));
    for (const f of files) {
      const src = readFileSync(`${RUN_DIR}/${f}`, 'utf8');
      expect(src, `${f} raw hex`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(src, `${f} raw px`).not.toMatch(/\b\d+px\b/);
    }
  });
});
