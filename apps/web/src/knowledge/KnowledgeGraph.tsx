import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Background, Controls, Panel, ReactFlow, ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { KnowledgeGraph as KnowledgeGraphData } from '../data/knowledge';
import { knowledgeToFlow } from './knowledgeToFlow';
import type { KnowledgeNodeData } from './knowledgeToFlow';
import { layoutKnowledge } from './layout';
import { knowledgeNodeTypes } from './nodeTypes';
import { KnowledgeLegend } from './KnowledgeLegend';

/**
 * KnowledgeGraph — the Knowledge-Evolution centerpiece. Renders the ResearchNote projection (the agents'
 * research folded from the log, KB slice 1) as a React Flow graph via the pure `knowledgeToFlow` mapping +
 * the deterministic per-generation column `layout`. It tracks the FRESHEST projection by `sequenceThrough`
 * (a stale watermark never replaces a newer view) so a live run's knowledge GROWS in place. Read-only: it
 * renders a derived projection and issues no writes (safety rule #2).
 */
export interface KnowledgeGraphProps {
  graph: KnowledgeGraphData;
  /** Node-click → caller (e.g. open a note's sources). Fires with the node id + kind. */
  onNodeClick?: (nodeId: string, kind: KnowledgeNodeData['kind']) => void;
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
  height: '70vh',
  border: 'thin solid var(--border-subtle)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--bg-surface)',
};
const empty: CSSProperties = {
  display: 'grid',
  placeItems: 'center',
  height: '100%',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-label)',
  color: 'var(--fg-muted)',
  padding: 'var(--space-4)',
  textAlign: 'center',
};

/** Keep the freshest projection by `sequenceThrough` (watermark): a stale one never replaces a newer view. */
function freshest(current: KnowledgeGraphData, incoming: KnowledgeGraphData): KnowledgeGraphData {
  return incoming.sequenceThrough < current.sequenceThrough ? current : incoming;
}

export function KnowledgeGraph({ graph, onNodeClick }: KnowledgeGraphProps) {
  const [shown, setShown] = useState<KnowledgeGraphData>(graph);
  useEffect(() => {
    setShown((current) => freshest(current, graph));
  }, [graph]);

  const flow = useMemo(() => knowledgeToFlow(shown.state), [shown]);
  const nodes = useMemo(() => layoutKnowledge(flow.nodes, flow.edges), [flow]);

  const noteCount = Object.keys(shown.state.notes).length;
  // The agenomes that actually appear in the graph = those that produced a research note. Count BOTH the
  // agent total and the culled total over this same population so the summary can never read "1 agents · 2
  // culled" (a culled lineage that did no research has an `agenomes` entry but no hub — exclude it here).
  const researchingAgenomeIds = new Set(
    Object.values(shown.state.notes)
      .map((n) => n.agenomeId)
      .filter((id): id is string => id !== null),
  );
  const agentCount = researchingAgenomeIds.size;
  const culledCount = Object.values(shown.state.agenomes ?? {}).filter(
    (a) => a.culled && researchingAgenomeIds.has(a.id),
  ).length;

  return (
    <section aria-label="Knowledge evolution graph" style={section}>
      <header data-testid="knowledge-summary" style={summary}>
        {noteCount} research notes · {agentCount} agents
        {culledCount > 0 ? ` · ${culledCount} culled (dead ends)` : ''} · sequence{' '}
        {shown.sequenceThrough}
      </header>

      <div style={graphWrap}>
        {noteCount === 0 ? (
          <div style={empty}>
            No research yet — this run&apos;s agents have not made tool calls. Run a live tool-use
            run to grow the knowledge graph.
          </div>
        ) : (
          <ReactFlowProvider>
            <ReactFlow
              nodes={nodes}
              edges={flow.edges}
              nodeTypes={knowledgeNodeTypes}
              nodesDraggable={false}
              nodesConnectable={false}
              fitView
              minZoom={0.1}
              proOptions={{ hideAttribution: true }}
              onNodeClick={(_, node) => {
                const data = node.data as KnowledgeNodeData;
                onNodeClick?.(node.id, data.kind);
              }}
            >
              <Background />
              <Controls showInteractive={false} />
              <Panel position="top-right">
                <KnowledgeLegend />
              </Panel>
            </ReactFlow>
          </ReactFlowProvider>
        )}
      </div>
    </section>
  );
}
