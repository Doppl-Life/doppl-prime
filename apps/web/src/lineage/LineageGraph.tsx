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
  display: 'grid',
  gap: 'var(--space-3)',
  fontFamily: 'var(--font-ui)',
  color: 'var(--fg-default)',
};
const summary: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-label)',
  color: 'var(--fg-muted)',
};
const graphWrap: CSSProperties = {
  width: '100%',
  height: '60vh',
  border: 'thin solid var(--border-subtle)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--bg-surface)',
};
const feed: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'grid',
  gap: 'var(--space-1)',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-caption)',
  color: 'var(--fg-muted)',
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
  const nodes = useMemo(() => layoutGraph(flow.nodes, flow.edges), [flow]);

  return (
    <section aria-label="Lineage graph" style={section}>
      <header data-testid="lineage-summary" style={summary}>
        {shown.nodes.length} nodes · sequence {shown.sequenceThrough}
      </header>

      <div style={graphWrap}>
        <ReactFlowProvider>
          <ReactFlow
            nodes={nodes}
            edges={flow.edges}
            nodeTypes={lineageNodeTypes}
            nodesDraggable={false}
            nodesConnectable={false}
            fitView
            proOptions={{ hideAttribution: true }}
            onNodeClick={(_, node) => {
              const data = node.data as LineageNodeData;
              onNodeClick?.(node.id, data.dataRef, data.nodeType);
            }}
          >
            <Background />
            <Controls showInteractive={false} />
            {/* Fixed-during-pan/zoom key so a non-expert can read the color-code + edge styles. */}
            <Panel position="top-right">
              <LineageLegend />
            </Panel>
          </ReactFlow>
        </ReactFlowProvider>
      </div>

      <ul data-testid="lineage-activity" aria-label="Activity feed" style={feed}>
        {inflight.feed.map((entry) => (
          <li key={entry.startEventId}>
            {entry.operation} · {entry.status} · {entry.entityId}
          </li>
        ))}
      </ul>
    </section>
  );
}
