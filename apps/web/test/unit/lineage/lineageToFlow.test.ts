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
  // spec(§10/§12, FV.5a declutter): the KEPT projection types map to their rendered types — agenome,
  // candidate, generation backbone, candidate+status:'selected' → selectedWinner; each node carries its
  // accessible status spec + dataRef link target. (critic/check/score are dropped — see below.)
  it('test_lineageToFlow_maps_kept_types_to_rendered', () => {
    const { nodes, edges } = lineageToFlow(fullProjection());
    const n = byId(nodes);
    expect(n.g0!.type).toBe('generation'); // backbone
    expect(n.a0!.type).toBe('agenome');
    expect(n.c0!.type).toBe('candidate');
    expect(n.w0!.type).toBe('selectedWinner'); // candidate + status:'selected'

    // accessible status spec resolved (shape+label+icon) when status present; absent otherwise.
    expect(n.a0!.data.statusSpec?.label).toBe('active');
    expect(n.a0!.data.statusSpec?.glyph).toBeTruthy();
    expect(n.g0!.data.statusSpec).toBeUndefined();
    // dataRef preserved as the inspector/evidence link target.
    expect(n.a0!.data.dataRef).toBe('agn_0');
    // edges keep the projection's relation type for legibility (spawned/produced/...).
    expect(edges.map((e) => e.data?.edgeType).sort()).toEqual(['produced', 'spawned']);
  });

  // spec(FV.5a §12 declutter): the organism graph is the agenome+candidate backbone ONLY — critic /
  // check / score (incl. judge-as-score) detail nodes are filtered out (they move to the node-click
  // inspector). The backbone (generation/agenome/candidate/selectedWinner) survives.
  it('test_lineage_to_flow_drops_critic_check_score', () => {
    const { nodes } = lineageToFlow(fullProjection());
    const ids = nodes.map((nn) => nn.id);
    expect(ids).toEqual(expect.arrayContaining(['g0', 'a0', 'c0', 'w0'])); // backbone kept
    expect(ids).not.toContain('cr0'); // critic dropped
    expect(ids).not.toContain('ck0'); // check dropped
    expect(ids).not.toContain('sc0'); // score dropped
    const types = new Set(nodes.map((nn) => nn.type));
    expect(types.has('criticCheck')).toBe(false);
    expect(types.has('score')).toBe(false);
  });

  // spec(§10 graph integrity): an edge incident to a dropped (critic/check/score) node is removed — no
  // edge references a missing node; the agenome→candidate backbone edges remain.
  it('test_lineage_to_flow_drops_incident_edges_no_dangling', () => {
    const proj = fullProjection({
      edges: [
        { id: 'e-sp', source: 'g0', target: 'a0', type: 'spawned' },
        { id: 'e-gen', source: 'a0', target: 'c0', type: 'generated' },
        { id: 'e-rev', source: 'c0', target: 'cr0', type: 'reviewed_by' }, // → dropped node
        { id: 'e-chk', source: 'c0', target: 'ck0', type: 'checked_by' }, // → dropped node
        { id: 'e-scr', source: 'c0', target: 'sc0', type: 'scored_by' }, // → dropped node
      ],
    });
    const { nodes, edges } = lineageToFlow(proj);
    const nodeIds = new Set(nodes.map((nn) => nn.id));
    for (const e of edges) {
      expect(nodeIds.has(e.source)).toBe(true); // no dangling / no reference to a dropped node
      expect(nodeIds.has(e.target)).toBe(true);
    }
    expect(edges.map((e) => e.id).sort()).toEqual(['e-gen', 'e-sp']); // only the backbone survives
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
