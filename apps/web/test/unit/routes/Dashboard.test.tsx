// @vitest-environment happy-dom
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { validCandidateIdeaCrossDomain } from '@doppl/contracts';
import type { LineageGraphProjection } from '@doppl/contracts';
import { Dashboard } from '../../../src/routes/Dashboard';
import { createRunStore } from '../../../src/state/runStore';
import type { RunClient } from '../../../src/data/runClient';
import type { EventSourceLike, SseStream } from '../../../src/data/sseStream';
import type { RunMode } from '../../../src/state/reducer';

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
    expect(screen.getByText(/replay/i)).toBeTruthy();
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
