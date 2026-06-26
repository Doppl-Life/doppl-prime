import { describe, expect, test } from "vitest";
import { layoutGraph } from "../layout.js";

const TWO_NODES = [
  { id: "a", type: "agenome" },
  { id: "b", type: "candidate" },
];

const TWO_EDGES = [{ id: "a__b", source: "a", target: "b" }];

describe("layoutGraph", () => {
  test("returns positions for every node", () => {
    const out = layoutGraph(TWO_NODES, TWO_EDGES);
    expect(out.nodes).toHaveLength(2);
    for (const node of out.nodes) {
      expect(node.position.x).toBeGreaterThanOrEqual(0);
      expect(node.position.y).toBeGreaterThanOrEqual(0);
      expect(Number.isNaN(node.position.x)).toBe(false);
      expect(Number.isNaN(node.position.y)).toBe(false);
    }
  });

  test("is deterministic: same input → same output", () => {
    const a = layoutGraph(TWO_NODES, TWO_EDGES);
    const b = layoutGraph(TWO_NODES, TWO_EDGES);
    for (let i = 0; i < a.nodes.length; i += 1) {
      expect(a.nodes[i]?.position).toEqual(b.nodes[i]?.position);
    }
  });

  test("LR layout: target node ends to the right of source", () => {
    const out = layoutGraph(TWO_NODES, TWO_EDGES, { rankdir: "LR" });
    const a = out.nodes.find((n) => n.id === "a");
    const b = out.nodes.find((n) => n.id === "b");
    if (!a || !b) throw new Error("expected both nodes");
    expect(b.position.x).toBeGreaterThan(a.position.x);
  });

  test("empty input → empty output without throwing", () => {
    const out = layoutGraph([], []);
    expect(out.nodes).toEqual([]);
    expect(out.edges).toEqual([]);
  });

  test("custom widths/heights are preserved in the output", () => {
    const out = layoutGraph([{ id: "x", type: "agenome", width: 300, height: 100 }], []);
    expect(out.nodes[0]?.width).toBe(300);
    expect(out.nodes[0]?.height).toBe(100);
  });

  test("nodes pass through unchanged for type field", () => {
    const out = layoutGraph(TWO_NODES, TWO_EDGES);
    expect(out.nodes.map((n) => n.type).sort()).toEqual(["agenome", "candidate"]);
  });
});
