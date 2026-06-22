import { describe, expect, it } from 'vitest';
import { validCandidateIdeaCrossDomain } from '@doppl/contracts';
import type { LineageGraphProjection, RunEventEnvelope } from '@doppl/contracts';
import { gatherProof, selectWinner } from '../../../src/panels/finalIdeaData';
import { makeEvent } from '../../fixtures/events';

const WIN = validCandidateIdeaCrossDomain; // id 'cand_1', agenomeId 'agn_1'

function lineageWith(nodes: LineageGraphProjection['nodes']): LineageGraphProjection {
  return { runId: 'run_1', nodes, edges: [], sequenceThrough: 30 };
}
function fitnessEvent(
  seq: number,
  candidateId: string,
  total: number,
  components: Record<string, number>,
): RunEventEnvelope {
  return makeEvent(seq, 'fitness.scored', {
    candidateId,
    payload: {
      id: `fit_${seq}`,
      candidateId,
      total,
      components,
      policyVersion: 'scoring-v1',
      explanation: 'x',
    },
  });
}
function energyEvent(seq: number, agenomeId: string, actual: number): RunEventEnvelope {
  return makeEvent(seq, 'energy.spent', {
    agenomeId,
    payload: {
      id: `en_${seq}`,
      runId: 'run_1',
      agenomeId,
      eventType: 'llm',
      estimate: actual,
      actual,
      unit: 'doppl_energy',
      reason: 'gen',
    },
  });
}
function reviewEvent(
  seq: number,
  candidateId: string,
  mandate: string,
  confidence: number,
): RunEventEnvelope {
  return makeEvent(seq, 'critic.reviewed', {
    candidateId,
    payload: {
      id: `crev_${seq}`,
      candidateId,
      mandate,
      scores: { rigor: 0.8 },
      critique: `crit ${seq}`,
      confidence,
      evidenceRefs: [],
    },
  });
}
function checkEvent(
  seq: number,
  candidateId: string,
  checkType: string,
  status: string,
): RunEventEnvelope {
  return makeEvent(seq, 'check.completed', {
    candidateId,
    payload: { id: `chk_${seq}`, candidateId, checkType, status, evidenceRefs: [] },
  });
}

describe('finalIdeaData — winner selection + proof aggregation (emit-only)', () => {
  // spec(§12 / LESSONS §5): winner = the lineage node type:candidate + status:'selected'; none → null.
  it('test_select_winner_from_lineage', () => {
    const lin = lineageWith([
      { id: 'g0', type: 'generation', label: 'G0', dataRef: 'gen_0' },
      { id: 'w', type: 'candidate', label: 'Winner', status: 'selected', dataRef: 'cand_1' },
    ]);
    expect(selectWinner(lin)?.dataRef).toBe('cand_1');
    expect(
      selectWinner(
        lineageWith([
          { id: 'c', type: 'candidate', label: 'c', status: 'scored', dataRef: 'cand_x' },
        ]),
      ),
    ).toBeNull();
  });

  // spec(rule #6 emit-only): a NON-selected candidate with higher metrics is NOT chosen — only the
  // kernel/judge's status:'selected' node wins (the panel never re-ranks).
  it('test_emit_only_no_re_selection', () => {
    const lin = lineageWith([
      {
        id: 'hi',
        type: 'candidate',
        label: 'High fitness',
        status: 'scored',
        metrics: { fitness: 0.99 },
        dataRef: 'cand_hi',
      },
      {
        id: 'w',
        type: 'candidate',
        label: 'Winner',
        status: 'selected',
        metrics: { fitness: 0.5 },
        dataRef: 'cand_1',
      },
    ]);
    expect(selectWinner(lin)?.dataRef).toBe('cand_1'); // the selected one, NOT the higher-metric one
  });

  // spec(§12 defensibility): gatherProof aggregates the winner's reviews/checks/fitness/energy/traces.
  it('test_gather_proof_aggregates', () => {
    const winner = selectWinner(
      lineageWith([
        { id: 'w', type: 'candidate', label: 'Winner', status: 'selected', dataRef: 'cand_1' },
      ]),
    )!;
    const events = [
      fitnessEvent(1, 'cand_1', 0.84, { critic: 0.7, novelty: 0.6 }),
      energyEvent(2, 'agn_1', 120),
      reviewEvent(3, 'cand_1', 'feasibility', 0.8),
      checkEvent(4, 'cand_1', 'math_check', 'passed'),
      makeEvent(5, 'candidate.created', {
        candidateId: 'cand_1',
        langfuseTraceId: 'tr_1',
        langfuseObservationId: 'ob_1',
        payload: {},
      }),
    ];
    const proof = gatherProof(winner, WIN, events);
    expect(proof.fitnessTotal).toBe(0.84);
    expect(proof.fitnessComponents).toEqual({ critic: 0.7, novelty: 0.6 });
    expect(proof.energy?.total).toBe(120);
    expect(proof.reviews.map((r) => r.mandate)).toEqual(['feasibility']);
    expect(proof.checks.map((c) => c.checkType)).toEqual(['math_check']);
    expect(proof.traces.some((t) => t.traceId === 'tr_1')).toBe(true);
  });
});
