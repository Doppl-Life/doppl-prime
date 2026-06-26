import type { KnowledgeRfEdge, KnowledgeRfNode } from './knowledgeToFlow';

/**
 * layout — the deterministic per-GENERATION COLUMN layout for the knowledge graph (mirrors the lineage
 * `layoutGraph`, §12). Every node in generation N lands in COLUMN N, so the graph reads left→right as the
 * swarm's knowledge accretes generation over generation: the generation header chip atop each column, then
 * each agenome hub with the research notes it produced stacked directly beneath it. Pure + deterministic
 * (sorts by id; no RNG / wall-clock) — the same projection lays out identically. The numbers are LAYOUT
 * GEOMETRY (coordinates), not styling tokens.
 */

const COL_WIDTH = 320; // horizontal stride between generation columns
const ROW_HEIGHT = 116; // vertical stride between stacked nodes in a column
const COL_X0 = 24; // left margin of column 0
const ROW_Y0 = 64; // top margin (room for the generation-header chip)

function columnOf(node: KnowledgeRfNode, fallbackColumn: number): number {
  return node.data.generationIndex ?? fallbackColumn;
}

export function layoutKnowledge(
  nodes: KnowledgeRfNode[],
  edges: KnowledgeRfEdge[],
): KnowledgeRfNode[] {
  let maxGenerationIndex = -1;
  for (const n of nodes) {
    const gi = n.data.generationIndex;
    if (gi !== undefined && gi > maxGenerationIndex) maxGenerationIndex = gi;
  }
  const fallbackColumn = maxGenerationIndex + 1;

  // agenomeId → its note ids (the `researched` edges) so a note stacks under the agenome that produced it.
  const notesByAgenome = new Map<string, string[]>();
  for (const e of edges) {
    if (e.data?.edgeType !== 'researched') continue;
    const list = notesByAgenome.get(e.source) ?? [];
    list.push(e.target);
    notesByAgenome.set(e.source, list);
  }
  for (const list of notesByAgenome.values()) list.sort();

  const byId = new Map(nodes.map((n) => [n.id, n]));

  const columns = new Map<number, KnowledgeRfNode[]>();
  for (const n of nodes) {
    const col = columnOf(n, fallbackColumn);
    const bucket = columns.get(col) ?? [];
    bucket.push(n);
    columns.set(col, bucket);
  }

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
      .filter((n) => n.data.kind === 'generation')
      .sort((a, b) => a.id.localeCompare(b.id));
    const agenomes = bucket
      .filter((n) => n.data.kind === 'agenome')
      .sort((a, b) => a.id.localeCompare(b.id));
    const leftovers = bucket
      .filter((n) => n.data.kind !== 'generation' && n.data.kind !== 'agenome')
      .sort((a, b) => a.id.localeCompare(b.id));

    for (const h of headers) place(h.id);
    for (const a of agenomes) {
      place(a.id);
      for (const noteId of notesByAgenome.get(a.id) ?? []) {
        const note = byId.get(noteId);
        if (note && columnOf(note, fallbackColumn) === col) place(noteId);
      }
    }
    for (const l of leftovers) place(l.id);
  }

  return nodes.map((n) => ({
    ...n,
    position: positionById.get(n.id) ?? { x: COL_X0, y: ROW_Y0 },
  }));
}
