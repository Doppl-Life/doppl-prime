// @vitest-environment happy-dom
import { beforeAll, afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { RunClient } from '../../../src/data/runClient';
import type { CaseStudyGraph } from '../../../src/data/caseStudy';
import { CaseStudyBloomView } from '../../../src/routes/CaseStudyBloomView';

/**
 * CaseStudyBloomView — the Islands bloom route. Fetches getCaseStudyGraph and renders the bloom. React Flow
 * needs ResizeObserver + matchMedia stubs in happy-dom (mirrors KnowledgeGraph.test.tsx). refreshMs=0 keeps
 * the test timer-free.
 */

beforeAll(() => {
  // minimal ResizeObserver stub for React Flow under happy-dom
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  if (!globalThis.matchMedia) {
    // @ts-expect-error — minimal matchMedia stub
    globalThis.matchMedia = (query: string) => ({
      matches: false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent() {
        return false;
      },
    });
  }
});

afterEach(() => cleanup());

const GRAPH: CaseStudyGraph = {
  caseStudyId: 'cs_er_flow',
  runs: [
    {
      runId: 'run_a',
      status: 'completed',
      problem: 'smooth ER patient flow',
      createdAt: '2026-06-26T10:00:00.000Z',
      doppels: [{ candidateId: 'a1', title: 'Aviation handoff bundle', summary: 's' }],
    },
  ],
};

function fakeClient(graph: CaseStudyGraph): RunClient {
  return { getCaseStudyGraph: vi.fn().mockResolvedValue(graph) } as unknown as RunClient;
}

describe('CaseStudyBloomView', () => {
  it('fetches the case-study graph and renders the bloom summary + heading', async () => {
    render(
      <MemoryRouter>
        <CaseStudyBloomView caseStudyId="cs_er_flow" runClient={fakeClient(GRAPH)} refreshMs={0} />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByTestId('bloom-summary')).toBeTruthy());
    expect(screen.getByTestId('bloom-summary').textContent).toContain('1 run');
    expect(screen.getByTestId('bloom-summary').textContent).toContain('1 doppel');
    expect(screen.getByText(/case study cs_er_flow/)).toBeTruthy();
  });

  it('shows a loading message before the fetch resolves', () => {
    render(
      <MemoryRouter>
        <CaseStudyBloomView caseStudyId="cs_x" runClient={fakeClient(GRAPH)} refreshMs={0} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Loading bloom/)).toBeTruthy();
  });

  it('renders the empty affordance when the case study has no runs', async () => {
    const empty: CaseStudyGraph = { caseStudyId: 'cs_none', runs: [] };
    render(
      <MemoryRouter>
        <CaseStudyBloomView caseStudyId="cs_none" runClient={fakeClient(empty)} refreshMs={0} />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText(/No runs yet for this case study/)).toBeTruthy());
  });
});
