import type { CSSProperties } from 'react';
import type { Edge, Node } from '@xyflow/react';
import type { CaseStudyGraph } from '../data/caseStudy';

/**
 * caseStudyToFlow — the PURE `CaseStudyGraph` → React Flow `{nodes, edges}` mapping for the Islands BLOOM
 * view. The case study is the ROOT; each run that executed against it is a HUB branching off the root; each
 * run's doppels (crowned winners) are LEAF petals blooming off that run. So the graph reads left→right as
 * the case study GROWS into runs and runs bloom into doppels — a growing idea-network. Pure + storage-
 * agnostic (depends only on the projection shape; no provider). Edges are `animated` so the bloom visibly
 * flows; a node carries a `growOrder` the view staggers a grow-in animation by.
 */

export type BloomNodeKind = 'caseStudy' | 'run' | 'doppel';

/** A type alias (not interface) so it satisfies React Flow's `Node<data extends Record<string,unknown>>`. */
export type BloomNodeData = {
  readonly kind: BloomNodeKind;
  readonly label: string;
  /** Layout tier: 0 = case study root, 1 = run hub, 2 = doppel leaf. */
  readonly tier: number;
  /** Stagger index for the grow-in animation (root 0, then runs, then doppels). */
  readonly growOrder: number;
  // run + caseStudy:
  readonly status?: string | null | undefined;
  readonly runCount?: number | undefined;
  readonly doppelCount?: number | undefined;
  // run + doppel layout grouping:
  readonly parentRunId?: string | undefined;
  readonly runRow?: number | undefined;
  // doppel:
  readonly summary?: string | undefined;
};

export type BloomRfNode = Node<BloomNodeData, BloomNodeKind>;
export type BloomRfEdge = Edge<{ edgeType: 'branch' | 'bloom' }>;

export interface BloomFlow {
  readonly nodes: BloomRfNode[];
  readonly edges: BloomRfEdge[];
}

/** Per-edge-type visual: a run BRANCHES off the case study (accent/cyan), a doppel BLOOMS off a run (gold). */
export function bloomEdgeStyle(edgeType: 'branch' | 'bloom'): CSSProperties {
  return edgeType === 'bloom'
    ? { stroke: 'var(--status-selected)', strokeWidth: 2 } // gold — the winner petals
    : { stroke: 'var(--accent)', strokeWidth: 2 }; // cyan — the run branches
}

export function caseStudyToFlow(graph: CaseStudyGraph): BloomFlow {
  const nodes: BloomRfNode[] = [];
  const edges: BloomRfEdge[] = [];

  const rootId = `cs:${graph.caseStudyId}`;
  const totalDoppels = graph.runs.reduce((sum, run) => sum + run.doppels.length, 0);
  nodes.push({
    id: rootId,
    type: 'caseStudy',
    position: { x: 0, y: 0 },
    data: {
      kind: 'caseStudy',
      label: graph.caseStudyId,
      tier: 0,
      growOrder: 0,
      runCount: graph.runs.length,
      doppelCount: totalDoppels,
    },
  });

  let growOrder = 1;
  graph.runs.forEach((run, runRow) => {
    nodes.push({
      id: run.runId,
      type: 'run',
      position: { x: 0, y: 0 },
      data: {
        kind: 'run',
        label: run.problem ?? run.runId,
        tier: 1,
        growOrder: growOrder++,
        status: run.status,
        doppelCount: run.doppels.length,
        runRow,
      },
    });
    edges.push({
      id: `branch:${rootId}->${run.runId}`,
      source: rootId,
      target: run.runId,
      type: 'smoothstep',
      animated: true,
      data: { edgeType: 'branch' },
      style: bloomEdgeStyle('branch'),
    });

    run.doppels.forEach((doppel) => {
      const doppelId = `doppel:${run.runId}:${doppel.candidateId}`;
      nodes.push({
        id: doppelId,
        type: 'doppel',
        position: { x: 0, y: 0 },
        data: {
          kind: 'doppel',
          label: doppel.title,
          tier: 2,
          growOrder: growOrder++,
          summary: doppel.summary,
          parentRunId: run.runId,
          runRow,
        },
      });
      edges.push({
        id: `bloom:${run.runId}->${doppelId}`,
        source: run.runId,
        target: doppelId,
        type: 'smoothstep',
        animated: true,
        data: { edgeType: 'bloom' },
        style: bloomEdgeStyle('bloom'),
      });
    });
  });

  return { nodes, edges };
}
