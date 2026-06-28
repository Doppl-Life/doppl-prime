import type { Edge, Node } from '@xyflow/react';
import type { LineageGraphProjection, LineageNode, LineageNodeType } from '../data/contracts';
import { resolveStatus } from '../components/core/status-map';
import type { StatusDomain, StatusSpec } from '../components/core/status-map';
import { WINNER_EDGE_VISUAL, edgeStyleFor } from './edgeStyles';

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

/** The fusion-family reproduction modes (the §8/§3 two-parent breeding modes). */
const FUSION_MODES: ReadonlySet<string> = new Set(['fusion', 'crossover', 'output_synthesis']);

/** The reproduction (breeding-event) edge types — the ONLY edges drawn on the decluttered canvas. The
 *  routine plumbing (`generated` agenome→candidate, `spawned` generation→agenome) is implied by column
 *  position and is NOT rendered (it added a dense crossing hairball). Layout still uses the full edge set. */
export const REPRODUCTION_EDGE_TYPES: ReadonlySet<string> = new Set([
  'mutation_only',
  'fusion',
  'crossover',
  'output_synthesis',
]);

/** True iff an edge's projection type is a breeding event (mutation/fusion). */
export function isReproductionEdge(edgeType: string | undefined): boolean {
  return edgeType !== undefined && REPRODUCTION_EDGE_TYPES.has(edgeType);
}

/**
 * The edges actually DRAWN on the canvas: the breeding events (cross-generation, horizontal) PLUS the
 * short `generated` agenome→candidate connector (vertical, within a column — the provenance link that
 * makes "this organism produced this idea" explicit). The `spawned` generation→agenome plumbing stays
 * hidden (implied by the header + column). Non-rendered edges still feed the layout's detangle.
 */
export function isRenderedEdge(edgeType: string | undefined): boolean {
  return isReproductionEdge(edgeType) || edgeType === 'generated';
}

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
  /** The zero-based generation ordinal (from the projection node) — the column the layout buckets into. */
  readonly generationIndex?: number | undefined;
  /**
   * How an AGENOME node came to exist — derived from its incoming reproduction edge (`mutation_only` →
   * 'mutation'; the fusion family → 'fusion'; no incoming repro edge → 'seed'). Drives the node body
   * color-code (§12). Left `undefined` for non-agenome nodes.
   */
  readonly bornBy?: 'seed' | 'fusion' | 'mutation' | undefined;
};

export type LineageRfNode = Node<LineageNodeData, LineageRfNodeType>;
export type LineageRfEdge = Edge<{
  edgeType: string;
  winner?: boolean;
  /** The selected-winner candidate id(s) whose lineage path this edge lies on — lets the hover-trace
   *  isolate ONE winner's path (shared ancestors carry multiple ids). */
  winnerIds?: readonly string[];
}>;

/**
 * Derive an agenome's `bornBy` from the projection edges (NOT the kept/filtered set — a reproduction
 * edge's source may be a dropped/other node; we only key on its `target` + `type`): the FIRST incoming
 * reproduction edge whose `target === nodeId` classifies the agenome (fusion family → 'fusion';
 * `mutation_only` → 'mutation'); no such edge → 'seed' (a generation-0 / spawned-fresh organism).
 */
function bornByFor(
  nodeId: string,
  edges: LineageGraphProjection['edges'],
): 'seed' | 'fusion' | 'mutation' {
  for (const e of edges) {
    if (e.target !== nodeId) continue;
    if (FUSION_MODES.has(e.type)) return 'fusion';
    if (e.type === 'mutation_only') return 'mutation';
  }
  return 'seed';
}

/**
 * Map each WINNING-PATH edge id → the set of selected-winner candidate ids whose lineage it lies on. The
 * golden thread for a winner is: every provenance edge INTO it, PLUS the chain of reproduction
 * (mutation/fusion) edges up its producing agenome's ancestry to the seed. Walking PER winner (not as one
 * union) lets the hover-trace isolate a single winner's path; an edge on two winners' shared ancestry
 * carries both ids. Pure + terminating (a per-winner `visited` set handles fusion branching + cycles).
 */
function winningPathEdgeWinners(
  winnerCandidateIds: ReadonlySet<string>,
  edges: LineageGraphProjection['edges'],
): Map<string, Set<string>> {
  const byEdge = new Map<string, Set<string>>();
  const tag = (edgeId: string, winnerId: string): void => {
    const set = byEdge.get(edgeId) ?? new Set<string>();
    set.add(winnerId);
    byEdge.set(edgeId, set);
  };
  // child agenome id → its incoming reproduction edges (each from a parent agenome).
  const reproByChild = new Map<string, LineageGraphProjection['edges'][number][]>();
  for (const e of edges) {
    if (!isReproductionEdge(e.type)) continue;
    const list = reproByChild.get(e.target) ?? [];
    list.push(e);
    reproByChild.set(e.target, list);
  }
  for (const winnerId of winnerCandidateIds) {
    // Seed with the provenance edge(s) into THIS winner; queue its producing agenome(s).
    const queue: string[] = [];
    for (const e of edges) {
      if (e.target !== winnerId) continue;
      tag(e.id, winnerId);
      queue.push(e.source);
    }
    // Walk this winner's agenome ancestry up the reproduction edges to the seed.
    const visited = new Set<string>();
    while (queue.length > 0) {
      const agenome = queue.pop();
      if (agenome === undefined || visited.has(agenome)) continue;
      visited.add(agenome);
      for (const e of reproByChild.get(agenome) ?? []) {
        tag(e.id, winnerId);
        queue.push(e.source);
      }
    }
  }
  return byEdge;
}

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
  // The selected winner sits in its own lane to the RIGHT of the last generation (see layout). It KEEPS
  // its provenance edge — the gold connector from the agenome that produced it — so the final result
  // traces back into the lineage; that edge is anchored horizontally (winner is to the right, not below)
  // and styled gold (see the edge mapping below).
  const winnerIds = new Set(
    keptNodes.filter((n) => n.type === 'candidate' && n.status === 'selected').map((n) => n.id),
  );

  const nodes: LineageRfNode[] = keptNodes.map((n) => {
    const statusDomain = TYPE_TO_DOMAIN[n.type];
    const statusSpec = n.status !== undefined ? resolveStatus(statusDomain, n.status) : undefined;
    // Only AGENOME nodes carry `bornBy` (the operation that created the organism); other node types
    // (generation backbone / candidate / winner) leave it undefined.
    const bornBy = n.type === 'agenome' ? bornByFor(n.id, projection.edges) : undefined;
    return {
      id: n.id,
      type: rfTypeFor(n),
      position: { x: 0, y: 0 }, // assigned by the deterministic column-layout helper
      data: {
        label: n.label,
        nodeType: n.type,
        status: n.status,
        statusDomain,
        statusSpec,
        metrics: n.metrics,
        dataRef: n.dataRef,
        working: workingRefs.has(n.dataRef),
        generationIndex: n.generationIndex,
        bornBy,
      },
    };
  });

  // Drop dangling edges (a missing source/target endpoint) — React Flow throws on one (LESSONS §30).
  // Each surviving edge gets its per-type visual (stroke/dash/marker/animation) from `edgeStyleFor` so
  // reproduction edges (fusion violet · mutation dashed-amber) stand out from the plumbing backbone.
  // B5 declutter: NO per-edge text label (every edge previously printed its type — "fusion"/"generated"/
  // "spawned" — scattering text boxes across the graph; the legend + the per-type stroke/dash/marker
  // already convey type). Edges route as `smoothstep` (orthogonal) — straight diagonals turn this dense
  // per-generation DAG into a crossing hairball, whereas orthogonal segments hug the grid. The carried
  // `data.edgeType` still drives any downstream styling.
  // The whole winning lineage path (winner ← producing agenome ← … ← seed) is painted GOLD, so the user can
  // follow the entire thread that led to the winning idea — not just the final hop. Tagged per winner so a
  // hover can isolate one winner's path even when two winners share ancestors.
  const winnerPath = winningPathEdgeWinners(winnerIds, projection.edges);
  const edges: LineageRfEdge[] = projection.edges
    .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
    .map((e) => {
      const targetIsWinner = winnerIds.has(e.target);
      // Every edge ON a winning path gets the loud GOLD treatment + the `winner` flag (so the render
      // filter always draws it, even the otherwise-hidden provenance hop into the winner lane).
      const winnersForEdge = winnerPath.get(e.id);
      const onWinnerPath = winnersForEdge !== undefined;
      const visual = onWinnerPath ? WINNER_EDGE_VISUAL : edgeStyleFor(e.type);
      // The `generated` agenome→candidate link is a SHORT vertical drop (bottom→top anchors); breeding
      // events + the winner connector run horizontally (right→left anchors).
      const vertical = e.type === 'generated' && !targetIsWinner;
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: vertical ? 'sb' : 'sr',
        targetHandle: vertical ? 'tt' : 'tl',
        // The final hop into the winner's right-hand lane routes as a clean bezier; the rest of the path
        // (agenome→agenome breeding edges) keeps the orthogonal smoothstep that hugs the column grid.
        type: targetIsWinner ? 'default' : 'smoothstep',
        data: onWinnerPath
          ? { edgeType: e.type, winner: true, winnerIds: [...winnersForEdge] }
          : { edgeType: e.type },
        style: visual.style,
        ...(visual.markerEnd !== undefined ? { markerEnd: visual.markerEnd } : {}),
        ...(visual.animated !== undefined ? { animated: visual.animated } : {}),
      };
    });

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
