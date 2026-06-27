// @vitest-environment happy-dom
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { validCandidateIdeaCrossDomain } from '@doppl/contracts';
import type { LineageGraphProjection, RunEventEnvelope } from '@doppl/contracts';
import { Dashboard } from '../../../src/routes/Dashboard';
import { createRunStore } from '../../../src/state/runStore';
import type { RunClient } from '../../../src/data/runClient';
import type { EventSourceLike, SseStream, SseStreamOptions } from '../../../src/data/sseStream';
import type { RunMode } from '../../../src/state/reducer';
import { makeEvent } from '../../fixtures/events';

const ROUTES_DIR = resolve(process.cwd(), 'src/routes');

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
    // PD.5b — the shell now mounts OperatorPromptPanel, which fetches the catalog on mount.
    getProblemSets: vi.fn(() => Promise.resolve([])),
    startDemoRun: vi.fn(),
    // PD.12 — the shell mounts FallbackLadderPanel, which fetches the rung descriptors on mount.
    getFallbackLadder: vi.fn(() => Promise.resolve([])),
    // PD.18 — RunConfigPanel fetches the cap maxima on mount; reject → static-fallback (no state update).
    getCapMaxima: vi.fn(() => Promise.reject(new Error('test: no maxima'))),
    // FB.2 — RunConfigPanel fetches the model-override allowlist on mount; empty → no picker rendered.
    getModelRouteOverrides: vi.fn(() => Promise.resolve({})),
  } as unknown as RunClient;
}

const fakeStream: SseStream = { lastEventId: () => null, close: vi.fn() };
const createStream = (): SseStream => fakeStream;
const eventSourceFactory = (): EventSourceLike => ({ addEventListener() {}, close() {} });

function renderDashboard(mode: RunMode = 'live') {
  const runClient = fakeClient();
  const store = createRunStore({ runId: 'run_1', runClient, mode });
  render(
    <Dashboard
      runId="run_1"
      runClient={runClient}
      store={store}
      baseUrl="/api"
      eventSourceFactory={eventSourceFactory}
      createStream={createStream}
    />,
  );
  return { runClient, store };
}

describe('Dashboard — shell + SSE-store wiring', () => {
  // spec(§12/P7.4): the ModeBanner reflects the store's mode (live/replay).
  it('test_mode_banner_reflects_store_mode', () => {
    renderDashboard('replay');
    // ModeBanner's exact uppercase label (PD.6 added a RunHealthPanel "…switching to replay" cue, so a
    // case-insensitive /replay/i now matches both — target the banner's exact "REPLAY" span).
    expect(screen.getByText('REPLAY')).toBeTruthy();
  });

  // spec(§13/rule #4): the redaction trust indicator renders the "redaction active" affordance, no secret.
  it('test_trust_indicator_no_secret', () => {
    renderDashboard('live');
    expect(screen.getByText(/redaction/i)).toBeTruthy();
  });

  // spec(§11): the run-health panel is mounted from getRunHealth.
  it('test_health_mounted', async () => {
    const { runClient } = renderDashboard('live');
    await waitFor(() => expect(runClient.getRunHealth).toHaveBeenCalledWith('run_1'));
    await screen.findByText(/in flight/i);
  });

  // spec(§12): the panel set is mounted; the winner candidate's dataRef resolves within the shell
  // (the inspector/final-idea load the winner via getCandidate).
  it('test_panels_mounted_with_targets', async () => {
    const { runClient } = renderDashboard('live');
    expect(screen.getByLabelText(/run configuration/i)).toBeTruthy(); // run-launcher (P7.5)
    await screen.findByLabelText(/lineage graph/i); // lineage (P7.7)
    // the winner dataRef (cand_1) resolves: inspector + final-idea load it via getCandidate.
    await waitFor(() => expect(runClient.getCandidate).toHaveBeenCalledWith('run_1', 'cand_1'));
  });

  // spec(§11): the shell resyncs the store on mount (store.resync → getEvents).
  it('test_resync_on_mount', async () => {
    const { runClient } = renderDashboard('live');
    await waitFor(() => expect(runClient.getEvents).toHaveBeenCalled());
  });

  // PD.17 (§12/§11) — the run-list browses past runs; clicking one observes it in REPLAY mode. Rendered
  // WITHOUT an injected store so the mode-lift recreates the real store: the observed run switches
  // (getLineage re-fetched for the clicked run) AND the ModeBanner label flips to REPLAY.
  it('run_list_click_observes_run_in_replay_mode', async () => {
    const runClient = fakeClient();
    runClient.listRuns = () =>
      Promise.resolve([{ runId: 'run_2', status: 'completed', sequenceThrough: 5 }]);
    render(
      <Dashboard
        runId="run_1"
        runClient={runClient}
        baseUrl="/api"
        eventSourceFactory={eventSourceFactory}
        createStream={createStream}
      />,
    );
    await waitFor(() => expect(runClient.getLineage).toHaveBeenCalledWith('run_1')); // initial (live)
    fireEvent.click((await screen.findByText('run_2')).closest('button')!);
    await waitFor(() => expect(runClient.getLineage).toHaveBeenCalledWith('run_2')); // observed switch
    expect(screen.getByText('REPLAY')).toBeTruthy(); // the mode-lift → replay label
  });

  // PD.20 — capture the wired SseStreamOptions so the test drives onEvent (SSE delivery) directly.
  function captureStream() {
    let captured: SseStreamOptions | null = null;
    const createStream = (opts: SseStreamOptions): SseStream => {
      captured = opts;
      return { lastEventId: () => null, close: vi.fn() };
    };
    return { createStream, fire: (env: RunEventEnvelope) => captured?.onEvent(env) };
  }

  // PD.20 (§12/§10, DEMO-CRITICAL) — a TERMINAL envelope forces an immediate final re-fetch of BOTH the
  // lineage + health projections (the final graph always renders, bypassing the debounce).
  it('terminal_envelope_forces_final_lineage_refetch', async () => {
    const runClient = fakeClient();
    const cap = captureStream();
    render(
      <Dashboard
        runId="run_1"
        runClient={runClient}
        baseUrl="/api"
        eventSourceFactory={eventSourceFactory}
        createStream={cap.createStream}
        refetchDebounceMs={50}
      />,
    );
    await waitFor(() => expect(runClient.getLineage).toHaveBeenCalledTimes(1)); // mount fetch
    await act(async () => {
      cap.fire(makeEvent(9, 'run.completed'));
      await Promise.resolve();
    });
    await waitFor(() => expect(runClient.getLineage).toHaveBeenCalledTimes(2)); // forced final re-fetch
    expect(runClient.getRunHealth).toHaveBeenCalledTimes(2); // health on the same cadence
  });

  // PD.20 — a burst of non-terminal envelopes coalesces into ONE debounced re-fetch (not one per event).
  it('sse_events_trigger_debounced_lineage_refetch', async () => {
    const runClient = fakeClient();
    const cap = captureStream();
    render(
      <Dashboard
        runId="run_1"
        runClient={runClient}
        baseUrl="/api"
        eventSourceFactory={eventSourceFactory}
        createStream={cap.createStream}
        refetchDebounceMs={20}
      />,
    );
    await waitFor(() => expect(runClient.getLineage).toHaveBeenCalledTimes(1)); // mount fetch
    act(() => {
      cap.fire(makeEvent(1, 'generation.started'));
      cap.fire(makeEvent(2, 'candidate.created', { candidateId: 'c1' }));
      cap.fire(makeEvent(3, 'critic.reviewed', { candidateId: 'c1' }));
    });
    expect(runClient.getLineage).toHaveBeenCalledTimes(1); // debounced — not re-fetched yet
    await waitFor(() => expect(runClient.getLineage).toHaveBeenCalledTimes(2)); // ONE coalesced re-fetch
  });

  // PD.20 — a pending debounced re-fetch is cancelled on unmount (no setState-after-unmount / leak).
  it('refetch_cleanup_on_unmount', async () => {
    const runClient = fakeClient();
    const cap = captureStream();
    const { unmount } = render(
      <Dashboard
        runId="run_1"
        runClient={runClient}
        baseUrl="/api"
        eventSourceFactory={eventSourceFactory}
        createStream={cap.createStream}
        refetchDebounceMs={30}
      />,
    );
    await waitFor(() => expect(runClient.getLineage).toHaveBeenCalledTimes(1)); // mount fetch
    act(() => cap.fire(makeEvent(1, 'generation.started'))); // schedules a debounced re-fetch (30ms)
    unmount(); // cancels the pending debounce
    await new Promise((r) => setTimeout(r, 60)); // past the debounce window
    expect(runClient.getLineage).toHaveBeenCalledTimes(1); // never re-fetched after unmount
  });

  // spec(rule #6): no apps/api import.
  it('test_no_apps_api_import', () => {
    const files = readdirSync(ROUTES_DIR).filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const src = readFileSync(`${ROUTES_DIR}/${f}`, 'utf8');
      expect(src, f).not.toMatch(/from\s+['"][^'"]*apps\/api/);
      expect(src, f).not.toMatch(/@doppl\/api/);
    }
  });

  // spec(_adherence): no raw hex in src/routes.
  it('test_no_raw_hex', () => {
    const files = readdirSync(ROUTES_DIR).filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));
    for (const f of files) {
      const src = readFileSync(`${ROUTES_DIR}/${f}`, 'utf8');
      expect(src, `${f} contains a raw hex color`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    }
  });
});
