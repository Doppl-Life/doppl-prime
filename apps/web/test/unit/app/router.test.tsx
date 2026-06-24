// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { validCandidateIdeaCrossDomain } from '@doppl/contracts';
import type { LineageGraphProjection } from '@doppl/contracts';
import { AppRoutes } from '../../../src/app/routes';
import { RunClientProvider } from '../../../src/data/RunClientProvider';
import type { RunClient } from '../../../src/data/runClient';

// React Flow (the lineage panel mounted on run routes) measures via ResizeObserver + matchMedia, and
// the Dashboard wires the real SSE stream (new EventSource) — happy-dom has none of these. Stub them
// (mirror the Dashboard.test stubs); the route wrappers use the real createSseStream (no injection),
// so EventSource must exist as it does in a browser. These tests assert routing/nav, not SSE delivery.
beforeAll(() => {
  globalThis.EventSource = class {
    addEventListener() {}
    removeEventListener() {}
    close() {}
  } as unknown as typeof EventSource;
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  if (!globalThis.matchMedia) {
    globalThis.matchMedia = ((q: string) => ({
      matches: false,
      media: q,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent() {
        return false;
      },
    })) as unknown as typeof matchMedia;
  }
});
afterEach(() => cleanup());

const winnerLineage: LineageGraphProjection = {
  runId: 'run_1',
  nodes: [{ id: 'w', type: 'candidate', label: 'Winner', status: 'selected', dataRef: 'cand_1' }],
  edges: [],
  sequenceThrough: 10,
};

function fakeClient(): RunClient {
  return {
    listRuns: vi.fn(() => Promise.resolve([])),
    getRun: vi.fn(),
    getEvents: vi.fn(() => Promise.resolve([])),
    getLineage: vi.fn(() => Promise.resolve(winnerLineage)),
    getReplay: vi.fn(() => Promise.resolve([])),
    getCandidate: vi.fn(() => Promise.resolve(validCandidateIdeaCrossDomain)),
    listModelRoutes: vi.fn(() => Promise.resolve([])),
    startRun: vi.fn(),
    stopRun: vi.fn(),
    getRunHealth: vi.fn(() =>
      Promise.resolve({
        runId: 'run_1',
        currentGeneration: 2,
        candidatesInFlight: 1,
        lastEventAt: '2026-06-20T12:00:00.000Z',
        capsConsumed: { maxGenerations: 2 },
      }),
    ),
    getProblemSets: vi.fn(() => Promise.resolve([])),
    startDemoRun: vi.fn(() => Promise.resolve({ runId: 'run_demo' })),
    getFallbackLadder: vi.fn(() => Promise.resolve([])),
    getCapMaxima: vi.fn(() => Promise.reject(new Error('test: no maxima'))),
  } as unknown as RunClient;
}

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname}</div>;
}

function renderAt(path: string, client: RunClient = fakeClient()) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <RunClientProvider client={client}>
        <LocationProbe />
        <AppRoutes />
      </RunClientProvider>
    </MemoryRouter>,
  );
  return { client };
}

describe('app router — route table + nav wiring (FV.1)', () => {
  // spec(§12): /runs/:id mounts the observatory for that run (runId from useParams, live mode →
  // the run-route effect fetches health for run_1).
  it('test_route_runs_id_mounts_observatory', async () => {
    const { client } = renderAt('/runs/run_1');
    await waitFor(() => expect(client.getRunHealth).toHaveBeenCalledWith('run_1'));
  });

  // spec(§12): /runs/:id/replay renders the observatory in REPLAY mode (the ModeBanner shows replay).
  it('test_route_replay_sets_replay_mode', async () => {
    renderAt('/runs/run_1/replay');
    expect(await screen.findByText('REPLAY')).toBeTruthy();
  });

  // spec(§12): / renders the S0 RunsHomeScreen (FV.2 — empty state here, listRuns→[]), NOT a run
  // observatory (no run-health fetch). The launcher moved to /launch.
  it('test_route_root_shows_home', async () => {
    const { client } = renderAt('/');
    // the S0 RunsHomeScreen-specific New Run CTA (the old Dashboard launcher had none) — distinguishes
    // S0 from the FV.1 interim Dashboard mount.
    expect(await screen.findByRole('button', { name: /new run/i })).toBeTruthy();
    expect(client.getRunHealth).not.toHaveBeenCalled(); // home is not an observatory
  });

  // spec(route-table completeness): an unknown path redirects to the S0 home.
  it('test_unknown_route_redirects_home', async () => {
    renderAt('/totally/unknown/path');
    expect(await screen.findByRole('button', { name: /new run/i })).toBeTruthy(); // → S0 home
    expect(screen.getByTestId('loc').textContent).toBe('/');
  });

  // spec(§12 / FV.2 demo-continuity): /launch interim-mounts the existing Dashboard launcher (NOT a
  // redirect to /), so the New Run flow reaches a working start-a-run view until FV.3 builds S1.
  it('test_launch_route_mounts_interim_launcher', async () => {
    renderAt('/launch');
    expect(await screen.findByText(/Start a demo run/i)).toBeTruthy();
    expect(screen.getByTestId('loc').textContent).toBe('/launch'); // not redirected
  });

  // spec(§12): the AppShell global chrome (◆ Doppl wordmark + theme toggle) renders on EVERY route.
  it('test_app_shell_chrome_on_every_route', async () => {
    renderAt('/');
    expect(screen.getByRole('link', { name: /doppl/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /theme/i })).toBeTruthy();
    cleanup();
    renderAt('/runs/run_1');
    expect(screen.getByRole('link', { name: /doppl/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /theme/i })).toBeTruthy();
  });

  // spec(§12): starting a run (the /launch launcher onStarted) navigates to /runs/:id — no internal
  // state switch (FV.2: the launcher now lives at /launch, not /).
  it('test_start_run_navigates_to_run_route', async () => {
    const client = fakeClient();
    client.startDemoRun = vi.fn(() => Promise.resolve({ runId: 'run_new' }));
    renderAt('/launch', client);
    fireEvent.click(await screen.findByLabelText(/freeform prompt/i));
    fireEvent.change(screen.getByLabelText(/problem prompt/i), {
      target: { value: 'logistics under uncertainty' },
    });
    fireEvent.click(screen.getByRole('button', { name: /start demo run/i }));
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/runs/run_new'));
  });

  // spec(§12): clicking a run in the /launch Dashboard run-list navigates to its replay route
  // (FV.2: the RunListPanel stays reachable via the /launch interim mount).
  it('test_run_list_click_navigates_to_replay', async () => {
    const client = fakeClient();
    client.listRuns = vi.fn(() =>
      Promise.resolve([{ runId: 'run_2', status: 'completed', sequenceThrough: 5 }]),
    ) as RunClient['listRuns'];
    renderAt('/launch', client);
    fireEvent.click((await screen.findByText('run_2')).closest('button')!);
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/runs/run_2/replay'));
  });

  // spec(§12 / AC3): /runs/:id/final RESOLVES to the interim Dashboard view (which renders
  // FinalIdeaPanel on terminal) — NOT a redirect to home; the dedicated S5 lands in FV.7. Pinning
  // this stops the route silently falling through to the unknown→/ redirect.
  it('test_route_final_resolves', async () => {
    const { client } = renderAt('/runs/run_1/final');
    await waitFor(() => expect(client.getRunHealth).toHaveBeenCalledWith('run_1'));
    expect(screen.getByTestId('loc').textContent).toBe('/runs/run_1/final'); // not redirected
  });
});
