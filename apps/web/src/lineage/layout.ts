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
const ROW_HEIGHT = 132; // vertical stride between stacked nodes in a column
const COL_X0 = 24; // left margin of column 0
const ROW_Y0 = 72; // top margin (leaves room for the generation-header chip)

/** Resolve the column index for a node: its `generationIndex`, or a trailing fallback column. */
function columnOf(node: LineageRfNode, fallbackColumn: number): number {
  return node.data.generationIndex ?? fallbackColumn;
}

export function layoutGraph(nodes: LineageRfNode[], edges: LineageRfEdge[]): LineageRfNode[] {
  // The trailing fallback column for undefined-index nodes sits one past the max real index.
  let maxGenerationIndex = -1;
  for (const n of nodes) {
    const gi = n.data.generationIndex;
    if (gi !== undefined && gi > maxGenerationIndex) maxGenerationIndex = gi;
  }
  const fallbackColumn = maxGenerationIndex + 1;

  // agenomeId → its candidate ids (the `generated` edges) so a candidate stacks under its agenome.
  const candidatesByAgenome = new Map<string, string[]>();
  for (const e of edges) {
    if (e.data?.edgeType !== 'generated') continue;
    const list = candidatesByAgenome.get(e.source) ?? [];
    list.push(e.target);
    candidatesByAgenome.set(e.source, list);
  }
  for (const list of candidatesByAgenome.values()) list.sort();

  const byId = new Map(nodes.map((n) => [n.id, n]));

  // Bucket nodes into columns by generation index.
  const columns = new Map<number, LineageRfNode[]>();
  for (const n of nodes) {
    const col = columnOf(n, fallbackColumn);
    const bucket = columns.get(col) ?? [];
    bucket.push(n);
    columns.set(col, bucket);
  }

  // Emit per column, in a deterministic within-column order:
  //   1. the `generation` header node (row 0),
  //   2. for each agenome (sorted by id): the agenome, then its candidate(s) (sorted by id),
  //   3. any leftover nodes not yet placed (sorted by id).
  const positionById = new Map<string, { x: number; y: number }>();
  for (const [col, bucket] of columns) {
    const x = COL_X0 + col * COL_WIDTH;
    const placed = new Set<string>();
    let row = 0;
    const place = (id: string) => {
      if (placed.has(id)) return;
      placed.add(id);
      positionById.set(id, { x, y: ROW_Y0 + row * ROW_HEIGHT });
      row += 1;
    };

    const headers = bucket
      .filter((n) => n.data.nodeType === 'generation')
      .sort((a, b) => a.id.localeCompare(b.id));
    const agenomes = bucket
      .filter((n) => n.data.nodeType === 'agenome')
      .sort((a, b) => a.id.localeCompare(b.id));
    const leftovers = bucket
      .filter((n) => n.data.nodeType !== 'generation' && n.data.nodeType !== 'agenome')
      .sort((a, b) => a.id.localeCompare(b.id));

    for (const h of headers) place(h.id);
    for (const a of agenomes) {
      place(a.id);
      // a candidate may live in a different column (its own generationIndex); only stack same-column ones.
      for (const candId of candidatesByAgenome.get(a.id) ?? []) {
        const cand = byId.get(candId);
        if (cand && columnOf(cand, fallbackColumn) === col) place(candId);
      }
    }
    for (const l of leftovers) place(l.id);
  }

  return nodes.map((n) => ({
    ...n,
    position: positionById.get(n.id) ?? { x: COL_X0, y: ROW_Y0 },
  }));
}
