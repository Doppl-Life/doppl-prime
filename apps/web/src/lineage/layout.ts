import { graphlib, layout as dagreLayout } from '@dagrejs/dagre';
import type { LineageRfEdge, LineageRfNode } from './lineageToFlow';

/**
 * layout — the deterministic Dagre LR layout helper. Assigns generational-tier positions (left→right)
 * when the projection carries no coordinates; Dagre is deterministic (network-simplex ranking, no RNG
 * / wall-clock), so the SAME projection lays out identically each render (§12). Returns NEW node
 * objects with `position` set (top-left corner — Dagre returns center coords). The numeric node
 * dimensions below are LAYOUT GEOMETRY (Dagre inputs), not styling tokens.
 */

const NODE_WIDTH = 180;
const NODE_HEIGHT = 72;
const WINNER_WIDTH = 200;
const WINNER_HEIGHT = 88;

export function layoutGraph(nodes: LineageRfNode[], edges: LineageRfEdge[]): LineageRfNode[] {
  const g = new graphlib.Graph();
  // LR = generational tiers flow left→right; spacing keeps tiers legible on a projector.
  g.setGraph({ rankdir: 'LR', nodesep: 32, ranksep: 72, marginx: 16, marginy: 16 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const n of nodes) {
    const winner = n.type === 'selectedWinner';
    g.setNode(n.id, {
      width: winner ? WINNER_WIDTH : NODE_WIDTH,
      height: winner ? WINNER_HEIGHT : NODE_HEIGHT,
    });
  }
  for (const e of edges) g.setEdge(e.source, e.target);

  dagreLayout(g);

  return nodes.map((n) => {
    const { x, y, width, height } = g.node(n.id);
    // Dagre reports node CENTER; React Flow positions the top-left corner.
    return { ...n, position: { x: x - width / 2, y: y - height / 2 } };
  });
}
