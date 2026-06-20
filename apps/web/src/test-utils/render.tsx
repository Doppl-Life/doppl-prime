import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { vi } from "vitest";
import type { RunClient } from "../data/runClient.js";
import { type RunStoreState, initialRunStoreState } from "../state/reducer.js";
import { RunStoreProvider } from "../state/runStore.js";

export function makeStubClient(overrides: Partial<RunClient> = {}): RunClient {
  return {
    listRuns: vi.fn(async () => ({ runs: [] })),
    getRun: vi.fn(async () => null),
    getEvents: vi.fn(async () => ({ runId: "x", events: [], count: 0 })),
    getLineage: vi.fn(async () => ({ runId: "x", sequenceThrough: 0, nodes: [], edges: [] })),
    getReplay: vi.fn(async () => null),
    getCandidate: vi.fn(async () => null),
    getHealth: vi.fn(async () => ({
      runId: "x",
      status: "configured" as const,
      currentGeneration: 0,
      candidatesInFlight: 0,
      lastEventOccurredAt: null,
      capsConsumed: { energy: 0, generations: 0, candidates: 0, toolCalls: 0 },
      lastHeartbeatMs: null,
    })),
    getModelRoutes: vi.fn(async () => ({ routes: [] })),
    startRun: vi.fn(async () => ({ runId: "run-new" })),
    stopRun: vi.fn(async () => null),
    ...overrides,
  };
}

export interface RenderOptions {
  client?: RunClient;
  initialState?: RunStoreState;
}

export function renderWithStore(ui: ReactElement, opts: RenderOptions = {}) {
  const client = opts.client ?? makeStubClient();
  const initialState = opts.initialState ?? initialRunStoreState;
  const utils = render(
    <RunStoreProvider client={client} initialState={initialState} disableLiveStream>
      {ui}
    </RunStoreProvider>,
  );
  return { ...utils, client };
}
