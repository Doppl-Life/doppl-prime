// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { validCandidateIdeaCrossDomain, validFitnessScore } from '@doppl/contracts';
import type { LineageGraphProjection, RunEventEnvelope } from '@doppl/contracts';
import { S5FinalIdeaScreen } from '../../../src/routes/S5FinalIdeaScreen';
import { createRunStore } from '../../../src/state/runStore';
import type { RunClient } from '../../../src/data/runClient';
import type { EventSourceLike, SseStream } from '../../../src/data/sseStream';
import type { RunMode } from '../../../src/state/reducer';
import { makeEvent } from '../../fixtures/events';

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
  nodes: [
    { id: 'a0', type: 'agenome', label: 'Agenome 0', status: 'active', dataRef: 'agn_0' },
    { id: 'w', type: 'candidate', label: 'Winner', status: 'selected', dataRef: 'cand_1' },
  ],
  edges: [],
  sequenceThrough: 10,
};
const winnerlessLineage: LineageGraphProjection = {
  runId: 'run_1',
  nodes: [{ id: 'a0', type: 'agenome', label: 'Agenome 0', status: 'active', dataRef: 'agn_0' }],
  edges: [],
  sequenceThrough: 10,
};

function fitnessEvent(sequence: number, generationId: string, total: number): RunEventEnvelope {
  return makeEvent(sequence, 'fitness.scored', {
    runId: 'run_1',
    generationId,
    candidateId: `cand_${sequence}`,
    payload: { ...validFitnessScore, candidateId: `cand_${sequence}`, total },
  });
}

function fakeClient(opts?: {
  lineage?: LineageGraphProjection;
  events?: RunEventEnvelope[];
}): RunClient {
  return {
    listRuns: vi.fn(() => Promise.resolve([])),
    getRun: vi.fn(),
    getEvents: vi.fn(() => Promise.resolve(opts?.events ?? [])),
    getLineage: vi.fn(() => Promise.resolve(opts?.lineage ?? winnerLineage)),
    getReplay: vi.fn(() => Promise.resolve(opts?.events ?? [])),
    getCandidate: vi.fn(() => Promise.resolve(validCandidateIdeaCrossDomain)),
    listModelRoutes: vi.fn(() => Promise.resolve([])),
    startRun: vi.fn(),
    stopRun: vi.fn(),
    getRunHealth: vi.fn(() =>
      Promise.resolve({
        runId: 'run_1',
        currentGeneration: 2,
        candidatesInFlight: 0,
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

function renderS5(mode: RunMode, client: RunClient, onSelectLineageNode?: (ref: string) => void) {
  const store = createRunStore({ runId: 'run_1', runClient: client, mode });
  render(
    <MemoryRouter>
      <S5FinalIdeaScreen
        runId="run_1"
        mode={mode}
        runClient={client}
        store={store}
        baseUrl="/api"
        eventSourceFactory={eventSourceFactory}
        createStream={createStream}
        refetchDebounceMs={20}
        {...(onSelectLineageNode ? { onSelectLineageNode } : {})}
      />
    </MemoryRouter>,
  );
  return { client, store };
}

describe('S5FinalIdeaScreen — the dedicated S5 payoff screen (FV.7)', () => {
  // spec(§12): S5 composes FinalIdeaPanel fed by the hook's lineage + events, threading mode + runClient
  // → the winner card (getCandidate) + the mode-derived transfer rung render.
  it('test_s5_composes_final_idea_panel', async () => {
    const client = fakeClient({ lineage: winnerLineage });
    renderS5('live', client);
    expect(await screen.findByLabelText(/final surviving idea/i)).toBeTruthy(); // winner card section
    expect(screen.getByText(/live allowlisted/i)).toBeTruthy(); // mode-derived transfer rung (live)
    expect(client.getCandidate).toHaveBeenCalledWith('run_1', 'cand_1'); // fed the winner dataRef
  });

  // spec(REQ-E-001): the generational-climb chart is composed, fed by fold.events (gen-0 → winner Δ).
  it('test_s5_renders_generational_climb', async () => {
    const client = fakeClient({
      lineage: winnerLineage,
      events: [fitnessEvent(1, 'gen_0', 0.4), fitnessEvent(2, 'gen_1', 0.8)],
    });
    renderS5('live', client);
    // exact label = the POPULATED section (the empty-state label is "… — no data yet")
    expect(await screen.findByLabelText('Generation comparison')).toBeTruthy();
  });

  // spec(rule #6 honesty): a terminal run with no 'selected' winner → the graceful terminal state via
  // FinalIdeaPanel (S5 threads obs.runStatus); never a fabricated idea.
  it('test_s5_terminal_zero_survivors_passthrough', async () => {
    const client = fakeClient({
      lineage: winnerlessLineage,
      events: [makeEvent(9, 'run.completed', { runId: 'run_1' })],
    });
    renderS5('live', client);
    expect(await screen.findByText(/no surviving idea — run completed/i)).toBeTruthy();
  });

  // spec(rule #9 read-only + rule #7 replay parity): S5 issues no command/POST; a replay render produces
  // the winner + the replay-backed rung from the same pure selectors (no provider call).
  it('test_s5_read_only_and_replay_parity', async () => {
    const client = fakeClient({ lineage: winnerLineage });
    renderS5('replay', client);
    expect(await screen.findByLabelText(/final surviving idea/i)).toBeTruthy(); // winner in replay too
    expect(screen.getByText(/replay-backed/i)).toBeTruthy(); // replay-derived transfer rung
    expect(client.startRun).not.toHaveBeenCalled();
    expect(client.stopRun).not.toHaveBeenCalled();
    expect(client.startDemoRun).not.toHaveBeenCalled();
  });

  // spec(rule #6 emit-only): S5 surfaces the kernel-marked 'selected' node (selectWinner) — the winner's
  // lineage dataRef renders; the screen re-ranks nothing.
  it('test_s5_winner_from_selected_node', async () => {
    const client = fakeClient({ lineage: winnerLineage });
    renderS5('live', client);
    await screen.findByLabelText(/final surviving idea/i);
    expect(screen.getByText('cand_1')).toBeTruthy(); // the winner node dataRef (lineage proof button)
  });
});
