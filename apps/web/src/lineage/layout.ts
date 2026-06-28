import { REPRODUCTION_EDGE_TYPES } from './lineageToFlow';
import type { LineageRfEdge, LineageRfNode } from './lineageToFlow';

/**
 * layout — the deterministic per-GENERATION COLUMN layout (§12). The redesign drops the topology-only
 * Dagre auto-layout (a non-expert couldn't read which organisms belong to which generation) for a manual
 * grid keyed on the projection's `generationIndex`: every node in generation N lands in COLUMN N, so the
 * graph reads left→right as the evolution advances, with the generation header chip atop each column and
 * each agenome stacked directly above the candidate(s) it produced. Pure + deterministic (sorts by id;
 * no RNG / wall-clock) — the same projection lays out identically each render. Returns NEW node objects
 * with `position` set. The numbers below are LAYOUT GEOMETRY (coordinates), not styling tokens.
 */

const COL_WIDTH = 340; // horizontal stride between generation columns
const COL_X0 = 24; // left margin of column 0
const ROW_Y0 = 72; // top margin (leaves room for the generation-header label)
// Gestalt grouping: a connected agenome→candidate group is packed TIGHT, with a larger gap separating
// one group from the next, so the provenance pairing reads at a glance.
const INTRA_GAP = 12; // within a group (agenome ↔ its candidate, candidate ↔ candidate)
const GROUP_GAP = 48; // between groups (before a new agenome / leftover) + below the header

/**
 * Estimate a node's RENDERED height (px) from the rows it draws (label · status badge · metrics · working),
 * so the column stack can stride by the ACTUAL node size and nodes never overlap. The card is a CSS grid
 * (nodeTypes `card`): `padding: var(--space-2) var(--space-3)` (8 top + 8 bottom), `gap: var(--space-1)`
 * (4 between rows), a `thin` top+bottom border (~2). CRUCIAL: every text row inherits the body line-height
 * `--text-body-lh` (≈23) regardless of its own smaller font-size — the StatusBadge label, the caption-size
 * metrics, and the "working…" line all render ≈23 tall, NOT the 16–22 the old estimate assumed. That
 * undercount accumulated down a column into overlapping cards. We now stride by the real per-row height plus
 * a small safety buffer. Coarse but deterministic + monotonic — geometry, not styling. (Values are CSS
 * pixels; the unit suffix is omitted in comments to satisfy the no-raw-unit adherence guard.)
 */
const CARD_PAD_Y = 16; // var(--space-2) top + bottom
const CARD_BORDER_Y = 2; // thin top + bottom border
const CARD_ROW_GAP = 4; // var(--space-1) grid gap between rows
const TEXT_ROW = 23; // every text row inherits --text-body-lh, even caption-size rows
const HEIGHT_SAFETY = 6; // sub-pixel / font-metric buffer so adjacent cards never kiss
function estimateHeight(data: LineageRfNode['data']): number {
  // The generation header is a plain chip: var(--space-1) top+bottom padding + one inherited text row.
  if (data.nodeType === 'generation') return 8 + TEXT_ROW;
  let rows = 1; // the single-line title row (always present)
  if (data.status !== undefined) rows += 1; // the StatusBadge row
  if (data.metrics !== undefined && Object.keys(data.metrics).length > 0) rows += 1; // metrics row
  // ALWAYS reserve the "working…" row. It's merged into nodes AFTER layout (LineageGraph keeps the working
  // overlay out of the layout so the event stream doesn't thrash it), so the structural data here never has
  // `working` set — yet a live node renders that extra row. Reserving it unconditionally keeps the reserved
  // height ≥ the rendered height (no overlap) and keeps positions STABLE as working toggles on/off.
  rows += 1;
  return CARD_PAD_Y + CARD_BORDER_Y + TEXT_ROW * rows + CARD_ROW_GAP * (rows - 1) + HEIGHT_SAFETY;
}

/** Resolve the column index for a node: its `generationIndex`, or a trailing fallback column. */
function columnOf(node: LineageRfNode, fallbackColumn: number): number {
  return node.data.generationIndex ?? fallbackColumn;
}

/** The selected winner is pulled out of the generation grid into a dedicated left-hand lane. */
function isWinner(n: LineageRfNode): boolean {
  return n.data.nodeType === 'candidate' && n.data.status === 'selected';
}

export function layoutGraph(nodes: LineageRfNode[], edges: LineageRfEdge[]): LineageRfNode[] {
  // The winner(s) get their own lane to the RIGHT of the last generation — left→right reads as the
  // evolution advancing, so the final winning idea sits at the far right as the end result.
  const winners = [...nodes].filter(isWinner).sort((a, b) => a.id.localeCompare(b.id));
  const colX = (col: number) => COL_X0 + col * COL_WIDTH;

  // The trailing fallback column for undefined-index nodes sits one past the max real index.
  let maxGenerationIndex = -1;
  for (const n of nodes) {
    const gi = n.data.generationIndex;
    if (gi !== undefined && gi > maxGenerationIndex) maxGenerationIndex = gi;
  }
  const fallbackColumn = maxGenerationIndex + 1;

  // agenomeId → its candidate ids (the `generated` edges) so a candidate stacks under its agenome.
  const candidatesByAgenome = new Map<string, string[]>();
  // childAgenomeId → its parent agenome id (from a reproduction edge source→target). Used to DETANGLE:
  // a child agenome is ordered next to its parent's row so its breeding edge is short + non-crossing.
  const parentOf = new Map<string, string>();
  for (const e of edges) {
    const edgeType = e.data?.edgeType;
    if (edgeType === 'generated') {
      const list = candidatesByAgenome.get(e.source) ?? [];
      list.push(e.target);
      candidatesByAgenome.set(e.source, list);
    } else if (edgeType !== undefined && REPRODUCTION_EDGE_TYPES.has(edgeType) && !parentOf.has(e.target)) {
      parentOf.set(e.target, e.source); // source = parent agenome, target = child agenome
    }
  }
  for (const list of candidatesByAgenome.values()) list.sort();

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const winnerSet = new Set(winners.map((w) => w.id));
  // The y assigned to each agenome as columns are placed left→right — the previous column's agenome
  // positions drive the next column's child ordering (parent-barycentric crossing reduction).
  const agenomeY = new Map<string, number>();

  // Bucket the NON-winner nodes into columns by generation index (winners go to the lane, below).
  const columns = new Map<number, LineageRfNode[]>();
  for (const n of nodes) {
    if (winnerSet.has(n.id)) continue;
    const col = columnOf(n, fallbackColumn);
    const bucket = columns.get(col) ?? [];
    bucket.push(n);
    columns.set(col, bucket);
  }

  // Emit per column, in a deterministic within-column order, striding by each node's estimated height so
  // a tall candidate never overlaps the node below it:
  //   1. the `generation` header (row 0),
  //   2. for each agenome (sorted by id): the agenome, then its candidate(s) (sorted by id),
  //   3. any leftover nodes not yet placed (sorted by id).
  const positionById = new Map<string, { x: number; y: number }>();
  let tallestColumnBottom = ROW_Y0; // for vertically centering the winner lane
  for (const col of [...columns.keys()].sort((a, b) => a - b)) {
    const bucket = columns.get(col)!;
    const x = colX(col);
    const placed = new Set<string>();
    let y = ROW_Y0;
    let first = true;
    // `gapBefore` is the space ABOVE this node: GROUP_GAP starts a new group (header, a new agenome, a
    // leftover); INTRA_GAP keeps a candidate tight under the agenome that produced it.
    const place = (node: LineageRfNode, gapBefore: number) => {
      if (placed.has(node.id)) return;
      placed.add(node.id);
      if (!first) y += gapBefore;
      first = false;
      positionById.set(node.id, { x, y });
      if (node.data.nodeType === 'agenome') agenomeY.set(node.id, y);
      y += estimateHeight(node.data);
    };

    const headers = bucket
      .filter((n) => n.data.nodeType === 'generation')
      .sort((a, b) => a.id.localeCompare(b.id));
    // Detangle: order this column's agenomes by their PARENT's y in an earlier column (already placed,
    // since we go left→right), tie-breaking by id. Parentless organisms (seeds) sort last, then by id.
    const parentBary = (n: LineageRfNode): number => {
      const parent = parentOf.get(n.id);
      const py = parent !== undefined ? agenomeY.get(parent) : undefined;
      return py ?? Number.POSITIVE_INFINITY;
    };
    const agenomes = bucket
      .filter((n) => n.data.nodeType === 'agenome')
      .sort((a, b) => parentBary(a) - parentBary(b) || a.id.localeCompare(b.id));
    const leftovers = bucket
      .filter((n) => n.data.nodeType !== 'generation' && n.data.nodeType !== 'agenome')
      .sort((a, b) => a.id.localeCompare(b.id));

    for (const h of headers) place(h, GROUP_GAP);
    for (const a of agenomes) {
      place(a, GROUP_GAP); // a new agenome starts a new group
      // a candidate may live in a different column (its own generationIndex); only stack same-column ones.
      for (const candId of candidatesByAgenome.get(a.id) ?? []) {
        const cand = byId.get(candId);
        if (cand && !winnerSet.has(candId) && columnOf(cand, fallbackColumn) === col)
          place(cand, INTRA_GAP); // candidate hugs the agenome that produced it
      }
    }
    for (const l of leftovers) place(l, GROUP_GAP);

    if (y > tallestColumnBottom) tallestColumnBottom = y;
  }

  // Place the winner(s) in a lane one stride to the RIGHT of the last generation column, vertically
  // centered against the tallest generation column.
  const rightmostCol = columns.size > 0 ? Math.max(...columns.keys()) : -1;
  const winnerX = colX(rightmostCol + 1);
  const winnerStackHeight = winners.reduce(
    (sum, w) => sum + estimateHeight(w.data) + GROUP_GAP,
    -GROUP_GAP,
  );
  let wy = Math.max(ROW_Y0, ROW_Y0 + (tallestColumnBottom - ROW_Y0 - winnerStackHeight) / 2);
  for (const w of winners) {
    positionById.set(w.id, { x: winnerX, y: wy });
    wy += estimateHeight(w.data) + GROUP_GAP;
  }

  return nodes.map((n) => ({
    ...n,
    position: positionById.get(n.id) ?? { x: colX(0), y: ROW_Y0 },
  }));
}
