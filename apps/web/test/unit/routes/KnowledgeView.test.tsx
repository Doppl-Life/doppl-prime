// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { RunClient } from '../../../src/data/runClient';
import type { KnowledgeGraph } from '../../../src/data/knowledge';
import { KnowledgeView } from '../../../src/routes/KnowledgeView';

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  if (!globalThis.matchMedia) {
    globalThis.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
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

const graph: KnowledgeGraph = {
  runId: 'run_1',
  sequenceThrough: 5,
  state: {
    notes: {
      'research-note:run_1:3': {
        id: 'research-note:run_1:3',
        runId: 'run_1',
        generationId: 'run_1-gen0',
        agenomeId: 'agn_0',
        toolName: 'web_search',
        query: 'q',
        snippet: 's',
        sourceUrls: [],
        sequence: 3,
        eventId: 'evt-3',
      },
    },
    edges: {},
  },
};

function fakeClient(getKnowledge: () => Promise<KnowledgeGraph>): RunClient {
  return { getKnowledge } as unknown as RunClient;
}

describe('KnowledgeView — fetch + render the knowledge graph', () => {
  it('fetches getKnowledge and renders the graph summary', async () => {
    const client = fakeClient(() => Promise.resolve(graph));
    render(
      <MemoryRouter>
        <KnowledgeView runId="run_1" runClient={client} refreshMs={0} />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByTestId('knowledge-summary').textContent).toMatch(/1 research notes/),
    );
    // the back-to-organism link is present
    expect(screen.getByText(/organism view/i)).toBeTruthy();
  });

  it('shows an error message when the fetch fails', async () => {
    const client = fakeClient(() => Promise.reject(new Error('boom')));
    render(
      <MemoryRouter>
        <KnowledgeView
          runId="run_1"
          runClient={client}
          refreshMs={0}
          staticKnowledgeLoader={() => Promise.resolve(null)}
        />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/boom/));
  });

  it('uses static repo-derived knowledge when the API is unavailable', async () => {
    const client = fakeClient(() => Promise.reject(new Error('api unavailable')));
    render(
      <MemoryRouter>
        <KnowledgeView
          runId="run_1"
          runClient={client}
          refreshMs={0}
          staticKnowledgeLoader={() => Promise.resolve(graph)}
        />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByTestId('knowledge-summary').textContent).toMatch(/1 research notes/),
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
