// @vitest-environment happy-dom
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { LineageGraphProjection } from '@doppl/contracts';
import { LineageGraph } from '../../../src/lineage/LineageGraph';
import { LineageNodeCard } from '../../../src/lineage/nodeTypes';
import { lineageToFlow } from '../../../src/lineage/lineageToFlow';
import type { LineageNodeData } from '../../../src/lineage/lineageToFlow';
import { multiNodeLineage } from '../../fixtures/lineage';

const LINEAGE_DIR = resolve(process.cwd(), 'src/lineage');

// React Flow measures its container via ResizeObserver + matchMedia — happy-dom has neither, so stub
// them (a node-positioning concern; the deterministic core is unit-pinned separately). Pixels are
// covered by the P7.15 Playwright smoke, NOT here.
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

/** Resolve one LineageNode's mapped React Flow node data (exercises the real lineageToFlow mapping).
 *  Pass an EMPTY dropTypes so the card-rendering test can still build data for a `score` node — the
 *  FV.5a declutter filters which types the GRAPH shows, but the LineageNodeCard still renders all 6. */
function dataFor(node: LineageGraphProjection['nodes'][number]): LineageNodeData {
  return lineageToFlow(
    { runId: 'run_1', nodes: [node], edges: [], sequenceThrough: 1 },
    new Set(),
    new Set(),
  ).nodes[0]!.data;
}

describe('LineageNodeCard — accessible custom node rendering', () => {
  // spec(rule #4 / §12): each node renders status via shape+label+icon (the shared StatusBadge), never
  // color alone.
  it('test_status_accessible_not_color_alone', () => {
    render(
      <LineageNodeCard
        data={dataFor({
          id: 'a0',
          type: 'agenome',
          label: 'A0',
          status: 'active',
          dataRef: 'agn_0',
        })}
      />,
    );
    expect(screen.getByText('active')).toBeTruthy(); // the label channel
    expect(document.querySelector('[aria-hidden="true"]')?.textContent).toBeTruthy(); // the glyph channel
    cleanup();

    // selected-winner candidate: the ♔ winner encoding (shape) + 'selected' label.
    render(
      <LineageNodeCard
        data={dataFor({
          id: 'w0',
          type: 'candidate',
          label: 'W',
          status: 'selected',
          dataRef: 'cand_win',
        })}
      />,
    );
    expect(screen.getByText('selected')).toBeTruthy();
    cleanup();

    // score node: no status, renders its metrics instead of a status badge.
    render(
      <LineageNodeCard
        data={dataFor({
          id: 'sc0',
          type: 'score',
          label: 'Fit',
          metrics: { total: 0.84 },
          dataRef: 'fit_0',
        })}
      />,
    );
    expect(screen.getByText(/total/i)).toBeTruthy();
  });

  // spec(§12 color-code): the node BODY is color-coded by operation via a prominent LEFT border bar —
  // a seeded agenome (seeded hue), a mutated agenome (mutated hue), a fused agenome (reproduced hue),
  // and the selected winner (selected hue + winner glow). Color is redundant w/ the StatusBadge glyph.
  it('test_node_body_color_coded_by_operation', () => {
    const cardLeftBorder = (data: LineageNodeData): string => {
      const { container } = render(<LineageNodeCard data={data} />);
      const div = container.querySelector('div') as HTMLElement;
      const bl = div.style.borderLeft;
      cleanup();
      return bl;
    };

    // a seeded agenome (bornBy seed) → the seeded hue on the left bar.
    expect(
      cardLeftBorder({
        label: 'Seed',
        nodeType: 'agenome',
        status: 'active',
        dataRef: 'agn_s',
        working: false,
        bornBy: 'seed',
      }),
    ).toContain('var(--status-seeded)');

    // a mutated agenome → the mutated (amber) hue.
    expect(
      cardLeftBorder({
        label: 'Mut',
        nodeType: 'agenome',
        status: 'active',
        dataRef: 'agn_m',
        working: false,
        bornBy: 'mutation',
      }),
    ).toContain('var(--status-mutated)');

    // a fused agenome → the reproduced (violet) hue.
    expect(
      cardLeftBorder({
        label: 'Fus',
        nodeType: 'agenome',
        status: 'active',
        dataRef: 'agn_f',
        working: false,
        bornBy: 'fusion',
      }),
    ).toContain('var(--status-reproduced)');

    // the selected winner → the selected (gold) hue.
    expect(
      cardLeftBorder({
        label: 'W',
        nodeType: 'candidate',
        status: 'selected',
        dataRef: 'cand_w',
        working: false,
      }),
    ).toContain('var(--status-selected)');

    // a culled candidate → the culled (red) hue.
    expect(
      cardLeftBorder({
        label: 'X',
        nodeType: 'candidate',
        status: 'culled',
        dataRef: 'cand_x',
        working: false,
      }),
    ).toContain('var(--status-culled)');
  });

  // B5 declutter (§12): a long candidate title previously stretched its node wide enough to overlap the
  // neighbouring column (an unbounded label span). The title is now bounded + single-line-ellipsised, with
  // the full text on a `title` tooltip — the node keeps a fixed footprint so the column grid stays legible.
  it('test_long_node_label_truncates_with_title_tooltip', () => {
    const longLabel =
      'A very long cross-domain transfer candidate title that would otherwise overflow its node box';
    const { container } = render(
      <LineageNodeCard
        data={{
          label: longLabel,
          nodeType: 'candidate',
          status: 'scored',
          dataRef: 'cand_long',
          working: false,
        }}
      />,
    );
    const labelSpan = container.querySelector(`[title="${longLabel}"]`) as HTMLElement;
    expect(labelSpan, 'the label carries the full text as a title tooltip').toBeTruthy();
    expect(labelSpan.textContent).toBe(longLabel); // full text stays in the DOM (CSS-clipped only)
    // single-line ellipsis truncation (the node footprint stays bounded).
    expect(labelSpan.style.textOverflow).toBe('ellipsis');
    expect(labelSpan.style.whiteSpace).toBe('nowrap');
    expect(labelSpan.style.overflow).toBe('hidden');
  });
});

describe('LineageGraph — React Flow lineage panel', () => {
  // spec(§10 watermark): the graph reflects the freshest projection; a stale (lower sequenceThrough)
  // projection is NOT shown over a newer one.
  it('test_graph_updates_on_sequenceThrough_advance', async () => {
    const p2: LineageGraphProjection = {
      ...multiNodeLineage,
      sequenceThrough: 20,
      nodes: [
        ...multiNodeLineage.nodes,
        { id: 'a1', type: 'agenome', label: 'Agenome 1', status: 'active', dataRef: 'agn_1' },
      ],
    };
    const stale: LineageGraphProjection = {
      ...multiNodeLineage,
      sequenceThrough: 5,
      nodes: [multiNodeLineage.nodes[0]!],
    };

    const { rerender } = render(<LineageGraph projection={multiNodeLineage} />);
    const summary = () => screen.getByTestId('lineage-summary').textContent ?? '';
    await waitFor(() => expect(summary()).toMatch(/5 nodes/));
    expect(summary()).toMatch(/sequence 12/);

    rerender(<LineageGraph projection={p2} />); // newer watermark → applied
    await waitFor(() => expect(summary()).toMatch(/6 nodes/));
    expect(summary()).toMatch(/sequence 20/);

    rerender(<LineageGraph projection={stale} />); // stale watermark → NOT applied
    await waitFor(() => expect(summary()).toMatch(/sequence 20/));
    expect(summary()).toMatch(/6 nodes/); // still the newer view
  });

  // spec(FV.5a — the FV.4 carry-forward gap): clicking a flow node fires onNodeClick(nodeId, dataRef,
  // nodeType) — the wiring the node-click inspector consumes. (criticCheck/score are decluttered, so the
  // agenome backbone node is the click target.)
  it('test_lineage_graph_onnodeclick_fires', async () => {
    const onNodeClick = vi.fn();
    render(<LineageGraph projection={multiNodeLineage} onNodeClick={onNodeClick} />);
    const node = (await screen.findByText('Agenome 0')).closest('.react-flow__node');
    expect(node).toBeTruthy();
    fireEvent.click(node!);
    expect(onNodeClick).toHaveBeenCalledWith('a0', 'agn_0', 'agenome');
  });

  // smoke: mounts without throwing and surfaces the live activity feed derived from the event stream.
  it('test_renders_activity_feed_from_events', async () => {
    render(
      <LineageGraph
        projection={multiNodeLineage}
        events={[
          {
            id: 'evt_1',
            runId: 'run_1',
            type: 'critic.review_started',
            sequence: 13,
            occurredAt: '2026-06-20T12:00:13.000Z',
            actor: 'critic',
            payload: {},
            schemaVersion: 2,
            candidateId: 'cand_0',
          },
        ]}
      />,
    );
    const feed = await screen.findByTestId('lineage-activity');
    expect(feed.textContent).toMatch(/review/i); // the in-flight op surfaced in the feed
  });

  // spec(rule #6): the lineage module imports nothing from apps/api.
  it('test_no_apps_api_import', () => {
    const files = readdirSync(LINEAGE_DIR).filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const src = readFileSync(`${LINEAGE_DIR}/${f}`, 'utf8');
      expect(src, f).not.toMatch(/from\s+['"][^'"]*apps\/api/);
      expect(src, f).not.toMatch(/@doppl\/api/);
    }
  });

  // spec(_adherence, ADD): styling uses var() tokens — no raw hex / no raw px strings. Dagre geometry
  // (numeric width/height/positions in layout.ts) is EXEMPT — it is layout math, not styling.
  it('test_no_raw_hex_or_px_styling', () => {
    const files = readdirSync(LINEAGE_DIR).filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));
    for (const f of files) {
      const src = readFileSync(`${LINEAGE_DIR}/${f}`, 'utf8');
      expect(src, `${f} contains a raw hex color`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(src, `${f} contains a raw px value`).not.toMatch(/\b\d+px\b/);
    }
  });
});
