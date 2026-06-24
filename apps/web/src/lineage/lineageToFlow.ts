import type { Edge, Node } from '@xyflow/react';
import type { LineageGraphProjection, LineageNode, LineageNodeType } from '../data/contracts';
import { resolveStatus } from '../components/core/status-map';
import type { StatusDomain, StatusSpec } from '../components/core/status-map';

/**
 * lineageToFlow — the PURE `LineageGraphProjection` → React Flow `{nodes, edges}` mapping (the §10/§12
 * lineage centerpiece). Storage-agnostic: it depends only on the abstract projection shape (P0.13), never
 * on any physical store. The closed 6 `LineageNodeType` render as the FIVE custom node types —
 * `critic`+`check` collapse to one `criticCheck`; a `candidate` whose `status==='selected'` becomes the
 * `selectedWinner` (LESSONS §30); `generation` is the tier `backbone`. Each node carries its accessible
 * status spec (shape+label+icon, P7.3) and its `dataRef` link target (the value the inspector/evidence/
 * final-idea panels consume). A dangling edge (missing endpoint) is DROPPED — React Flow breaks on one
 * (defensive mirror of the producer P6.3 / LESSONS §30).
 */

/** The five custom React Flow node types + the `generation` backbone (6th, minimal tier marker). */
export type LineageRfNodeType =
  | 'generation'
  | 'agenome'
  | 'candidate'
  | 'criticCheck'
  | 'score'
  | 'selectedWinner';

/** A type alias (NOT interface) so it satisfies React Flow's `Node<data extends Record<string,unknown>>`. */
export type LineageNodeData = {
  readonly label: string;
  /** The original projection node type (for backbone/winner styling decisions). */
  readonly nodeType: LineageNodeType;
  // `| undefined` (not bare `?`) so the literal may carry an explicit undefined under
  // exactOptionalPropertyTypes — the projection's optional fields pass through verbatim.
  readonly status?: string | undefined;
  readonly statusDomain?: StatusDomain | undefined;
  /** The resolved accessible encoding {glyph,label,colorToken} — present iff `status` is set. */
  readonly statusSpec?: StatusSpec | undefined;
  readonly metrics?: Readonly<Record<string, number>> | undefined;
  /** The opaque authoritative pointer (§9) — the inspector/evidence/final-idea link target. */
  readonly dataRef: string;
  /** In-flight sub-state — set when this node's `dataRef` ∈ the deriveInFlight working set. */
  readonly working: boolean;
};

export type LineageRfNode = Node<LineageNodeData, LineageRfNodeType>;
export type LineageRfEdge = Edge<{ edgeType: string }>;

export interface FlowGraph {
  readonly nodes: LineageRfNode[];
  readonly edges: LineageRfEdge[];
}

/** Projection node type → the status-map domain used to resolve its accessible encoding. */
const TYPE_TO_DOMAIN: Record<LineageNodeType, StatusDomain | undefined> = {
  generation: 'generation',
  agenome: 'agenome',
  candidate: 'candidate',
  critic: 'check', // critic + check share the check status domain (passed/failed/skipped)
  check: 'check',
  score: undefined, // score nodes carry no status — they render metrics
};

/** The rendered React Flow node type for a projection node (6 input types → 5 custom + backbone). */
function rfTypeFor(node: LineageNode): LineageRfNodeType {
  if (node.type === 'critic' || node.type === 'check') return 'criticCheck';
  if (node.type === 'candidate' && node.status === 'selected') return 'selectedWinner';
  return node.type; // 'generation' | 'agenome' | 'candidate' | 'score'
}

/**
 * The detail node types FILTERED OUT of the decluttered organism graph (FV.5a) — their critic/check/
 * score/fitness detail (incl. judge-acceptance, which the producer emits as a `score` node) moves to the
 * node-click inspector drawer. These are LEAF nodes (each has one incoming `candidate→X` edge and no
 * outgoing), so dropping them + their incident edges leaves the agenome→candidate backbone connected;
 * no incoming→outgoing re-bridge is needed. The PROJECTION stays complete/authoritative (§10) — the
 * declutter is presentation-only.
 */
export const BACKBONE_DROP_TYPES: ReadonlySet<LineageNodeType> = new Set([
  'critic',
  'check',
  'score',
]);

export function lineageToFlow(
  projection: LineageGraphProjection,
  workingRefs: ReadonlySet<string> = new Set(),
  dropTypes: ReadonlySet<LineageNodeType> = BACKBONE_DROP_TYPES,
): FlowGraph {
  // FV.5a — keep only the backbone (agenome + candidate + generation); the dropped detail types move to
  // the inspector. nodeIds is computed from the KEPT nodes, so the edge filter below removes BOTH
  // dangling edges AND edges incident to a dropped node in one pass.
  const keptNodes = projection.nodes.filter((n) => !dropTypes.has(n.type));
  const nodeIds = new Set(keptNodes.map((n) => n.id));

  const nodes: LineageRfNode[] = keptNodes.map((n) => {
    const statusDomain = TYPE_TO_DOMAIN[n.type];
    const statusSpec = n.status !== undefined ? resolveStatus(statusDomain, n.status) : undefined;
    return {
      id: n.id,
      type: rfTypeFor(n),
      position: { x: 0, y: 0 }, // assigned by the deterministic Dagre layout helper
      data: {
        label: n.label,
        nodeType: n.type,
        status: n.status,
        statusDomain,
        statusSpec,
        metrics: n.metrics,
        dataRef: n.dataRef,
        working: workingRefs.has(n.dataRef),
      },
    };
  });

  // Drop dangling edges (a missing source/target endpoint) — React Flow throws on one (LESSONS §30).
  const edges: LineageRfEdge[] = projection.edges
    .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
    .map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label ?? e.type,
      data: { edgeType: e.type },
    }));

  return { nodes, edges };
}

/**
 * Keep the freshest projection by `sequenceThrough` (§10 watermark): a stale (lower-watermark)
 * projection never replaces a newer one; an equal/higher watermark is accepted.
 */
export function pickFreshestProjection(
  current: LineageGraphProjection | null,
  incoming: LineageGraphProjection,
): LineageGraphProjection {
  if (current && incoming.sequenceThrough < current.sequenceThrough) return current;
  return incoming;
}
