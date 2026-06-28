import { describe, expect, it } from 'vitest';
import type { LineageGraphProjection } from '@doppl/contracts';
import { lineageToFlow } from '../../../src/lineage/lineageToFlow';
import { layoutGraph } from '../../../src/lineage/layout';
import { multiNodeLineage } from '../../fixtures/lineage';

/** A two-generation projection: gen0 {header,agenome,candidate}, gen1 {header,agenome,candidate}. */
function twoGenProjection(): LineageGraphProjection {
  return {
    runId: 'run_1',
    nodes: [
      { id: 'g0', type: 'generation', label: 'Gen 0', dataRef: 'gen_0', generationIndex: 0 },
      {
        id: 'a0',
        type: 'agenome',
        label: 'A0',
        status: 'active',
        dataRef: 'agn_0',
        generationIndex: 0,
      },
      {
        id: 'c0',
        type: 'candidate',
        label: 'C0',
        status: 'scored',
        dataRef: 'cand_0',
        generationIndex: 0,
      },
      { id: 'g1', type: 'generation', label: 'Gen 1', dataRef: 'gen_1', generationIndex: 1 },
      {
        id: 'a1',
        type: 'agenome',
        label: 'A1',
        status: 'active',
        dataRef: 'agn_1',
        generationIndex: 1,
      },
      {
        id: 'c1',
        type: 'candidate',
        label: 'C1',
        status: 'scored',
        dataRef: 'cand_1',
        generationIndex: 1,
      },
    ],
    edges: [
      { id: 'e-sp0', source: 'g0', target: 'a0', type: 'spawned' },
      { id: 'e-gen0', source: 'a0', target: 'c0', type: 'generated' },
      { id: 'e-sp1', source: 'g1', target: 'a1', type: 'spawned' },
      { id: 'e-gen1', source: 'a1', target: 'c1', type: 'generated' },
      { id: 'e-rep', source: 'a0', target: 'a1', type: 'mutation_only' },
    ],
    sequenceThrough: 30,
  };
}

describe('layout — deterministic per-generation COLUMN positions', () => {
  // spec(§12): the same projection lays out the same way each render (no coordinates in the projection
  // → deterministic manual grid keyed on generationIndex; no RNG/wall-clock).
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

  // spec(§12 columns): nodes bucket into COLUMNS by generationIndex — a higher generation sits at a
  // greater x; nodes that share a generationIndex share a column x (and stack vertically).
  it('test_layout_buckets_into_columns_by_generation', () => {
    const flow = lineageToFlow(twoGenProjection());
    const positioned = layoutGraph(flow.nodes, flow.edges);
    const x = Object.fromEntries(positioned.map((n) => [n.id, n.position.x]));
    // column x increases with generationIndex.
    expect(x.g1!).toBeGreaterThan(x.g0!);
    // same-generation nodes share a column x.
    expect(x.a0!).toBe(x.g0!);
    expect(x.c0!).toBe(x.g0!);
    expect(x.a1!).toBe(x.g1!);
    expect(x.c1!).toBe(x.g1!);
  });

  // spec(§12 within-column order): the generation header sits at the top of its column (row 0), with
  // its agenome stacked directly above the candidate it produced (smaller y = higher).
  it('test_layout_stacks_header_agenome_candidate', () => {
    const flow = lineageToFlow(twoGenProjection());
    const positioned = layoutGraph(flow.nodes, flow.edges);
    const y = Object.fromEntries(positioned.map((n) => [n.id, n.position.y]));
    expect(y.g0!).toBeLessThan(y.a0!); // header above its agenome
    expect(y.a0!).toBeLessThan(y.c0!); // agenome directly above its produced candidate
  });

  // spec(§12 winner callout): a selected winner is pulled OUT of the generation grid into a dedicated lane
  // to the RIGHT of the last generation, so left→right reads as the evolution ending in the winning idea.
  it('test_layout_pulls_winner_into_right_lane', () => {
    const proj: LineageGraphProjection = {
      runId: 'run_1',
      nodes: [
        { id: 'g0', type: 'generation', label: 'Gen 0', dataRef: 'gen_0', generationIndex: 0 },
        {
          id: 'a0',
          type: 'agenome',
          label: 'A0',
          status: 'active',
          dataRef: 'agn_0',
          generationIndex: 0,
        },
        {
          id: 'win',
          type: 'candidate',
          label: 'Winner',
          status: 'selected',
          dataRef: 'cand_w',
          generationIndex: 0,
        },
      ],
      edges: [
        { id: 'sp', source: 'g0', target: 'a0', type: 'spawned' },
        { id: 'gen', source: 'a0', target: 'win', type: 'generated' },
      ],
      sequenceThrough: 5,
    };
    const flow = lineageToFlow(proj);
    const positioned = layoutGraph(flow.nodes, flow.edges);
    const x = Object.fromEntries(positioned.map((n) => [n.id, n.position.x]));
    expect(x.win!).toBeGreaterThan(x.g0!); // winner sits to the right of generation 0 (the last/only gen)
    expect(x.g0!).toBe(x.a0!); // the generation header shares its column x (no left shift)
  });

  // spec(§12 grouping): a candidate is packed TIGHT under the agenome that produced it (INTRA gap), while
  // the NEXT agenome starts a new group with a larger gap — so the provenance pairing reads at a glance.
  // With equal-height nodes, the agenome→candidate distance is strictly less than candidate→next-agenome.
  it('test_layout_groups_agenome_with_its_candidate', () => {
    const proj: LineageGraphProjection = {
      runId: 'run_1',
      nodes: [
        { id: 'g0', type: 'generation', label: 'Gen 0', dataRef: 'gen_0', generationIndex: 0 },
        { id: 'a0', type: 'agenome', label: 'A0', status: 'active', dataRef: 'agn_0', generationIndex: 0 },
        { id: 'c0', type: 'candidate', label: 'C0', status: 'created', dataRef: 'cand_0', generationIndex: 0 },
        { id: 'a1', type: 'agenome', label: 'A1', status: 'active', dataRef: 'agn_1', generationIndex: 0 },
      ],
      edges: [{ id: 'gen', source: 'a0', target: 'c0', type: 'generated' }],
      sequenceThrough: 4,
    };
    const flow = lineageToFlow(proj);
    const positioned = layoutGraph(flow.nodes, flow.edges);
    const y = Object.fromEntries(positioned.map((n) => [n.id, n.position.y]));
    expect(y.a0!).toBeLessThan(y.c0!);
    expect(y.c0!).toBeLessThan(y.a1!);
    expect(y.c0! - y.a0!).toBeLessThan(y.a1! - y.c0!); // within-group gap < between-group gap
  });

  // spec(§12 detangle): a column's agenomes are ordered by their PARENT's row in the previous column
  // (parent-barycentric crossing reduction), so a child sits beside its parent and its breeding edge is
  // short + non-crossing — NOT the naive id order (which would cross the two reproduction edges below).
  it('test_layout_orders_children_under_their_parents', () => {
    const proj: LineageGraphProjection = {
      runId: 'run_1',
      nodes: [
        { id: 'g0', type: 'generation', label: 'Gen 0', dataRef: 'gen_0', generationIndex: 0 },
        { id: 'a0', type: 'agenome', label: 'A0', status: 'active', dataRef: 'agn_0', generationIndex: 0 },
        { id: 'a1', type: 'agenome', label: 'A1', status: 'active', dataRef: 'agn_1', generationIndex: 0 },
        { id: 'g1', type: 'generation', label: 'Gen 1', dataRef: 'gen_1', generationIndex: 1 },
        // b0 (id-first) is the child of the LOWER parent a1; b1 is the child of the UPPER parent a0.
        { id: 'b0', type: 'agenome', label: 'B0', status: 'active', dataRef: 'agn_b0', generationIndex: 1 },
        { id: 'b1', type: 'agenome', label: 'B1', status: 'active', dataRef: 'agn_b1', generationIndex: 1 },
      ],
      edges: [
        { id: 'm-top', source: 'a0', target: 'b1', type: 'mutation_only' },
        { id: 'm-bot', source: 'a1', target: 'b0', type: 'mutation_only' },
      ],
      sequenceThrough: 9,
    };
    const flow = lineageToFlow(proj);
    const positioned = layoutGraph(flow.nodes, flow.edges);
    const y = Object.fromEntries(positioned.map((n) => [n.id, n.position.y]));
    expect(y.a0!).toBeLessThan(y.a1!); // gen0: a0 above a1 (id order, no parents)
    // gen1 follows parent order, NOT id order: b1 (child of the upper a0) sits above b0 (child of a1).
    expect(y.b1!).toBeLessThan(y.b0!);
  });

  // spec(§12): a node with no generationIndex falls into a trailing fallback column (one past the max).
  it('test_layout_undefined_index_goes_to_trailing_column', () => {
    const proj = twoGenProjection();
    const withOrphan: LineageGraphProjection = {
      ...proj,
      nodes: [
        ...proj.nodes,
        { id: 'orphan', type: 'candidate', label: 'Orphan', status: 'created', dataRef: 'cand_x' },
      ],
    };
    const flow = lineageToFlow(withOrphan);
    const positioned = layoutGraph(flow.nodes, flow.edges);
    const x = Object.fromEntries(positioned.map((n) => [n.id, n.position.x]));
    expect(x.orphan!).toBeGreaterThan(x.g1!); // trailing fallback column, past the max real index
  });
});
