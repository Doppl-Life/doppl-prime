// @vitest-environment happy-dom
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
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

/** Resolve one LineageNode's mapped React Flow node data (exercises the real lineageToFlow mapping). */
function dataFor(node: LineageGraphProjection['nodes'][number]): LineageNodeData {
  return lineageToFlow({ runId: 'run_1', nodes: [node], edges: [], sequenceThrough: 1 }).nodes[0]!
    .data;
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
