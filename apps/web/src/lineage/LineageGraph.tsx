import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Background, Controls, Panel, ReactFlow, ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { LineageGraphProjection, LineageNodeType, RunEventEnvelope } from '../data/contracts';
import { isRenderedEdge, lineageToFlow, pickFreshestProjection } from './lineageToFlow';
import type { LineageNodeData, LineageRfEdge } from './lineageToFlow';
import { layoutGraph } from './layout';
import { deriveInFlight } from './inFlight';
import { lineageNodeTypes } from './nodeTypes';
import { LineageLegend } from './LineageLegend';
import { LoadingState } from '../components/ds';

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
  /** The run's events are still being fetched/folded (the graph structure is up but the panels are empty).
   *  Keeps the canvas loading overlay up for the WHOLE initial load, not just the (fast) layout phase. */
  loading?: boolean;
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
  position: 'relative', // anchors the layout-in-progress overlay
  width: '100%',
  flex: 1,
  minHeight: 0,
  border: 'thin solid var(--border-subtle)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--bg-surface)',
};
// A full-canvas overlay shown while Dagre lays out a large graph (the nodes aren't mounted yet). It is
// OPAQUE and captures pointer events, so the operator sees a clear "laying out…" state instead of a blank
// grid, and can't click into an empty canvas (which would queue a flood of selections to fire once nodes
// appear). Removed the instant the laid-out nodes render.
const layoutOverlay: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--bg-surface)',
  borderRadius: 'var(--radius-md)',
  zIndex: 5,
};

export function LineageGraph({ projection, events, onNodeClick, loading }: LineageGraphProps) {
  // Track the freshest projection by `sequenceThrough` — a stale watermark never replaces a newer view.
  const [shown, setShown] = useState<LineageGraphProjection>(projection);
  useEffect(() => {
    setShown((current) => pickFreshestProjection(current, projection));
  }, [projection]);

  const inflight = useMemo(() => deriveInFlight(events ?? []), [events]);
  // STRUCTURE-only flow: node positions + edges depend on the projection structure, NOT the transient
  // in-flight working set. Keeping the working overlay OUT of this means a live/replay event stream (which
  // flips working states thousands of times) does NOT re-trigger the expensive Dagre layout — the working
  // flag is merged into the already-laid-out nodes below as a cheap O(N) data update.
  const structuralFlow = useMemo(() => lineageToFlow(shown), [shown]);
  // Generation headers (`type: 'generation'`) are kept in the rendered graph; their count is the run's
  // generation depth — a figure that means something to the user (unlike the raw event-log watermark).
  const generationCount = useMemo(
    () => shown.nodes.filter((n) => n.type === 'generation').length,
    [shown.nodes],
  );
  // Drawn edges: the breeding events (fusion + mutation) PLUS the short agenome→candidate provenance
  // connector. The `generation→agenome` spawned plumbing stays hidden (it produced a crossing hairball).
  const renderedEdges = useMemo(
    () =>
      structuralFlow.edges.filter(
        (e) => isRenderedEdge(e.data?.edgeType) || e.data?.winner === true,
      ),
    [structuralFlow.edges],
  );
  // Trace-on-hover: hovering a NODE lights its incident lines (and an EDGE lights itself) while every
  // other edge fades — so a single breeding line is followable end-to-end through the crossings. With
  // nothing hovered, all edges render normally.
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const [focusEdgeId, setFocusEdgeId] = useState<string | null>(null);
  const displayEdges = useMemo(() => {
    if (focusNodeId === null && focusEdgeId === null) return renderedEdges;
    return renderedEdges.map((e): LineageRfEdge => {
      const lit =
        e.id === focusEdgeId ||
        (focusNodeId !== null && (e.source === focusNodeId || e.target === focusNodeId));
      return {
        ...e,
        // Freeze the faded lines so motion doesn't distract; lit lines keep their own animation.
        ...(lit ? {} : { animated: false }),
        zIndex: lit ? 1000 : 0,
        style: {
          ...e.style,
          opacity: lit ? 1 : 0.06,
          // Bump only the lit line's width; faded lines keep their original stroke.
          ...(lit ? { strokeWidth: Number(e.style?.strokeWidth ?? 1.5) + 1 } : {}),
        },
      };
    });
  }, [renderedEdges, focusNodeId, focusEdgeId]);
  // Run Dagre layout asynchronously so the main thread can paint a loading indicator first and the
  // browser doesn't flag the tab as unresponsive on 1000+ node runs. We keep the previous laid-out
  // nodes visible while the new layout is being computed (no flash of empty graph). requestIdleCallback
  // when available, setTimeout(0) as the universal fallback.
  // Lay out the STRUCTURE only (re-runs when the projection structure changes, NOT on every event). The
  // working overlay is merged afterwards so the stream doesn't thrash the layout.
  const [laidOut, setLaidOut] = useState<ReturnType<typeof layoutGraph>>([]);
  useEffect(() => {
    let cancelled = false;
    const compute = () => {
      if (cancelled) return;
      const laid = layoutGraph(structuralFlow.nodes, structuralFlow.edges);
      if (cancelled) return;
      setLaidOut(laid);
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
  }, [structuralFlow]);

  // Merge the in-flight working flag into the laid-out nodes WITHOUT re-laying-out — a cheap O(N) pass that
  // only allocates new node objects for nodes whose working state actually changed.
  const nodes = useMemo(
    () =>
      laidOut.map((n) => {
        const working = inflight.workingEntityIds.has(n.data.dataRef);
        return n.data.working === working ? n : { ...n, data: { ...n.data, working } };
      }),
    [laidOut, inflight.workingEntityIds],
  );

  // The canvas is mid-load whenever there ARE nodes to place but none are laid out yet — this covers the
  // whole window from mount (incl. a cache-fast entry from the home page) through the async Dagre layout.
  // An empty projection (structuralFlow.nodes.length === 0) is genuinely empty, not loading.
  const layoutPending = structuralFlow.nodes.length > 0 && laidOut.length === 0;

  return (
    <section aria-label="Lineage graph" style={section}>
      <div style={graphWrap}>
        <ReactFlowProvider>
          <ReactFlow
            nodes={nodes}
            edges={displayEdges}
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
            // Trace-on-hover: a hovered node lights its lineage lines; a hovered edge lights itself.
            onNodeMouseEnter={(_, node) => setFocusNodeId(node.id)}
            onNodeMouseLeave={() => setFocusNodeId(null)}
            onEdgeMouseEnter={(_, edge) => setFocusEdgeId(edge.id)}
            onEdgeMouseLeave={() => setFocusEdgeId(null)}
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
                {structuralFlow.nodes.length} nodes · {generationCount} generation
                {generationCount === 1 ? '' : 's'}
                {layoutPending && ' · laying out…'}
              </div>
            </Panel>
            {/* Fixed-during-pan/zoom key so a non-expert can read the color-code + edge styles. */}
            <Panel position="top-right">
              <LineageLegend />
            </Panel>
          </ReactFlow>
        </ReactFlowProvider>
        {(layoutPending || loading === true) && (
          <div style={layoutOverlay} role="status" aria-live="polite">
            <LoadingState
              shape="graph"
              label={
                layoutPending
                  ? `Laying out ${structuralFlow.nodes.length.toLocaleString()} nodes…`
                  : 'Loading run data…'
              }
            />
          </div>
        )}
      </div>

    </section>
  );
}
