// @vitest-environment happy-dom
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { validCandidateIdeaCrossDomain } from '@doppl/contracts';
import type { LineageGraphProjection, RunEventEnvelope } from '@doppl/contracts';
import { MemoryRouter } from 'react-router-dom';
import { S2OrganismView } from '../../../src/routes/S2OrganismView';
import { createRunStore } from '../../../src/state/runStore';
import type { RunClient } from '../../../src/data/runClient';
import type { EventSourceLike, SseStream, SseStreamOptions } from '../../../src/data/sseStream';
import type { RunMode } from '../../../src/state/reducer';
import { makeEvent } from '../../fixtures/events';

const ROUTES_DIR = resolve(process.cwd(), 'src/routes');
const RUN_COMP_DIR = resolve(process.cwd(), 'src/components/run');

beforeAll(() => {
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

const lineage: LineageGraphProjection = {
  runId: 'run_1',
  nodes: [
    { id: 'a0', type: 'agenome', label: 'Agenome 0', status: 'active', dataRef: 'agn_0' },
    { id: 'w', type: 'candidate', label: 'Winner', status: 'selected', dataRef: 'cand_1' },
  ],
  edges: [],
  sequenceThrough: 10,
};

function fakeClient(): RunClient {
  return {
    listRuns: vi.fn(() => Promise.resolve([])),
    getRun: vi.fn(),
    getEvents: vi.fn(() => Promise.resolve([])),
    getLineage: vi.fn(() => Promise.resolve(lineage)),
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
    startDemoRun: vi.fn(),
    getFallbackLadder: vi.fn(() => Promise.resolve([])),
    getCapMaxima: vi.fn(() => Promise.reject(new Error('test: no maxima'))),
  } as unknown as RunClient;
}

const fakeStream: SseStream = { lastEventId: () => null, close: vi.fn() };
const createStream = (): SseStream => fakeStream;
const eventSourceFactory = (): EventSourceLike => ({ addEventListener() {}, close() {} });

function renderView(mode: RunMode = 'live', client: RunClient = fakeClient()) {
  const store = createRunStore({ runId: 'run_1', runClient: client, mode });
  render(
    <MemoryRouter>
      <S2OrganismView
        runId="run_1"
        mode={mode}
        runClient={client}
        store={store}
        baseUrl="/api"
        eventSourceFactory={eventSourceFactory}
        createStream={createStream}
      />
    </MemoryRouter>,
  );
  return { client, store };
}

// Capture the wired SseStreamOptions so a test can drive onEvent (SSE delivery) directly.
function captureStream() {
  let captured: SseStreamOptions | null = null;
  const close = vi.fn();
  const make = (opts: SseStreamOptions): SseStream => {
    captured = opts;
    return { lastEventId: () => null, close };
  };
  return { make, close, fire: (env: RunEventEnvelope) => captured?.onEvent(env) };
}

describe('S2OrganismView — the 3-pane organism shell (FV.4)', () => {
  // spec(§12): the shell renders a LEFT rail, a CENTER (LineageGraph), and a RIGHT drawer region.
  it('test_three_pane_layout_renders', async () => {
    renderView('live');
    expect(screen.getByLabelText(/organism left rail/i)).toBeTruthy(); // LEFT
    await screen.findByLabelText(/lineage graph/i); // CENTER (reused LineageGraph)
    expect(screen.getByLabelText(/inspector/i)).toBeTruthy(); // RIGHT drawer region
  });

  // spec(§12 PD.20): an SSE envelope → the debounced lineage re-fetch; a terminal event forces an
  // immediate final re-fetch (the "watch it evolve" behavior, re-homed intact).
  it('test_lineage_grows_live_on_sse', async () => {
    const client = fakeClient();
    const cap = captureStream();
    const store = createRunStore({ runId: 'run_1', runClient: client, mode: 'live' });
    render(
      <MemoryRouter>
        <S2OrganismView
          runId="run_1"
          mode="live"
          runClient={client}
          store={store}
          baseUrl="/api"
          eventSourceFactory={eventSourceFactory}
          createStream={cap.make}
          refetchDebounceMs={20}
        />
      </MemoryRouter>,
    );
    await waitFor(() => expect(client.getLineage).toHaveBeenCalledTimes(1)); // mount fetch
    act(() => {
      cap.fire(makeEvent(1, 'generation.started'));
      cap.fire(makeEvent(2, 'candidate.created', { candidateId: 'c1' }));
    });
    expect(client.getLineage).toHaveBeenCalledTimes(1); // debounced — not yet
    await waitFor(() => expect(client.getLineage).toHaveBeenCalledTimes(2)); // ONE coalesced re-fetch
    await act(async () => {
      cap.fire(makeEvent(9, 'run.completed')); // terminal → forced immediate re-fetch
      await Promise.resolve();
    });
    await waitFor(() => expect(client.getLineage).toHaveBeenCalledTimes(3));
  });

  // spec(§12): the StopControl is mounted in the LEFT rail.
  it('test_stop_control_in_left_rail', async () => {
    renderView('live');
    const rail = screen.getByLabelText(/organism left rail/i);
    expect(rail.querySelector('button')).toBeTruthy(); // the StopControl's stop button
  });

  // spec(§12): the agent roster (from the fetched lineage's agenome nodes) renders in the LEFT rail.
  it('test_agent_roster_in_left_rail', async () => {
    renderView('live');
    expect(await screen.findByText('agn_0')).toBeTruthy(); // the agenome roster row
  });

  // spec(§12): the inspector drawer renders its empty placeholder by default (no node selected; FV.5
  // wires node-click → content).
  it('test_inspector_drawer_empty_default', async () => {
    renderView('live');
    // match the drawer's unique placeholder phrase — `/select a node/i` alone also matches React
    // Flow's built-in a11y live-region text ("Press enter or space to select a node…").
    expect(screen.getByText(/inspect its details/i)).toBeTruthy();
  });

  // spec(§10/§12, rule #7): /runs/:id/replay renders the observatory in REPLAY mode (banner) —
  // reconstructed from persisted events; no provider write path.
  it('test_replay_mode_reconstructs_no_live', async () => {
    renderView('replay');
    expect(screen.getByText('REPLAY')).toBeTruthy();
  });

  // spec(no regression): the re-homed wiring closes the SSE stream on unmount (no leak), mirroring
  // Dashboard.test's cleanup contract.
  it('test_live_wiring_rehomed_intact', async () => {
    const client = fakeClient();
    const cap = captureStream();
    const store = createRunStore({ runId: 'run_1', runClient: client, mode: 'live' });
    const { unmount } = render(
      <MemoryRouter>
        <S2OrganismView
          runId="run_1"
          mode="live"
          runClient={client}
          store={store}
          baseUrl="/api"
          eventSourceFactory={eventSourceFactory}
          createStream={cap.make}
          refetchDebounceMs={20}
        />
      </MemoryRouter>,
    );
    await waitFor(() => expect(client.getEvents).toHaveBeenCalled()); // resync/seed on mount
    unmount();
    expect(cap.close).toHaveBeenCalled(); // stream closed on unmount
  });

  // spec(FV.6 §11/§12, Step-7.5 wiring + rule #7): the 3 live-telemetry DS panels (ActivityTicker,
  // HealthIndicator, RunEnergyGauge) mount fed by the hook, with `mode` threaded — live shows the
  // ticker "live" affordance; a replay render shows "replaying" (same pure selectors, no live calls).
  it('test_s2_mounts_telemetry_live_and_replay', async () => {
    renderView('live');
    expect(await screen.findByText('Activity')).toBeTruthy(); // ActivityTicker title
    expect(screen.getByText('live')).toBeTruthy(); // ticker live affordance (banner is "● LIVE")
    expect(screen.getAllByText(/in-flight/i).length).toBeGreaterThan(0); // HealthIndicator phrase
    expect(screen.getByText('doppl_energy')).toBeTruthy(); // RunEnergyGauge unit label

    cleanup();
    renderView('replay');
    expect(await screen.findByText('replaying')).toBeTruthy(); // ticker replay affordance
  });

  // ── FV.8 replay scrubber ──────────────────────────────────────────────────────────────────────
  const replayEvents: RunEventEnvelope[] = [
    makeEvent(1, 'run.started'),
    makeEvent(2, 'generation.started'),
    makeEvent(3, 'candidate.created', { candidateId: 'c1' }),
    makeEvent(4, 'agenome.spawned', { agenomeId: 'a1' }),
    makeEvent(5, 'run.completed'),
  ];
  function clientWithEvents(evs: RunEventEnvelope[]): RunClient {
    const c = fakeClient();
    c.getEvents = vi.fn(() => Promise.resolve(evs)) as RunClient['getEvents'];
    return c;
  }

  // spec(FV.8 replay-only): mode='replay' mounts the ReplayScrubber; mode='live' does NOT (the live
  // path is streaming, unchanged).
  it('test_scrubber_only_in_replay_mode', async () => {
    renderView('replay');
    expect(await screen.findByLabelText(/replay step/i)).toBeTruthy(); // scrubber present in replay
    cleanup();
    renderView('live');
    expect(screen.queryByLabelText(/replay step/i)).toBeNull(); // absent in live
  });

  // spec(§12 step-through, rule #7): scrubbing to N<M re-folds events[0..N] client-side so the fold-
  // derived ActivityTicker rewinds (the later event's row disappears).
  it('test_scrub_rewinds_fold_derived_panels', async () => {
    const client = clientWithEvents(replayEvents);
    renderView('replay', client);
    await screen.findByText('#5'); // full run: the ticker shows the last event row
    fireEvent.change(screen.getByLabelText(/replay step/i), { target: { value: '2' } });
    expect(screen.queryByText('#5')).toBeNull(); // rewound past it
    expect(screen.getByText('#2')).toBeTruthy(); // the step-2 prefix still shows #2
  });

  // spec(default-position): entering replay positions the scrubber at the END (full run shown first).
  it('test_scrubber_defaults_to_full_run', async () => {
    const client = clientWithEvents(replayEvents);
    renderView('replay', client);
    await screen.findByText('#5');
    expect(screen.getByText(/step 5 of 5/i)).toBeTruthy(); // default = max index (5 of 5)
  });

  // spec(rule #7 / #9): scrubbing re-derives the fold CLIENT-SIDE — NO getEvents refetch, no command.
  it('test_scrub_no_refetch_no_provider', async () => {
    const client = clientWithEvents(replayEvents);
    renderView('replay', client);
    await screen.findByText('#5');
    const getEvents = client.getEvents as ReturnType<typeof vi.fn>;
    const before = getEvents.mock.calls.length;
    fireEvent.change(screen.getByLabelText(/replay step/i), { target: { value: '2' } });
    expect(getEvents.mock.calls.length).toBe(before); // no refetch on scrub
    expect(client.startRun).not.toHaveBeenCalled();
    expect(client.stopRun).not.toHaveBeenCalled();
  });

  // spec(_adherence, DS rule 3/5): the new shell/roster/drawer/hook files use var(--token) only — no
  // raw hex, no raw px strings (bare numeric geometry EXEMPT per the lineage adherence precedent).
  it('test_no_raw_hex_or_px_in_shell', () => {
    const files = [
      `${ROUTES_DIR}/S2OrganismView.tsx`,
      `${ROUTES_DIR}/useRunObservatory.ts`,
      ...readdirSync(RUN_COMP_DIR)
        .filter((f) => f === 'AgentRoster.tsx' || f === 'InspectorDrawer.tsx')
        .map((f) => `${RUN_COMP_DIR}/${f}`),
    ];
    for (const path of files) {
      const src = readFileSync(path, 'utf8');
      expect(src, `${path} contains a raw hex color`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(src, `${path} contains a raw px string`).not.toMatch(/\b\d+px\b/);
    }
  });
});
