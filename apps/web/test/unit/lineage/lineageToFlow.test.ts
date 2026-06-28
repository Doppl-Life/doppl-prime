import { describe, expect, it } from 'vitest';
import type { LineageGraphProjection } from '@doppl/contracts';
import {
  isRenderedEdge,
  isReproductionEdge,
  lineageToFlow,
  pickFreshestProjection,
} from '../../../src/lineage/lineageToFlow';
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

  // spec(§8/§3 + §12): an AGENOME's `bornBy` is derived from its INCOMING reproduction edge — the
  // fusion family → 'fusion', `mutation_only` → 'mutation', no incoming repro edge → 'seed'. Non-agenome
  // nodes leave it undefined. (The repro edge's SOURCE may be any node; only target+type classify it.)
  it('test_bornBy_derived_from_incoming_reproduction_edge', () => {
    const proj = fullProjection({
      nodes: [
        { id: 'g0', type: 'generation', label: 'Gen 0', dataRef: 'gen_0' },
        { id: 'a_seed', type: 'agenome', label: 'Seed', status: 'active', dataRef: 'agn_s' },
        { id: 'a_mut', type: 'agenome', label: 'Mut', status: 'active', dataRef: 'agn_m' },
        { id: 'a_fus', type: 'agenome', label: 'Fus', status: 'active', dataRef: 'agn_f' },
        { id: 'c0', type: 'candidate', label: 'C0', status: 'scored', dataRef: 'cand_0' },
      ],
      edges: [
        { id: 'sp', source: 'g0', target: 'a_seed', type: 'spawned' }, // not a repro edge → seed
        { id: 'm', source: 'a_seed', target: 'a_mut', type: 'mutation_only' },
        { id: 'f', source: 'a_seed', target: 'a_fus', type: 'crossover' }, // fusion family
        { id: 'gen', source: 'a_seed', target: 'c0', type: 'generated' },
      ],
    });
    const n = byId(lineageToFlow(proj).nodes);
    expect(n.a_seed!.data.bornBy).toBe('seed'); // only a `spawned` edge incoming → seed
    expect(n.a_mut!.data.bornBy).toBe('mutation'); // incoming mutation_only
    expect(n.a_fus!.data.bornBy).toBe('fusion'); // incoming crossover (fusion family)
    expect(n.c0!.data.bornBy).toBeUndefined(); // non-agenome → undefined
    expect(n.g0!.data.bornBy).toBeUndefined();
  });

  // spec(§12): generationIndex passes through onto node data (the column the layout buckets into).
  it('test_generationIndex_threads_through', () => {
    const proj = fullProjection({
      nodes: [
        {
          id: 'a0',
          type: 'agenome',
          label: 'A0',
          status: 'active',
          dataRef: 'agn_0',
          generationIndex: 2,
        },
      ],
      edges: [],
    });
    expect(byId(lineageToFlow(proj).nodes).a0!.data.generationIndex).toBe(2);
  });

  // spec(§12): each surviving edge carries its per-type visual — a fusion edge is violet+animated; a
  // plumbing `spawned` edge is faint and not animated.
  it('test_edges_carry_per_type_style', () => {
    const proj = fullProjection({
      nodes: [
        { id: 'a0', type: 'agenome', label: 'A0', status: 'active', dataRef: 'agn_0' },
        { id: 'a1', type: 'agenome', label: 'A1', status: 'active', dataRef: 'agn_1' },
        { id: 'g0', type: 'generation', label: 'Gen 0', dataRef: 'gen_0' },
      ],
      edges: [
        { id: 'fuse', source: 'a0', target: 'a1', type: 'fusion' },
        { id: 'sp', source: 'g0', target: 'a0', type: 'spawned' },
      ],
    });
    const { edges } = lineageToFlow(proj);
    const e = Object.fromEntries(edges.map((ed) => [ed.id, ed]));
    expect(e.fuse!.style?.stroke).toBe('var(--status-reproduced)');
    expect(e.fuse!.animated).toBe(true);
    expect(e.fuse!.markerEnd).toBeTruthy();
    expect(e.sp!.style?.stroke).toBe('var(--border-subtle)');
    expect(e.sp!.animated).toBeUndefined();
  });

  // B5 declutter (§12): the redesign drops the per-edge TEXT label (every edge previously printed its type
  // — "fusion"/"generated"/"spawned" — plastering text boxes across the graph; the legend + per-type
  // stroke/dash/marker already convey type) and routes edges as `smoothstep` (orthogonal — straight
  // diagonals turn the dense per-generation DAG into a crossing hairball). Style/animation/marker stay.
  it('test_edges_are_label_free_smoothstep_after_declutter', () => {
    const proj = fullProjection({
      nodes: [
        { id: 'a0', type: 'agenome', label: 'A0', status: 'active', dataRef: 'agn_0' },
        { id: 'a1', type: 'agenome', label: 'A1', status: 'active', dataRef: 'agn_1' },
        { id: 'g0', type: 'generation', label: 'Gen 0', dataRef: 'gen_0' },
      ],
      edges: [
        { id: 'fuse', source: 'a0', target: 'a1', type: 'fusion', label: 'fusion' },
        { id: 'sp', source: 'g0', target: 'a0', type: 'spawned' },
      ],
    });
    for (const ed of lineageToFlow(proj).edges) {
      expect(ed.label, `edge ${ed.id} must carry no text label`).toBeUndefined();
      expect(ed.type, `edge ${ed.id} must route as smoothstep`).toBe('smoothstep');
    }
  });

  // spec(§12 winner callout): the selected winner sits in a right-hand lane but KEEPS its provenance edge
  // — a GOLD connector from the producing agenome, anchored HORIZONTALLY (winner is to the right, not
  // below), and flagged `winner` so it always renders (even if the projection types it `produced`).
  it('test_winner_provenance_edge_is_gold_and_horizontal', () => {
    const proj = fullProjection({
      nodes: [
        { id: 'g0', type: 'generation', label: 'Gen 0', dataRef: 'gen_0' },
        { id: 'a0', type: 'agenome', label: 'A0', status: 'active', dataRef: 'agn_0' },
        { id: 'w0', type: 'candidate', label: 'Winner', status: 'selected', dataRef: 'cand_win' },
      ],
      edges: [
        { id: 'e-sp', source: 'g0', target: 'a0', type: 'spawned' },
        { id: 'e-win', source: 'a0', target: 'w0', type: 'produced' }, // → winner: kept + gold
      ],
    });
    const e = Object.fromEntries(lineageToFlow(proj).edges.map((ed) => [ed.id, ed]));
    expect(e['e-win']).toBeTruthy(); // winner provenance edge kept
    expect(e['e-win']!.data?.winner).toBe(true); // flagged so the render filter always draws it
    expect(e['e-win']!.style?.stroke).toBe('var(--status-selected)'); // gold winning-path connector
    expect(e['e-win']!.sourceHandle).toBe('sr'); // horizontal: parent right → winner left
    expect(e['e-win']!.targetHandle).toBe('tl');
  });

  // spec(§12 declutter): only the BREEDING-EVENT edges (mutation/fusion family) are drawn on the canvas;
  // the routine plumbing (generated/spawned/derivation) is implied by column position, not rendered.
  it('test_isReproductionEdge_only_breeding_events', () => {
    expect(isReproductionEdge('mutation_only')).toBe(true);
    expect(isReproductionEdge('fusion')).toBe(true);
    expect(isReproductionEdge('crossover')).toBe(true);
    expect(isReproductionEdge('output_synthesis')).toBe(true);
    expect(isReproductionEdge('generated')).toBe(false); // plumbing
    expect(isReproductionEdge('spawned')).toBe(false); // plumbing
    expect(isReproductionEdge(undefined)).toBe(false);
  });

  // spec(§12 provenance): the DRAWN set adds the short agenome→candidate connector to the breeding edges;
  // the generation→agenome `spawned` plumbing stays hidden.
  it('test_isRenderedEdge_adds_generated_connector', () => {
    expect(isRenderedEdge('generated')).toBe(true); // agenome→candidate provenance connector
    expect(isRenderedEdge('fusion')).toBe(true);
    expect(isRenderedEdge('mutation_only')).toBe(true);
    expect(isRenderedEdge('spawned')).toBe(false); // generation→agenome plumbing stays hidden
    expect(isRenderedEdge(undefined)).toBe(false);
  });

  // spec(§12): the `generated` connector anchors bottom→top (a short vertical drop to the candidate
  // beneath its agenome); breeding edges anchor right→left (horizontal across generations).
  it('test_edge_anchors_vertical_for_generated_horizontal_for_breeding', () => {
    const proj = fullProjection({
      nodes: [
        { id: 'g0', type: 'generation', label: 'Gen 0', dataRef: 'gen_0' },
        { id: 'a0', type: 'agenome', label: 'A0', status: 'active', dataRef: 'agn_0' },
        { id: 'a1', type: 'agenome', label: 'A1', status: 'active', dataRef: 'agn_1' },
        { id: 'c0', type: 'candidate', label: 'C0', status: 'scored', dataRef: 'cand_0' },
      ],
      edges: [
        { id: 'gen', source: 'a0', target: 'c0', type: 'generated' },
        { id: 'fuse', source: 'a0', target: 'a1', type: 'fusion' },
      ],
    });
    const e = Object.fromEntries(lineageToFlow(proj).edges.map((ed) => [ed.id, ed]));
    expect(e.gen!.sourceHandle).toBe('sb'); // agenome bottom
    expect(e.gen!.targetHandle).toBe('tt'); // candidate top
    expect(e.fuse!.sourceHandle).toBe('sr'); // parent right
    expect(e.fuse!.targetHandle).toBe('tl'); // child left
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
