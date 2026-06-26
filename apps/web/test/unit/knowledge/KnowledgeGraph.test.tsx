// @vitest-environment happy-dom
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { KnowledgeGraph as KnowledgeGraphData } from '../../../src/data/knowledge';
import { KnowledgeGraph } from '../../../src/knowledge/KnowledgeGraph';
import { ResearchNoteCard } from '../../../src/knowledge/nodeTypes';

const KNOWLEDGE_DIR = resolve(process.cwd(), 'src/knowledge');

// React Flow measures via ResizeObserver + matchMedia — happy-dom has neither, so stub them (pixels are
// the Playwright smoke's job, not here).
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

function graphWith(
  notes: KnowledgeGraphData['state']['notes'],
  edges: KnowledgeGraphData['state']['edges'] = {},
  sequenceThrough = 10,
): KnowledgeGraphData {
  return { runId: 'run_1', sequenceThrough, state: { notes, edges } };
}

const oneNote: KnowledgeGraphData['state']['notes'] = {
  'research-note:run_1:3': {
    id: 'research-note:run_1:3',
    runId: 'run_1',
    generationId: 'run_1-gen0',
    agenomeId: 'agn_0',
    toolName: 'web_search',
    query: 'patient flow management',
    snippet: 'Hospitals reduce ED wait via fast-track triage.',
    sourceUrls: ['https://example.com/a'],
    sequence: 3,
    eventId: 'evt-3',
  },
};

describe('ResearchNoteCard — accessible tool encoding (not color alone)', () => {
  it('renders the tool label + glyph + query (color is redundant)', () => {
    render(
      <ResearchNoteCard
        data={{
          kind: 'note',
          label: 'patient flow',
          toolName: 'web_search',
          query: 'patient flow management',
          snippet: 'snippet text',
          sourceUrls: ['https://example.com/a'],
        }}
      />,
    );
    expect(screen.getByText('web')).toBeTruthy(); // the tool label channel
    expect(screen.getByText('patient flow management')).toBeTruthy(); // the query
    expect(screen.getByText('1 source')).toBeTruthy();
    expect(document.querySelector('[aria-hidden="true"]')?.textContent).toBeTruthy(); // glyph channel
  });
});

describe('KnowledgeGraph — React Flow knowledge panel', () => {
  it('renders a research-notes summary', async () => {
    render(<KnowledgeGraph graph={graphWith(oneNote)} />);
    await waitFor(() =>
      expect(screen.getByTestId('knowledge-summary').textContent).toMatch(/1 research notes/),
    );
    expect(screen.getByTestId('knowledge-summary').textContent).toMatch(/1 agents/);
  });

  it('shows an empty state when there is no research', () => {
    render(<KnowledgeGraph graph={graphWith({})} />);
    expect(screen.getByText(/No research yet/i)).toBeTruthy();
  });

  it('keeps the freshest projection by sequenceThrough (a stale watermark never replaces a newer view)', async () => {
    const { rerender } = render(<KnowledgeGraph graph={graphWith(oneNote, {}, 10)} />);
    const summary = () => screen.getByTestId('knowledge-summary').textContent ?? '';
    await waitFor(() => expect(summary()).toMatch(/sequence 10/));
    rerender(<KnowledgeGraph graph={graphWith({}, {}, 5)} />); // stale → not applied
    await waitFor(() => expect(summary()).toMatch(/sequence 10/));
    expect(summary()).toMatch(/1 research notes/); // still the newer view
  });

  it('fires onNodeClick with the node id + kind', async () => {
    const onNodeClick = vi.fn();
    render(<KnowledgeGraph graph={graphWith(oneNote)} onNodeClick={onNodeClick} />);
    const node = (await screen.findByText('patient flow management')).closest('.react-flow__node');
    expect(node).toBeTruthy();
    fireEvent.click(node!);
    expect(onNodeClick).toHaveBeenCalledWith('research-note:run_1:3', 'note');
  });

  it('imports nothing from apps/api', () => {
    const files = readdirSync(KNOWLEDGE_DIR).filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const src = readFileSync(`${KNOWLEDGE_DIR}/${f}`, 'utf8');
      expect(src, f).not.toMatch(/from\s+['"][^'"]*apps\/api/);
    }
  });

  it('styling uses var() tokens — no raw hex / no raw px (layout geometry exempt)', () => {
    const files = readdirSync(KNOWLEDGE_DIR).filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));
    for (const f of files) {
      const src = readFileSync(`${KNOWLEDGE_DIR}/${f}`, 'utf8');
      expect(src, `${f} contains a raw hex color`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(src, `${f} contains a raw px value`).not.toMatch(/\b\d+px\b/);
    }
  });
});
