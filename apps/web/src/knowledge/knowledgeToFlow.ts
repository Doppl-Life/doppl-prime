import type { CSSProperties } from 'react';
import type { Edge, Node } from '@xyflow/react';
import type { KnowledgeGraph } from '../data/knowledge';

/**
 * knowledgeToFlow — the PURE `KnowledgeGraph` (ResearchNote projection) → React Flow `{nodes, edges}`
 * mapping (the Knowledge-Evolution centerpiece). The stigmergy substrate rendered as a graph: each
 * GENERATION is a column; each AGENOME a hub in its column; each research NOTE a leaf branching off the
 * agenome that produced it. So the graph reads left→right as the swarm's shared knowledge GROWS generation
 * over generation. Pure + storage-agnostic (depends only on the projection shape; no provider). A dangling
 * edge (missing endpoint) is dropped — React Flow breaks on one (mirrors the lineage graph, LESSONS §5).
 */

export type KnowledgeNodeKind = 'generation' | 'agenome' | 'note';

/** A type alias (not interface) so it satisfies React Flow's `Node<data extends Record<string,unknown>>`. */
export type KnowledgeNodeData = {
  readonly kind: KnowledgeNodeKind;
  readonly label: string;
  /** The zero-based generation ordinal — the column the layout buckets into. */
  readonly generationIndex?: number | undefined;
  // note-only fields:
  readonly toolName?: string | undefined;
  readonly query?: string | undefined;
  readonly snippet?: string | undefined;
  readonly sourceUrls?: readonly string[] | undefined;
  // agenome-hub-only field:
  readonly noteCount?: number | undefined;
};

export type KnowledgeRfNode = Node<KnowledgeNodeData, KnowledgeNodeKind>;
export type KnowledgeRfEdge = Edge<{ edgeType: string }>;

export interface KnowledgeFlow {
  readonly nodes: KnowledgeRfNode[];
  readonly edges: KnowledgeRfEdge[];
}

/** Parse the zero-based generation ordinal from the `${runId}-gen${N}` generation-id scheme (pure). */
export function generationIndexOf(generationId: string | null): number | undefined {
  if (!generationId) return undefined;
  const match = /-gen(\d+)$/.exec(generationId);
  return match ? Number(match[1]) : undefined;
}

/** Compact an opaque agenome id to a readable hub label (ids are long UUIDs/derived strings). */
function shortId(id: string): string {
  return id.length > 8 ? `…${id.slice(-6)}` : id;
}

/** Per-edge-type visual (stroke + dash) — spawned backbone faint-dotted, researched solid, cited gold. */
export function knowledgeEdgeStyle(edgeType: string): CSSProperties {
  if (edgeType === 'spawned') {
    return { stroke: 'var(--border-subtle)', strokeDasharray: '2 4' };
  }
  if (edgeType === 'cited') {
    return { stroke: 'var(--status-selected)' };
  }
  return { stroke: 'var(--border-strong)' }; // researched
}

export function knowledgeToFlow(state: KnowledgeGraph['state']): KnowledgeFlow {
  const notes = Object.values(state.notes);
  const projectionEdges = Object.values(state.edges);

  // Distinct generations (from the notes' generationId) → header nodes; and each agenome's generation +
  // its note count → hub nodes.
  const generationIds = new Map<string, number | undefined>();
  const agenomeGen = new Map<string, string | null>();
  const agenomeNoteCount = new Map<string, number>();
  for (const note of notes) {
    if (note.generationId) {
      generationIds.set(note.generationId, generationIndexOf(note.generationId));
    }
    if (note.agenomeId !== null) {
      if (!agenomeGen.has(note.agenomeId)) agenomeGen.set(note.agenomeId, note.generationId);
      agenomeNoteCount.set(note.agenomeId, (agenomeNoteCount.get(note.agenomeId) ?? 0) + 1);
    }
  }

  const nodes: KnowledgeRfNode[] = [];
  for (const [genId, index] of generationIds) {
    nodes.push({
      id: genId,
      type: 'generation',
      position: { x: 0, y: 0 },
      data: {
        kind: 'generation',
        label: index !== undefined ? `Generation ${index}` : genId,
        generationIndex: index,
      },
    });
  }
  for (const [agId, genId] of agenomeGen) {
    nodes.push({
      id: agId,
      type: 'agenome',
      position: { x: 0, y: 0 },
      data: {
        kind: 'agenome',
        label: `Agent ${shortId(agId)}`,
        generationIndex: generationIndexOf(genId),
        noteCount: agenomeNoteCount.get(agId),
      },
    });
  }
  for (const note of notes) {
    nodes.push({
      id: note.id,
      type: 'note',
      position: { x: 0, y: 0 },
      data: {
        kind: 'note',
        label: note.query ?? note.toolName,
        generationIndex: generationIndexOf(note.generationId),
        toolName: note.toolName,
        query: note.query,
        snippet: note.snippet,
        sourceUrls: note.sourceUrls,
      },
    });
  }

  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges: KnowledgeRfEdge[] = [];
  // generation → agenome backbone (synthesized so the column reads as one tree).
  for (const [agId, genId] of agenomeGen) {
    if (genId !== null && nodeIds.has(genId) && nodeIds.has(agId)) {
      edges.push({
        id: `spawned:${genId}->${agId}`,
        source: genId,
        target: agId,
        type: 'smoothstep',
        data: { edgeType: 'spawned' },
        style: knowledgeEdgeStyle('spawned'),
      });
    }
  }
  // the projection's researched/cited edges (drop dangling endpoints — RF breaks on them).
  for (const edge of projectionEdges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue;
    edges.push({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: 'smoothstep',
      data: { edgeType: edge.type },
      style: knowledgeEdgeStyle(edge.type),
    });
  }

  return { nodes, edges };
}
