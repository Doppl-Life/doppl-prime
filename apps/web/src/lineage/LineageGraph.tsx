import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Background, Controls, Panel, ReactFlow, ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { LineageGraphProjection, LineageNodeType, RunEventEnvelope } from '../data/contracts';
import { lineageToFlow, pickFreshestProjection } from './lineageToFlow';
import type { LineageNodeData } from './lineageToFlow';
import { layoutGraph } from './layout';
import { deriveInFlight } from './inFlight';
import { lineageNodeTypes } from './nodeTypes';
import { LineageLegend } from './LineageLegend';

/**
 * LineageGraph — the §12 dashboard centerpiece. Renders the storage-agnostic `LineageGraphProjection`
 * (P0.13) as a React Flow graph: the pure `lineageToFlow` mapping (6 node types → 5 custom + backbone)
 * + the deterministic Dagre-LR `layout` + the five custom node types. It tracks the FRESHEST projection
 * by `sequenceThrough` (a stale watermark never replaces a newer view, §10) and derives a per-node
 * in-flight sub-state from the run-event stream (`deriveInFlight`, the P7.2-deferred derivation, LESSONS
 * §2), bridging working *entity ids* to nodes via `dataRef` and surfacing a live activity feed
 * (start→finish) — replay reproduces the identical liveness (§4). Read-only: it renders a derived
 * projection and issues no writes (safety rule #2). The persistent mount is the P7.14 shell.
 */
export interface LineageGraphProps {
  projection: LineageGraphProjection;
  /** The run-store event stream (live or replay) — drives the in-flight sub-state + activity feed. */
  events?: readonly RunEventEnvelope[];
  /** FV.5a — node-click → the inspector drawer (the FV.4 carry-forward gap). Fires with the clicked
   *  node's id, its dataRef (inspector/evidence link target), and its projection node type. */
  onNodeClick?: (nodeId: string, dataRef: string, nodeType: LineageNodeType) => void;
}

const section: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
  fontFamily: 'var(--font-ui)',
  color: 'var(--fg-default)',
  height: '100%',
  minHeight: 0,
};
const summary: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-label)',
  color: 'var(--fg-muted)',
  background: 'var(--bg-surface)',
  padding: 'var(--space-1) var(--space-2)',
  borderRadius: 'var(--radius-sm)',
  border: 'thin solid var(--border-subtle)',
};
const graphWrap: CSSProperties = {
  width: '100%',
  flex: 1,
  minHeight: 0,
  border: 'thin solid var(--border-subtle)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--bg-surface)',
};

export function LineageGraph({ projection, events, onNodeClick }: LineageGraphProps) {
  // Track the freshest projection by `sequenceThrough` — a stale watermark never replaces a newer view.
  const [shown, setShown] = useState<LineageGraphProjection>(projection);
  useEffect(() => {
    setShown((current) => pickFreshestProjection(current, projection));
  }, [projection]);

  const inflight = useMemo(() => deriveInFlight(events ?? []), [events]);
  const flow = useMemo(
    () => lineageToFlow(shown, inflight.workingEntityIds),
    [shown, inflight.workingEntityIds],
  );
  // Generation headers (`type: 'generation'`) are kept in the rendered graph; their count is the run's
  // generation depth — a figure that means something to the user (unlike the raw event-log watermark).
  const generationCount = useMemo(
    () => shown.nodes.filter((n) => n.type === 'generation').length,
    [shown.nodes],
  );
  // Run Dagre layout asynchronously so the main thread can paint a loading indicator first and the
  // browser doesn't flag the tab as unresponsive on 1000+ node runs. We keep the previous laid-out
  // nodes visible while the new layout is being computed (no flash of empty graph). requestIdleCallback
  // when available, setTimeout(0) as the universal fallback.
  const [nodes, setNodes] = useState<ReturnType<typeof layoutGraph>>([]);
  const [layingOut, setLayingOut] = useState(false);
  useEffect(() => {
    setLayingOut(true);
    let cancelled = false;
    const compute = () => {
      if (cancelled) return;
      const laid = layoutGraph(flow.nodes, flow.edges);
      if (cancelled) return;
      setNodes(laid);
      setLayingOut(false);
    };
    const ric = (
      globalThis as unknown as {
        requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number;
        cancelIdleCallback?: (id: number) => void;
      }
    ).requestIdleCallback;
    if (typeof ric === 'function') {
      const id = ric(compute, { timeout: 500 });
      return () => {
        cancelled = true;
        (
          globalThis as unknown as { cancelIdleCallback?: (id: number) => void }
        ).cancelIdleCallback?.(id);
      };
    }
    const handle = setTimeout(compute, 0);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [flow]);

  return (
    <section aria-label="Lineage graph" style={section}>
      <div style={graphWrap}>
        <ReactFlowProvider>
          <ReactFlow
            nodes={nodes}
            edges={flow.edges}
            nodeTypes={lineageNodeTypes}
            nodesDraggable={false}
            nodesConnectable={false}
            fitView
            minZoom={0.1}
            // Viewport culling — RF skips DOM mount for off-screen nodes. Cuts work from O(N) to
            // O(visible) and unblocks the main thread on 1000+ node runs (Chrome's "Page
            // Unresponsive" prompt). Only-render-visible costs a hair of re-render on pan/zoom but
            // wins big on initial paint for large lineages.
            onlyRenderVisibleElements
            proOptions={{ hideAttribution: true }}
            onNodeClick={(_, node) => {
              const data = node.data as LineageNodeData;
              onNodeClick?.(node.id, data.dataRef, data.nodeType);
            }}
          >
            <Background />
            <Controls showInteractive={false} />
            {/* Watermark summary overlay — sits over the graph (doesn't reserve layout height). */}
            <Panel position="top-left">
              {/* Count the RENDERED backbone (flow.nodes) — agenomes + candidates + generation headers —
                  NOT shown.nodes (the full projection, which includes the critic/check/score detail nodes
                  filtered out at lineageToFlow and moved to the inspector). The label should match what's
                  on screen, and pairs the node count with the generation depth (both meaningful to the
                  user). The event-log watermark (`shown.sequenceThrough`) has no user-facing meaning, so
                  it's NOT displayed — retained only as a non-visible `data-` attr for debugging + tests. */}
              <div
                data-testid="lineage-summary"
                data-sequence-through={shown.sequenceThrough}
                style={summary}
              >
                {flow.nodes.length} nodes · {generationCount} generation
                {generationCount === 1 ? '' : 's'}
                {layingOut && nodes.length === 0 && ' · laying out…'}
              </div>
            </Panel>
            {/* Fixed-during-pan/zoom key so a non-expert can read the color-code + edge styles. */}
            <Panel position="top-right">
              <LineageLegend />
            </Panel>
          </ReactFlow>
        </ReactFlowProvider>
      </div>

    </section>
  );
}
