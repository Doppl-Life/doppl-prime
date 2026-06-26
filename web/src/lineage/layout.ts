import dagre from "@dagrejs/dagre";

/**
 * Dagre layout helper (P7.7, D3). Pure function: given the same
 * (nodes, edges) input it returns the same (x, y) positions byte-
 * stable. Matches the "same projection lays out the same way each
 * render" invariant.
 *
 * Lays out left-to-right by default so generations read as columns.
 */

export interface RawNode {
  id: string;
  type: string;
  width?: number;
  height?: number;
}

export interface RawEdge {
  id: string;
  source: string;
  target: string;
}

export interface PositionedNode extends RawNode {
  position: { x: number; y: number };
  width: number;
  height: number;
}

export interface LayoutGraphResult {
  nodes: PositionedNode[];
  edges: RawEdge[];
}

export interface LayoutOptions {
  rankdir?: "LR" | "TB" | "RL" | "BT";
  nodesep?: number;
  ranksep?: number;
  defaultWidth?: number;
  defaultHeight?: number;
}

export function layoutGraph(
  nodes: readonly RawNode[],
  edges: readonly RawEdge[],
  options: LayoutOptions = {},
): LayoutGraphResult {
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: options.rankdir ?? "LR",
    nodesep: options.nodesep ?? 24,
    ranksep: options.ranksep ?? 80,
  });
  g.setDefaultEdgeLabel(() => ({}));

  const defaultWidth = options.defaultWidth ?? 180;
  const defaultHeight = options.defaultHeight ?? 60;

  for (const node of nodes) {
    const width = node.width ?? defaultWidth;
    const height = node.height ?? defaultHeight;
    g.setNode(node.id, { width, height });
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  const positioned: PositionedNode[] = [];
  for (const node of nodes) {
    const dn = g.node(node.id);
    const width = node.width ?? defaultWidth;
    const height = node.height ?? defaultHeight;
    if (!dn) {
      positioned.push({
        ...node,
        position: { x: 0, y: 0 },
        width,
        height,
      });
      continue;
    }
    positioned.push({
      ...node,
      // Dagre returns center coordinates; React Flow expects top-left.
      position: { x: dn.x - width / 2, y: dn.y - height / 2 },
      width,
      height,
    });
  }
  return { nodes: positioned, edges: [...edges] };
}
