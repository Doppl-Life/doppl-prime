import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { CaseStudyGraph } from '../data/caseStudy';
import { caseStudyToFlow } from './caseStudyToFlow';
import { layoutBloom } from './bloomLayout';
import { bloomNodeTypes } from './nodeTypes';

/**
 * CaseStudyBloom — the Islands bloom centerpiece. Renders the cross-run case-study graph (case study → runs →
 * doppels) as a React Flow "growing network": the pure `caseStudyToFlow` mapping + the deterministic tiered
 * `layoutBloom`, with animated edges + staggered grow-in (nodeTypes). Read-only — renders a derived
 * projection, issues no writes (safety rule #2).
 */
export interface CaseStudyBloomProps {
  graph: CaseStudyGraph;
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
};
const graphWrap: CSSProperties = {
  width: '100%',
  flex: 1,
  minHeight: 0,
  border: 'thin solid var(--border-subtle)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--bg-void)',
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

export function CaseStudyBloom({ graph }: CaseStudyBloomProps) {
  const flow = useMemo(() => caseStudyToFlow(graph), [graph]);
  const nodes = useMemo(() => layoutBloom(flow.nodes), [flow]);

  const runCount = graph.runs.length;
  const doppelCount = graph.runs.reduce((sum, run) => sum + run.doppels.length, 0);

  return (
    <section aria-label="Case study bloom graph" style={section}>
      <header data-testid="bloom-summary" style={summary}>
        {runCount} run{runCount === 1 ? '' : 's'} · {doppelCount} doppel
        {doppelCount === 1 ? '' : 's'} blooming from this case study
      </header>

      <div style={graphWrap}>
        {runCount === 0 ? (
          <div style={empty}>
            No runs yet for this case study. Launch a run against it and its doppels will bloom
            here.
          </div>
        ) : (
          <ReactFlowProvider>
            <ReactFlow
              nodes={nodes}
              edges={flow.edges}
              nodeTypes={bloomNodeTypes}
              nodesDraggable={false}
              nodesConnectable={false}
              fitView
              minZoom={0.1}
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Dots} gap={28} size={1} />
              <Controls showInteractive={false} />
            </ReactFlow>
          </ReactFlowProvider>
        )}
      </div>
    </section>
  );
}
