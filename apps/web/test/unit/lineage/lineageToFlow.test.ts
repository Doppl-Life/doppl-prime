import { describe, expect, it } from 'vitest';
import type { LineageGraphProjection } from '@doppl/contracts';
import { lineageToFlow, pickFreshestProjection } from '../../../src/lineage/lineageToFlow';
import type { LineageRfNode } from '../../../src/lineage/lineageToFlow';

/** A projection exercising all 6 LineageNodeType + a selected-winner candidate + dangling edges. */
function fullProjection(overrides: Partial<LineageGraphProjection> = {}): LineageGraphProjection {
  return {
    runId: 'run_1',
    nodes: [
      { id: 'g0', type: 'generation', label: 'Gen 0', dataRef: 'gen_0' },
      { id: 'a0', type: 'agenome', label: 'A0', status: 'active', dataRef: 'agn_0' },
      {
        id: 'c0',
        type: 'candidate',
        label: 'C0',
        status: 'scored',
        metrics: { fitness: 0.8 },
        dataRef: 'cand_0',
      },
      { id: 'cr0', type: 'critic', label: 'Critic', status: 'passed', dataRef: 'crev_0' },
      { id: 'ck0', type: 'check', label: 'Check', status: 'passed', dataRef: 'chk_0' },
      { id: 'sc0', type: 'score', label: 'Fit 0.80', metrics: { total: 0.8 }, dataRef: 'fit_0' },
      { id: 'w0', type: 'candidate', label: 'Winner', status: 'selected', dataRef: 'cand_win' },
    ],
    edges: [
      { id: 'e1', source: 'g0', target: 'a0', type: 'spawned' },
      { id: 'e2', source: 'a0', target: 'c0', type: 'produced' },
    ],
    sequenceThrough: 30,
    ...overrides,
  };
}

const byId = (nodes: LineageRfNode[]) => Object.fromEntries(nodes.map((n) => [n.id, n]));

describe('lineageToFlow — pure LineageGraphProjection → React Flow mapping', () => {
  // spec(§10/§12): the closed 6 LineageNodeType map to the 5 rendered types — critic+check merge to
  // criticCheck; candidate+status:'selected' → selectedWinner; generation = backbone; each node
  // carries its accessible status spec + dataRef link target.
  it('test_lineageToFlow_maps_six_types_to_five', () => {
    const { nodes, edges } = lineageToFlow(fullProjection());
    const n = byId(nodes);
    expect(n.g0!.type).toBe('generation'); // backbone
    expect(n.a0!.type).toBe('agenome');
    expect(n.c0!.type).toBe('candidate');
    expect(n.cr0!.type).toBe('criticCheck'); // critic + check collapse...
    expect(n.ck0!.type).toBe('criticCheck'); // ...to one rendered type
    expect(n.sc0!.type).toBe('score');
    expect(n.w0!.type).toBe('selectedWinner'); // candidate + status:'selected'

    // accessible status spec resolved (shape+label+icon) when status present; absent otherwise.
    expect(n.a0!.data.statusSpec?.label).toBe('active');
    expect(n.a0!.data.statusSpec?.glyph).toBeTruthy();
    expect(n.g0!.data.statusSpec).toBeUndefined();
    // dataRef preserved as the inspector/evidence link target; metrics passed through.
    expect(n.a0!.data.dataRef).toBe('agn_0');
    expect(n.sc0!.data.metrics?.total).toBe(0.8);
    // edges keep the projection's relation type for legibility (spawned/produced/...).
    expect(edges.map((e) => e.data?.edgeType).sort()).toEqual(['produced', 'spawned']);
  });

  // spec(LESSONS §30 defensive): an edge with a missing source/target endpoint is DROPPED (React Flow
  // breaks on a dangling edge).
  it('test_lineageToFlow_drops_dangling_edges', () => {
    const proj = fullProjection({
      edges: [
        { id: 'ok', source: 'g0', target: 'a0', type: 'spawned' },
        { id: 'bad-target', source: 'a0', target: 'ghost', type: 'produced' },
        { id: 'bad-source', source: 'ghost', target: 'c0', type: 'produced' },
      ],
    });
    const { edges } = lineageToFlow(proj);
    expect(edges.map((e) => e.id)).toEqual(['ok']);
  });

  // in-flight bridge: a node whose dataRef ∈ workingRefs is marked working (the dataRef ↔ event
  // entity-id bridge resolved in the component from deriveInFlight).
  it('test_lineageToFlow_marks_working_by_dataRef', () => {
    const { nodes } = lineageToFlow(fullProjection(), new Set(['agn_0']));
    const n = byId(nodes);
    expect(n.a0!.data.working).toBe(true); // dataRef agn_0 is working
    expect(n.c0!.data.working).toBe(false);
  });

  // spec(§10 watermark): a stale (lower sequenceThrough) projection never replaces a newer one.
  it('test_pickFreshestProjection_watermark', () => {
    const older = fullProjection({ sequenceThrough: 12 });
    const newer = fullProjection({ sequenceThrough: 20 });
    expect(pickFreshestProjection(older, newer)).toBe(newer);
    expect(pickFreshestProjection(newer, older)).toBe(newer); // stale rejected
    expect(pickFreshestProjection(null, older)).toBe(older);
    expect(pickFreshestProjection(newer, newer)).toBe(newer); // equal watermark → accept incoming
  });
});
