// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { RunsHomeScreen } from '../../../src/routes/RunsHomeScreen';
import { RunClientProvider } from '../../../src/data/RunClientProvider';
import type { RunClient, RunSummary } from '../../../src/data/runClient';

afterEach(() => cleanup());

function fakeClient(over: Partial<RunClient> = {}): RunClient {
  return {
    listRuns: vi.fn(() => Promise.resolve([])),
    ...over,
  } as unknown as RunClient;
}

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname}</div>;
}

function renderScreen(client: RunClient) {
  render(
    <MemoryRouter initialEntries={['/']}>
      <RunClientProvider client={client}>
        <LocationProbe />
        <Routes>
          <Route path="/" element={<RunsHomeScreen />} />
        </Routes>
      </RunClientProvider>
    </MemoryRouter>,
  );
}

const RUNS: RunSummary[] = [
  { runId: 'run_live', status: 'running', sequenceThrough: 5 },
  { runId: 'run_done', status: 'completed', sequenceThrough: 9 },
];

describe('RunsHomeScreen — S0 runs home (FV.2)', () => {
  // spec(§11/§12): listRuns on mount → a card per run (runId + run-domain StatusBadge).
  it('test_loads_and_renders_run_cards', async () => {
    const client = fakeClient({ listRuns: vi.fn(() => Promise.resolve(RUNS)) });
    renderScreen(client);
    expect(client.listRuns).toHaveBeenCalled();
    expect(await screen.findByText('run_live')).toBeTruthy();
    expect(screen.getByText('run_done')).toBeTruthy();
  });

  // spec(DS honesty): no runs → EmptyState + the New Run CTA (never a blank screen).
  it('test_empty_state_with_new_run_cta', async () => {
    renderScreen(fakeClient({ listRuns: vi.fn(() => Promise.resolve([])) }));
    expect(await screen.findByText(/no runs yet/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /new run/i })).toBeTruthy();
  });

  // spec(state machine): a pending listRuns shows LoadingState, then the cards.
  it('test_loading_then_ready', async () => {
    let resolve!: (runs: RunSummary[]) => void;
    const pending = new Promise<RunSummary[]>((r) => {
      resolve = r;
    });
    renderScreen(fakeClient({ listRuns: vi.fn(() => pending) }));
    expect(screen.getByText(/loading/i)).toBeTruthy();
    resolve(RUNS);
    expect(await screen.findByText('run_live')).toBeTruthy();
  });

  // spec(degraded honesty): a rejected listRuns shows ErrorState; retry re-calls listRuns.
  it('test_error_state_retry', async () => {
    const listRuns = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(RUNS);
    renderScreen(fakeClient({ listRuns: listRuns as RunClient['listRuns'] }));
    const retry = await screen.findByRole('button', { name: /retry/i });
    expect(listRuns).toHaveBeenCalledTimes(1);
    fireEvent.click(retry);
    await waitFor(() => expect(listRuns).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('run_live')).toBeTruthy();
  });

  // spec(nav): a running card's "Open live" → /runs/:id.
  it('test_open_live_navigates', async () => {
    renderScreen(
      fakeClient({ listRuns: vi.fn(() => Promise.resolve([RUNS[0]!])) }), // running
    );
    fireEvent.click(await screen.findByRole('button', { name: /open live/i }));
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/runs/run_live'));
  });

  // spec(nav): a completed run's Replay action → /runs/:id/replay. (The final idea is a table COLUMN now,
  // not a separate button — its summary shows inline.)
  it('test_replay_navigates', async () => {
    renderScreen(fakeClient({ listRuns: vi.fn(() => Promise.resolve([RUNS[1]!])) })); // completed
    fireEvent.click(await screen.findByRole('button', { name: /replay/i }));
    await waitFor(() =>
      expect(screen.getByTestId('loc').textContent).toBe('/runs/run_done/replay'),
    );
  });

  // spec(nav): clicking a run's id opens its primary view (completed → replay).
  it('test_clicking_run_id_opens_run', async () => {
    renderScreen(fakeClient({ listRuns: vi.fn(() => Promise.resolve([RUNS[1]!])) })); // completed
    fireEvent.click(await screen.findByRole('button', { name: /open run run_done/i }));
    await waitFor(() =>
      expect(screen.getByTestId('loc').textContent).toBe('/runs/run_done/replay'),
    );
  });

  // spec(status-derived action set): a failed run offers Replay (partial), no Final idea.
  it('test_failed_card_replay_partial', async () => {
    renderScreen(
      fakeClient({
        listRuns: vi.fn(() =>
          Promise.resolve([{ runId: 'run_x', status: 'failed', sequenceThrough: 3 }]),
        ),
      }),
    );
    fireEvent.click(await screen.findByRole('button', { name: /replay/i }));
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/runs/run_x/replay'));
  });

  // spec(start-a-run entry): the New Run CTA → /launch.
  it('test_new_run_cta_navigates_to_launch', async () => {
    renderScreen(fakeClient({ listRuns: vi.fn(() => Promise.resolve([])) }));
    fireEvent.click(await screen.findByRole('button', { name: /new run/i }));
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/launch'));
  });

  // spec(outer-view entry): the Agarden CTA → /agarden.
  it('test_agarden_cta_navigates_to_outer_view', async () => {
    renderScreen(fakeClient({ listRuns: vi.fn(() => Promise.resolve([])) }));
    fireEvent.click(await screen.findByRole('button', { name: /agarden/i }));
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/agarden'));
  });
});
