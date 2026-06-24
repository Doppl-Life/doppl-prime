import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION,
  LineageGraphProjection,
  LineageNodeType,
  validCandidateIdeaCrossDomain,
  validCriticReview,
  validCheckResult,
  validNoveltyScore,
  validFitnessScore,
  validReproductionEvent,
  validJudgeResult,
} from '@doppl/contracts';
import {
  buildCurrentState,
  buildLineageGraph,
  emptyCurrentState,
  type RunEventRow,
} from '../../../src/projections';

/**
 * P6.3 — lineage-graph projection builder (pure unit). spec(§10): a PURE transform of the P6.2
 * current-state into the FROZEN LineageGraphProjection (P0.13) — nodes (closed-6 LineageNodeType) from
 * entity rows, edges from lineage_edges (reproduction) + structural connectivity, sequenceThrough
 * carried through, dataRef = within-tier pointer. Producer-conformance: output safeParses the contract.
 */

let idCounter = 0;
function makeRow(
  type: string,
  fields: Partial<RunEventRow> & { sequence: number; runId: string },
): RunEventRow {
  return {
    id: `evt-${idCounter++}`,
    runId: fields.runId,
    generationId: fields.generationId ?? null,
    agenomeId: fields.agenomeId ?? null,
    candidateId: fields.candidateId ?? null,
    type,
    sequence: fields.sequence,
    occurredAt: new Date('2026-06-21T00:00:00.000Z'),
    actor: 'runtime',
    correlationId: null,
    langfuseTraceId: null,
    langfuseObservationId: null,
    payload: fields.payload ?? {},
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
}

function fullRunEvents(runId: string): RunEventRow[] {
  return [
    makeRow('run.configured', { runId, sequence: 0 }),
    makeRow('generation.started', { runId, generationId: 'gen_1', sequence: 1 }),
    makeRow('agenome.spawned', { runId, generationId: 'gen_1', agenomeId: 'agn_1', sequence: 2 }),
    makeRow('candidate.created', { runId, sequence: 3, payload: validCandidateIdeaCrossDomain }),
    makeRow('critic.reviewed', { runId, sequence: 4, payload: validCriticReview }),
    makeRow('check.completed', { runId, sequence: 5, payload: validCheckResult }),
    makeRow('novelty.scored', { runId, sequence: 6, payload: validNoveltyScore }),
    makeRow('fitness.scored', { runId, sequence: 7, payload: validFitnessScore }),
    makeRow('agenome.reproduced', {
      runId,
      generationId: 'gen_1',
      agenomeId: 'agn_1',
      sequence: 8,
      payload: validReproductionEvent,
    }),
  ];
}

describe('buildLineageGraph — pure transform of current-state → frozen LineageGraphProjection (spec §10)', () => {
  // §10 — nodes use the frozen closed-6 LineageNodeType (generation/agenome/candidate/critic/check/
  // score); novelty is a metric on the candidate, not a 7th node type. Positive guard.
  test('test_derives_nodes_for_closed_six_types', () => {
    const graph = buildLineageGraph(buildCurrentState(fullRunEvents('run_1')));
    const byType = (t: string): typeof graph.nodes => graph.nodes.filter((n) => n.type === t);
    expect(byType('generation')).toHaveLength(1);
    expect(byType('agenome').length).toBeGreaterThanOrEqual(1);
    expect(byType('candidate')[0]?.id).toBe('cand_1');
    expect(byType('candidate')[0]?.label).toBe(validCandidateIdeaCrossDomain.title);
    expect(byType('critic')[0]?.id).toBe('rev_1');
    expect(byType('check')[0]?.id).toBe('chk_1');
    expect(byType('score')[0]?.id).toBe('fit_1');
    // every node type is in the frozen closed-6 set (no invented 'novelty'/'winner' type).
    for (const n of graph.nodes) expect(LineageNodeType.options).toContain(n.type);
    // novelty surfaces as a metric on the candidate node, not a node.
    expect(byType('candidate')[0]?.metrics?.novelty).toBe(validNoveltyScore.score);
    expect(byType('candidate')[0]?.metrics?.fitness).toBe(validFitnessScore.total);
  });

  // §10 — edges: lineage_edges (reproduction parent→child) become LineageEdges, plus structural
  // connectivity (generation→agenome→candidate→{critic,check,score}) so the rendered set is connected.
  test('test_derives_edges_from_lineage_edges', () => {
    const graph = buildLineageGraph(buildCurrentState(fullRunEvents('run_1')));
    const edge = (s: string, t: string): (typeof graph.edges)[number] | undefined =>
      graph.edges.find((e) => e.source === s && e.target === t);
    // reproduction edge (from lineage_edges): agn_1 → agn_3, type = mode.
    expect(edge('agn_1', 'agn_3')?.type).toBe('fusion');
    // structural connectivity (Q4 expanded): candidate edged to its critic + check + score.
    expect(edge('cand_1', 'rev_1')).toBeDefined();
    expect(edge('cand_1', 'chk_1')).toBeDefined();
    expect(edge('cand_1', 'fit_1')).toBeDefined();
    expect(edge('agn_1', 'cand_1')).toBeDefined(); // agenome → its candidate
  });

  // §9/§10 — sequenceThrough carries through from the current-state watermark.
  test('test_sequence_through_carries_watermark', () => {
    const cs = buildCurrentState(fullRunEvents('run_1'));
    const graph = buildLineageGraph(cs);
    expect(graph.sequenceThrough).toBe(cs.sequenceThrough);
    expect(graph.sequenceThrough).toBe(8);
    expect(graph.runId).toBe('run_1');
  });

  // §10 — every node dataRef is a within-tier authoritative pointer (entity id), never an external URI.
  test('test_dataref_is_postgres_tier_pointer', () => {
    const graph = buildLineageGraph(buildCurrentState(fullRunEvents('run_1')));
    expect(graph.nodes.length).toBeGreaterThan(0);
    for (const n of graph.nodes) {
      expect(n.dataRef.length).toBeGreaterThan(0);
      expect(n.dataRef).not.toMatch(/:\/\//); // not a URI / external store
    }
  });

  // §10 — the selected winner is a candidate node carrying status 'selected', NOT a new node type.
  test('test_winner_is_candidate_node_with_selected_status', () => {
    const winner = { ...validCandidateIdeaCrossDomain, status: 'selected' as const };
    const graph = buildLineageGraph(
      buildCurrentState([
        makeRow('candidate.created', { runId: 'run_1', sequence: 0, payload: winner }),
      ]),
    );
    const node = graph.nodes.find((n) => n.id === 'cand_1');
    expect(node?.type).toBe('candidate');
    expect(node?.status).toBe('selected');
    for (const n of graph.nodes) expect(LineageNodeType.options).toContain(n.type);
  });

  // PD.11 (spec §10) — a REAL-finalIdeaRef run (candidate status NOT pre-set) yields the winner candidate
  // node with status 'selected' — the surface web `selectWinner` reads (finalIdeaData.ts). The winner is
  // derived by the projection from run.completed.finalIdeaRef, not a hand-set payload.
  test('test_finalIdeaRef_run_yields_selected_winner_node', () => {
    const scored = { ...validCandidateIdeaCrossDomain, status: 'scored' as const };
    const graph = buildLineageGraph(
      buildCurrentState([
        makeRow('candidate.created', { runId: 'run_1', sequence: 0, payload: scored }),
        makeRow('run.completed', {
          runId: 'run_1',
          sequence: 1,
          payload: { from: 'running', to: 'completed', finalIdeaRef: 'cand_1' },
        }),
      ]),
    );
    const node = graph.nodes.find((n) => n.id === 'cand_1');
    expect(node?.type).toBe('candidate');
    expect(node?.status).toBe('selected');
  });

  // §8/§10 (lineage-projection bug fix) — a fused/mutated CHILD agenome renders a proper structure: an
  // `agenome` node for the child, a generation→agenome edge to its OWN gen N+1, and the candidate it
  // produced edged to it (`generated`). Before the fix the child agenome never entered state.agenomes, so
  // the agenome node + both edges were absent and the gen-N+1 candidate floated disconnected.
  test('test_fused_child_renders_agenome_node_and_connects_candidate', () => {
    const runId = 'run_repro';
    const childId = 'child_fused';
    // gen0: parent reproduces (event homed to parent gen0; child is gen1). gen1: the gen1 generation node
    // exists (generation.started) and the child produces a candidate carrying agenomeId=child, gen=gen1.
    const childCandidate = {
      ...validCandidateIdeaCrossDomain,
      id: 'cand_child',
      agenomeId: childId,
      generationId: `${runId}-gen1`,
    };
    const graph = buildLineageGraph(
      buildCurrentState([
        makeRow('generation.started', { runId, generationId: `${runId}-gen0`, sequence: 0 }),
        makeRow('agenome.fused', {
          runId,
          generationId: `${runId}-gen0`,
          sequence: 1,
          payload: { ...validReproductionEvent, childAgenomeId: childId },
        }),
        makeRow('generation.started', { runId, generationId: `${runId}-gen1`, sequence: 2 }),
        makeRow('candidate.created', { runId, sequence: 3, payload: childCandidate }),
      ]),
    );
    // the child agenome is a real node ...
    const childNode = graph.nodes.find((n) => n.id === childId);
    expect(childNode?.type).toBe('agenome');
    // ... linked to its OWN generation (gen1) ...
    const genEdge = graph.edges.find(
      (e) => e.source === `${runId}-gen1` && e.target === childId,
    );
    expect(genEdge).toBeDefined();
    // ... and its candidate connects to it (no longer floating).
    const candEdge = graph.edges.find((e) => e.source === childId && e.target === 'cand_child');
    expect(candEdge?.type).toBe('generated');
    // every node still in the frozen closed-6 set; output conforms to the contract.
    for (const n of graph.nodes) expect(LineageNodeType.options).toContain(n.type);
    expect(LineageGraphProjection.safeParse(graph).success).toBe(true);
  });

  // §2.5-seam producer-conformance — the builder output safeParses the frozen P0.13 contract.
  test('test_output_conforms_to_frozen_contract', () => {
    const graph = buildLineageGraph(buildCurrentState(fullRunEvents('run_1')));
    expect(LineageGraphProjection.safeParse(graph).success).toBe(true);
  });

  // §10 — an empty/partial current-state yields a valid (empty nodes/edges) projection, not an error.
  test('test_empty_run_yields_valid_empty_projection', () => {
    const graph = buildLineageGraph({
      runId: 'run_x',
      sequenceThrough: 0,
      state: emptyCurrentState(),
    });
    expect(graph).toEqual({ runId: 'run_x', nodes: [], edges: [], sequenceThrough: 0 });
    expect(LineageGraphProjection.safeParse(graph).success).toBe(true);
  });

  // §10 robustness (APPROVED guard #1) — a STRUCTURAL edge is emitted only when both endpoints have
  // nodes: an orphan critic referencing an absent candidate yields its node but no edge to the missing
  // node (React Flow breaks on edges to non-existent nodes).
  test('test_no_dangling_edge_endpoints', () => {
    const orphanReview = { ...validCriticReview, id: 'rev_orphan', candidateId: 'cand_absent' };
    const graph = buildLineageGraph(
      buildCurrentState([
        makeRow('critic.reviewed', { runId: 'run_1', sequence: 0, payload: orphanReview }),
      ]),
    );
    expect(graph.nodes.some((n) => n.id === 'rev_orphan' && n.type === 'critic')).toBe(true);
    expect(graph.edges.some((e) => e.source === 'cand_absent' || e.target === 'cand_absent')).toBe(
      false,
    );
    // in this reproduction-free graph, every structural-edge endpoint resolves to a node.
    const nodeIds = new Set(graph.nodes.map((n) => n.id));
    for (const e of graph.edges) {
      expect(nodeIds.has(e.source) && nodeIds.has(e.target)).toBe(true);
    }
  });

  // §10/§11 [med gate-fix] — edge ids are unique across the graph: a structural edge and a reproduction
  // edge sharing the same (source,target) must NOT collide on `id` (React Flow breaks on duplicate edge
  // ids). Here a reproduction child id equals a candidate id, so BOTH kinds yield source→target
  // agn_1→shared_id; the kind-prefixed ids (struct: vs repro:) keep them distinct.
  test('test_edge_ids_unique', () => {
    const events = [
      makeRow('generation.started', { runId: 'run_dup', generationId: 'gen_1', sequence: 0 }),
      makeRow('agenome.spawned', {
        runId: 'run_dup',
        generationId: 'gen_1',
        agenomeId: 'agn_1',
        sequence: 1,
      }),
      makeRow('candidate.created', {
        runId: 'run_dup',
        sequence: 2,
        payload: { ...validCandidateIdeaCrossDomain, id: 'shared_id', agenomeId: 'agn_1' },
      }),
      makeRow('agenome.reproduced', {
        runId: 'run_dup',
        generationId: 'gen_1',
        agenomeId: 'agn_1',
        sequence: 3,
        payload: {
          ...validReproductionEvent,
          parentAgenomeIds: ['agn_1'],
          childAgenomeId: 'shared_id',
        },
      }),
    ];
    const graph = buildLineageGraph(buildCurrentState(events));
    const ids = graph.edges.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length); // no duplicate edge ids (React Flow dup-edge guard)
    // both the structural (generated) and reproduction agn_1→shared_id edges survive as DISTINCT edges.
    expect(
      graph.edges.filter((e) => e.source === 'agn_1' && e.target === 'shared_id'),
    ).toHaveLength(2);
  });

  // §10 robustness (APPROVED guard #2) — node ids are unique across the graph (entity-ids-globally-
  // unique assumption; a P3-reconcile flag covers namespacing if the kernel allows cross-type id
  // collisions).
  test('test_node_ids_unique', () => {
    const graph = buildLineageGraph(buildCurrentState(fullRunEvents('run_1')));
    const ids = graph.nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // §10 (sv5) — a JudgeResult renders as a closed-set 'score' node (the closed-6 LineageNodeType has no
  // 'judge' — LESSONS §54, encode non-node concepts as status/metric): metrics.acceptance + dataRef=id.
  test('test_judge_renders_as_score_node', () => {
    const graph = buildLineageGraph(
      buildCurrentState([
        makeRow('candidate.created', {
          runId: 'run_1',
          sequence: 0,
          payload: validCandidateIdeaCrossDomain,
        }),
        makeRow('judge.reviewed', { runId: 'run_1', sequence: 1, payload: validJudgeResult }),
      ]),
    );
    const judgeNode = graph.nodes.find((n) => n.id === 'judge_1');
    expect(judgeNode?.type).toBe('score');
    expect(judgeNode?.metrics?.acceptance).toBe(validJudgeResult.acceptance);
    expect(judgeNode?.dataRef).toBe('judge_1');
    // no invented 7th node type — every node stays in the frozen closed-6 set.
    for (const n of graph.nodes) expect(LineageNodeType.options).toContain(n.type);
  });

  // §10 (sv5) — a guarded structural candidate→judge 'judged_by' edge: emitted (struct:-prefixed id)
  // only when the candidate node exists; dropped when it is absent (dangling-edge guard, LESSONS §54).
  test('test_judge_edge_guarded_and_prefixed', () => {
    const withCand = buildLineageGraph(
      buildCurrentState([
        makeRow('candidate.created', {
          runId: 'run_1',
          sequence: 0,
          payload: validCandidateIdeaCrossDomain,
        }),
        makeRow('judge.reviewed', { runId: 'run_1', sequence: 1, payload: validJudgeResult }),
      ]),
    );
    const edge = withCand.edges.find((e) => e.source === 'cand_1' && e.target === 'judge_1');
    expect(edge?.type).toBe('judged_by');
    expect(edge?.id.startsWith('struct:')).toBe(true);

    // candidate absent → the judge node still exists, but NO dangling edge to a non-existent candidate.
    const orphanJudge = { ...validJudgeResult, id: 'judge_orphan', candidateId: 'cand_absent' };
    const noCand = buildLineageGraph(
      buildCurrentState([
        makeRow('judge.reviewed', { runId: 'run_1', sequence: 0, payload: orphanJudge }),
      ]),
    );
    expect(noCand.nodes.some((n) => n.id === 'judge_orphan' && n.type === 'score')).toBe(true);
    expect(
      noCand.edges.some((e) => e.source === 'cand_absent' || e.target === 'judge_orphan'),
    ).toBe(false);
  });

  // rule #7 — structural: the lineage builder imports no ModelGateway/provider/embedding.
  test('test_builder_imports_no_provider', () => {
    const src = readFileSync(
      fileURLToPath(new URL('../../../src/projections/lineage-graph.ts', import.meta.url)),
      'utf8',
    );
    expect(src.length).toBeGreaterThan(0);
    expect(
      /from\s+['"][^'"]*(model-gateway|gateway|openai|@anthropic|openrouter|embedding)/i.test(src),
    ).toBe(false);
  });
});
