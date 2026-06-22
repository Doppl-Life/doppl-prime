import { describe, expect, it } from 'vitest';
import { lineageToFlow } from '../../../src/lineage/lineageToFlow';
import { layoutGraph } from '../../../src/lineage/layout';
import { multiNodeLineage } from '../../fixtures/lineage';

describe('layout — deterministic Dagre LR positions', () => {
  // spec(§12): the same projection lays out the same way each render (no coordinates in the
  // projection → deterministic Dagre LR; no RNG/wall-clock).
  it('test_layout_is_deterministic', () => {
    const flow = lineageToFlow(multiNodeLineage);
    const a = layoutGraph(flow.nodes, flow.edges).map((n) => ({ id: n.id, position: n.position }));
    // a fresh mapping + layout of the same projection yields byte-identical positions.
    const flow2 = lineageToFlow(multiNodeLineage);
    const b = layoutGraph(flow2.nodes, flow2.edges).map((n) => ({
      id: n.id,
      position: n.position,
    }));
    expect(b).toEqual(a);
    // every node has a finite assigned position (no NaN / undefined).
    for (const n of a) {
      expect(Number.isFinite(n.position.x)).toBe(true);
      expect(Number.isFinite(n.position.y)).toBe(true);
    }
  });

  // spec(§12 LR tiers): generational tiers flow left→right — a downstream node sits at a greater x
  // than its upstream parent (g0 → a0 → c0).
  it('test_layout_flows_left_to_right', () => {
    const flow = lineageToFlow(multiNodeLineage);
    const positioned = layoutGraph(flow.nodes, flow.edges);
    const x = Object.fromEntries(positioned.map((n) => [n.id, n.position.x]));
    expect(x.a0!).toBeGreaterThan(x.g0!); // spawned child is to the right of the generation backbone
    expect(x.c0!).toBeGreaterThan(x.a0!); // produced candidate is to the right of its agenome
  });
});
