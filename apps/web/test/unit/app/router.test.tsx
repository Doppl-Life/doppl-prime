// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { validCandidateIdeaCrossDomain, validRunEventEnvelope } from '@doppl/contracts';
import type { LineageGraphProjection } from '@doppl/contracts';
import { AppRoutes } from '../../../src/app/routes';
import { RunClientProvider } from '../../../src/data/RunClientProvider';
import type { RunClient } from '../../../src/data/runClient';
import type { OuterBloomProjection } from '../../../src/data/outerBloom';

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

class CapturingEventSource {
  static instances: CapturingEventSource[] = [];
  readonly listeners: ((event: { data: string }) => void)[] = [];
  closed = false;

  constructor(readonly url: string) {
    CapturingEventSource.instances.push(this);
  }

  addEventListener(_type: 'message', listener: (event: { data: string }) => void): void {
    this.listeners.push(listener);
  }

  removeEventListener() {}

  close(): void {
    this.closed = true;
  }

  emit(envelope: typeof validRunEventEnvelope): void {
    for (const listener of this.listeners) {
      listener({ data: JSON.stringify(envelope) });
    }
  }
}

const winnerLineage: LineageGraphProjection = {
  runId: 'run_1',
  nodes: [{ id: 'w', type: 'candidate', label: 'Winner', status: 'selected', dataRef: 'cand_1' }],
  edges: [],
  sequenceThrough: 10,
};

const bloomProjection: OuterBloomProjection = {
  islands: [
    {
      runId: 'when-the-crashes-dont-come-575845a4',
      seed: 'Autonomy lowers crash frequency.',
      status: 'imported',
      sequenceThrough: 1,
      nodes: [
        {
          id: 'case',
          runId: 'when-the-crashes-dont-come-575845a4',
          stage: 'case_study',
          label: "When the Crashes Don't Come",
          summary: 'Autonomy lowers crash frequency.',
          status: 'imported',
          parentId: null,
          generationIndex: null,
          score: null,
          novelty: null,
          judgeAcceptance: null,
          sourceId: 'case',
          agenomeId: null,
        },
      ],
      edges: [],
    },
  ],
  totals: { runs: 1, nodes: 1, problemRecoveries: 0, doppls: 0, selected: 0 },
};

const bloomProjectionWithCompletedNode: OuterBloomProjection = {
  islands: [
    {
      runId: 'run_outer_live',
      seed: 'Autonomy lowers crash frequency.',
      status: 'running',
      sequenceThrough: 4,
      nodes: [
        {
          id: 'case-live',
          runId: 'run_outer_live',
          stage: 'case_study',
          label: "When the Crashes Don't Come",
          summary: 'Autonomy lowers crash frequency.',
          status: 'created',
          parentId: null,
          generationIndex: null,
          score: null,
          novelty: null,
          judgeAcceptance: null,
          sourceId: 'case-live',
          agenomeId: null,
        },
        {
          id: 'problem-live',
          runId: 'run_outer_live',
          stage: 'problem_recovery',
          label: 'Live Liability Recovery',
          summary: 'The active run projected a newly completed outer problem recovery.',
          status: 'selected',
          parentId: 'case-live',
          generationIndex: 0,
          score: 0.82,
          novelty: 0.7,
          judgeAcceptance: 0.78,
          sourceId: 'cand-live',
          agenomeId: 'agn-live',
        },
      ],
      edges: [{ id: 'case-live->problem-live', source: 'case-live', target: 'problem-live', type: 'recovered' }],
    },
  ],
  totals: { runs: 1, nodes: 2, problemRecoveries: 1, doppls: 0, selected: 1 },
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
    getOuterBloom: vi.fn(() => Promise.resolve(bloomProjection)),
    getModelRouteOverrides: vi.fn(() => Promise.resolve({})),
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

  // spec(§12): / renders the outer bloom map, not a run observatory. The run-list remains at /runs-home.
  it('test_route_root_shows_bloom', async () => {
    const { client } = renderAt('/');
    expect(await screen.findByRole('heading', { name: /bloom map/i })).toBeTruthy();
    expect((await screen.findAllByText("When the Crashes Don't Come")).length).toBeGreaterThan(0);
    expect(client.getRunHealth).not.toHaveBeenCalled();
  });

  it('test_bloom_grow_tab_starts_run_with_existing_runconfig_contract', async () => {
    const client = fakeClient();
    client.startRun = vi.fn(() => Promise.resolve({ runId: 'run_outer_live' }));
    renderAt('/bloom', client);

    fireEvent.click(await screen.findByRole('button', { name: 'Grow' }));
    expect(await screen.findByLabelText('Grow bloom')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /run bloom/i }));

    await waitFor(() => expect(client.startRun).toHaveBeenCalledTimes(1));
    const [config, options] = vi.mocked(client.startRun).mock.calls[0]!;
    expect(config.seed).toContain("Title: When the Crashes Don't Come");
    expect(config.enabledSubtypes).toEqual(['cross_domain_transfer', 'zeitgeist_synthesis']);
    expect(config.caps).toMatchObject({
      maxPopulation: 8,
      maxGenerations: 4,
      maxSpawnDepth: 3,
      energyBudget: 12000,
      maxToolCalls: 240,
    });
    expect(config.generationOperators).toEqual(['first_principles', 'polymath', 'blindside']);
    expect(options?.idempotencyKey).toMatch(/^outer-bloom-/);
    expect(await screen.findByText(/run_outer_live/i)).toBeTruthy();
  });

  it('test_bloom_grow_tab_disables_run_until_required_seed_info_exists', async () => {
    const client = fakeClient();
    renderAt('/bloom', client);

    fireEvent.click(await screen.findByRole('button', { name: 'Grow' }));
    expect(await screen.findByRole('button', { name: /fill from selected map node/i })).toBeTruthy();
    const runButton = screen.getByRole('button', { name: /run bloom/i }) as HTMLButtonElement;
    expect(runButton.disabled).toBe(false);

    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText(/seed material/i), { target: { value: '' } });
    expect(runButton.disabled).toBe(true);
    expect(screen.getByText(/add a title and seed material to enable run bloom/i)).toBeTruthy();

    fireEvent.click(runButton);
    expect(client.startRun).not.toHaveBeenCalled();
  });

  it('test_bloom_map_refetches_and_follows_new_outer_nodes_from_live_stream', async () => {
    CapturingEventSource.instances = [];
    globalThis.EventSource = CapturingEventSource as unknown as typeof EventSource;
    const client = fakeClient();
    client.startRun = vi.fn(() => Promise.resolve({ runId: 'run_outer_live' }));
    client.getOuterBloom = vi
      .fn()
      .mockResolvedValue(bloomProjectionWithCompletedNode)
      .mockResolvedValueOnce(bloomProjection)
      .mockResolvedValueOnce(bloomProjectionWithCompletedNode);
    renderAt('/bloom', client);

    fireEvent.click(await screen.findByRole('button', { name: 'Grow' }));
    fireEvent.click(await screen.findByRole('button', { name: /run bloom/i }));

    await waitFor(() => expect(CapturingEventSource.instances.length).toBe(1));
    CapturingEventSource.instances[0]!.emit({
      ...validRunEventEnvelope,
      id: 'evt_live_4',
      runId: 'run_outer_live',
      sequence: 4,
      type: 'generation.completed',
      generationId: 'gen-live',
      payload: { generationId: 'gen-live', selected: ['problem-live'] },
    });

    expect((await screen.findAllByText('Live Liability Recovery')).length).toBeGreaterThan(0);
    expect(screen.getByText(/newly completed outer problem recovery/i)).toBeTruthy();
    expect(client.getOuterBloom).toHaveBeenCalledTimes(2);
  });

  it('test_bloom_map_poll_refreshes_projection_while_run_is_streaming', async () => {
    CapturingEventSource.instances = [];
    globalThis.EventSource = CapturingEventSource as unknown as typeof EventSource;
    const client = fakeClient();
    client.startRun = vi.fn(() => Promise.resolve({ runId: 'run_outer_live' }));
    client.getOuterBloom = vi.fn().mockResolvedValue(bloomProjection);
    renderAt('/bloom', client);

    fireEvent.click(await screen.findByRole('button', { name: 'Grow' }));
    fireEvent.click(await screen.findByRole('button', { name: /run bloom/i }));
    await waitFor(() => expect(CapturingEventSource.instances.length).toBe(1));
    expect(client.getOuterBloom).toHaveBeenCalledTimes(2);

    await waitFor(() => expect(client.getOuterBloom).toHaveBeenCalledTimes(3), { timeout: 3400 });
  }, 5000);

  // spec(route-table completeness): an unknown path redirects to the bloom root.
  it('test_unknown_route_redirects_home', async () => {
    renderAt('/totally/unknown/path');
    expect(await screen.findByRole('heading', { name: /bloom map/i })).toBeTruthy();
    expect(screen.getByTestId('loc').textContent).toBe('/');
  });

  // spec(§12 / FV.3): /launch mounts the dedicated S1 Run Launcher (NOT a redirect to /), so the New Run
  // flow reaches the prompt-source + FB-run-controls launcher.
  it('test_launch_route_mounts_s1_launcher', async () => {
    renderAt('/launch');
    expect(await screen.findByRole('heading', { name: /launch a run/i })).toBeTruthy();
    expect(screen.getByLabelText('breakthrough')).toBeTruthy(); // the FB mutagen-operator picker (FV.3)
    expect(screen.getByTestId('loc').textContent).toBe('/launch'); // not redirected
  });

  // spec(§12): the AppShell global chrome (◆ Doppl wordmark + theme toggle) renders on EVERY route.
  it('test_app_shell_chrome_on_every_route', async () => {
    renderAt('/');
    expect(await screen.findByRole('heading', { name: /bloom map/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /doppl/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /theme/i })).toBeTruthy();
    cleanup();
    renderAt('/runs/run_1');
    expect(screen.getByRole('link', { name: /doppl/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /theme/i })).toBeTruthy();
  });

  // spec(§12 / FV.3): starting a run from the S1 launcher (RunConfigPanel onStarted) navigates to
  // /runs/:id. The launcher lives at /launch; the run-list lives at S0 (/), not here.
  it('test_start_run_navigates_to_run_route', async () => {
    const client = fakeClient();
    client.startRun = vi.fn(() => Promise.resolve({ runId: 'run_new' }));
    renderAt('/launch', client);
    fireEvent.change(await screen.findByLabelText(/seed prompt/i), {
      target: { value: 'logistics under uncertainty' },
    });
    fireEvent.click(screen.getByRole('button', { name: /start run/i }));
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/runs/run_new'));
  });

  // spec(§12 / FV.7): /runs/:id/final mounts the dedicated S5FinalIdeaScreen (NOT the FV.1 interim
  // Dashboard) — its distinct "Doppl final idea" landmark proves the repoint; the path is not redirected.
  it('test_final_route_mounts_s5_screen', async () => {
    renderAt('/runs/run_1/final');
    expect(await screen.findByLabelText(/doppl final idea/i)).toBeTruthy(); // S5 landmark (not Dashboard)
    expect(screen.getByTestId('loc').textContent).toBe('/runs/run_1/final'); // not redirected
  });
});
