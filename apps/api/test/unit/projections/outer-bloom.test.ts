import { describe, expect, test } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION,
  validCandidateIdeaCrossDomain,
  validFitnessScore,
  validNoveltyScore,
  validReproductionEvent,
  validJudgeResult,
} from '@doppl/contracts';
import { buildOuterBloom, buildOuterBloomForRun, type RunEventRow } from '../../../src/projections';

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

describe('buildOuterBloomForRun', () => {
  test('builds a seed-rooted bloom island from run events', () => {
    const runId = 'run_outer';
    const candidate = {
      ...validCandidateIdeaCrossDomain,
      id: 'cand_outer',
      runId,
      generationId: `${runId}-gen0`,
      agenomeId: 'ag_outer',
      title: 'Recovered bottleneck',
      summary: 'The actual constraint sits below the visible symptom.',
      status: 'selected' as const,
    };
    const island = buildOuterBloomForRun([
      makeRow('run.configured', {
        runId,
        sequence: 0,
        payload: { seed: 'When the visible symptom lies about the real bottleneck.' },
      }),
      makeRow('run.started', { runId, sequence: 1 }),
      makeRow('candidate.created', { runId, sequence: 2, payload: candidate }),
      makeRow('fitness.scored', {
        runId,
        sequence: 3,
        payload: { ...validFitnessScore, candidateId: 'cand_outer', total: 0.87 },
      }),
      makeRow('novelty.scored', {
        runId,
        sequence: 4,
        payload: { ...validNoveltyScore, candidateId: 'cand_outer', score: 0.62 },
      }),
      makeRow('judge.reviewed', {
        runId,
        sequence: 5,
        payload: { ...validJudgeResult, candidateId: 'cand_outer', acceptance: 4 },
      }),
    ]);

    expect(island.seed).toBe('When the visible symptom lies about the real bottleneck.');
    expect(island.nodes[0]).toMatchObject({ id: `${runId}:seed`, stage: 'case_study' });
    expect(island.nodes.find((node) => node.stage === 'problem_recovery')).toMatchObject({
      id: `${runId}:problem-recovery`,
      parentId: `${runId}:seed`,
    });
    expect(island.nodes.find((node) => node.id === 'cand_outer')).toMatchObject({
      stage: 'doppl',
      parentId: `${runId}:problem-recovery`,
      score: 0.87,
      novelty: 0.62,
      judgeAcceptance: 4,
      generationIndex: 0,
    });
    expect(island.edges).toContainEqual({
      id: `${runId}:problem-recovery->cand_outer`,
      source: `${runId}:problem-recovery`,
      target: 'cand_outer',
      type: 'solved_by',
    });
  });

  test('uses agenome reproduction lineage to connect descendant doppls', () => {
    const runId = 'run_lineage';
    const parent = {
      ...validCandidateIdeaCrossDomain,
      id: 'cand_parent',
      runId,
      generationId: `${runId}-gen0`,
      agenomeId: 'ag_parent',
    };
    const child = {
      ...validCandidateIdeaCrossDomain,
      id: 'cand_child',
      runId,
      generationId: `${runId}-gen1`,
      agenomeId: 'ag_child',
    };

    const island = buildOuterBloomForRun([
      makeRow('run.configured', { runId, sequence: 0, payload: { seed: 'Seed' } }),
      makeRow('candidate.created', { runId, sequence: 1, payload: parent }),
      makeRow('agenome.fused', {
        runId,
        generationId: `${runId}-gen0`,
        sequence: 2,
        payload: {
          ...validReproductionEvent,
          parentAgenomeIds: ['ag_parent'],
          childAgenomeId: 'ag_child',
        },
      }),
      makeRow('candidate.created', { runId, sequence: 3, payload: child }),
    ]);

    expect(island.nodes.find((node) => node.id === 'cand_child')?.parentId).toBe('cand_parent');
    expect(island.edges).toContainEqual({
      id: 'cand_parent->cand_child',
      source: 'cand_parent',
      target: 'cand_child',
      type: 'descended',
    });
  });
});

describe('buildOuterBloom', () => {
  test('summarizes islands without mutating their order-dependent contents', () => {
    const a = buildOuterBloomForRun([
      makeRow('run.configured', { runId: 'b_run', sequence: 0, payload: { seed: 'B' } }),
    ]);
    const b = buildOuterBloomForRun([
      makeRow('run.configured', { runId: 'a_run', sequence: 0, payload: { seed: 'A' } }),
    ]);

    const bloom = buildOuterBloom([a, b]);

    expect(bloom.islands.map((island) => island.runId)).toEqual(['a_run', 'b_run']);
    expect(bloom.totals).toEqual({
      runs: 2,
      nodes: 2,
      problemRecoveries: 0,
      doppls: 0,
      selected: 0,
    });
  });
});
