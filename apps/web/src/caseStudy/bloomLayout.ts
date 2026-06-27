import type { BloomRfNode } from './caseStudyToFlow';

/**
 * layoutBloom — the deterministic tiered tree layout for the Islands bloom (mirrors the knowledge column
 * layout, §12). Three tiers grow left→right: the case-study ROOT (column 0), the RUN hubs (column 1), and the
 * DOPPEL petals (column 2). Each run owns a vertical BLOCK sized to its doppels; the run hub is centred in its
 * block and its doppels stack beside it, so the tree branches and blooms outward. The root is centred over all
 * the run blocks. Pure + deterministic (sorts by id; no RNG / wall-clock) — the same graph lays out
 * identically. The numbers are LAYOUT GEOMETRY (coordinates), not styling tokens.
 */

const COL_WIDTH = 380; // horizontal stride between tiers (root → runs → doppels)
const ROW_HEIGHT = 108; // vertical stride between stacked nodes
const X0 = 40; // left margin (root column)
const Y0 = 40; // top margin

export function layoutBloom(nodes: BloomRfNode[]): BloomRfNode[] {
  const root = nodes.find((n) => n.data.tier === 0);
  const runs = nodes
    .filter((n) => n.data.tier === 1)
    .sort((a, b) => (a.data.runRow ?? 0) - (b.data.runRow ?? 0) || a.id.localeCompare(b.id));

  const doppelsByRun = new Map<string, BloomRfNode[]>();
  for (const n of nodes) {
    if (n.data.tier === 2 && n.data.parentRunId !== undefined) {
      const list = doppelsByRun.get(n.data.parentRunId) ?? [];
      list.push(n);
      doppelsByRun.set(n.data.parentRunId, list);
    }
  }
  for (const list of doppelsByRun.values()) list.sort((a, b) => a.id.localeCompare(b.id));

  const positionById = new Map<string, { x: number; y: number }>();
  const runCenters: number[] = [];
  let cursorY = Y0;
  for (const run of runs) {
    const doppels = doppelsByRun.get(run.id) ?? [];
    const blockRows = Math.max(1, doppels.length);
    const blockTop = cursorY;
    const blockCenter = blockTop + ((blockRows - 1) * ROW_HEIGHT) / 2;
    positionById.set(run.id, { x: X0 + COL_WIDTH, y: blockCenter });
    runCenters.push(blockCenter);
    doppels.forEach((d, i) => {
      positionById.set(d.id, { x: X0 + 2 * COL_WIDTH, y: blockTop + i * ROW_HEIGHT });
    });
    cursorY = blockTop + blockRows * ROW_HEIGHT;
  }

  if (root !== undefined) {
    const rootY =
      runCenters.length > 0 ? (runCenters[0]! + runCenters[runCenters.length - 1]!) / 2 : Y0;
    positionById.set(root.id, { x: X0, y: rootY });
  }

  return nodes.map((n) => ({ ...n, position: positionById.get(n.id) ?? { x: X0, y: Y0 } }));
}
