import { describe, it, expect } from 'vitest';
import { CURRENT_SCHEMA_VERSION, validCandidateIdeaCrossDomain } from '@doppl/contracts';
import type { RunEventType } from '@doppl/contracts';
import type { RunEventRow } from '../../../src/event-store';
import { buildRunSummary } from '../../../src/projections/run-summary';

/**
 * RunSummary projection — the enriched per-run row backing the Runs table (GET /runs). A pure fold over the
 * run's persisted events: status + the selected winner (reusing buildCurrentState), the creation time +
 * problem (run.configured), and the activity counts (generations / candidates / reproductions / culls /
 * mutations). Replay-safe (folds the log, no provider — rule #7).
 */

let autoSeq = 0;
function row(over: Partial<RunEventRow> & { type: RunEventType }): RunEventRow {
  const sequence = over.sequence ?? autoSeq++;
  return {
    id: over.id ?? `e-${sequence}`,
    runId: over.runId ?? 'run_1',
    generationId: over.generationId ?? 'run_1-gen0',
    agenomeId: over.agenomeId ?? null,
    candidateId: over.candidateId ?? null,
    type: over.type,
    sequence,
    occurredAt: over.occurredAt ?? new Date(0),
    actor: over.actor ?? 'runtime',
    correlationId: null,
    langfuseTraceId: null,
    langfuseObservationId: null,
    payload: over.payload ?? {},
    schemaVersion: over.schemaVersion ?? CURRENT_SCHEMA_VERSION,
  } as RunEventRow;
}

const WINNER = { ...validCandidateIdeaCrossDomain, id: 'cand-win' };

function richRunLog(): RunEventRow[] {
  return [
    row({
      type: 'run.configured',
      sequence: 0,
      occurredAt: new Date('2026-06-26T10:00:00Z'),
      payload: { seed: 'Problem: smooth ER patient flow', rngSeed: 1 },
    }),
    row({ type: 'run.started', sequence: 1, payload: { from: 'configured', to: 'running' } }),
    row({ type: 'candidate.created', sequence: 2, candidateId: 'cand-win', payload: WINNER }),
    row({ type: 'generation.completed', sequence: 3, payload: {} }),
    row({ type: 'generation.completed', sequence: 4, payload: {} }),
    row({ type: 'agenome.reproduced', sequence: 5, payload: { mode: 'fusion' } }),
    row({ type: 'agenome.reproduced', sequence: 6, payload: { mode: 'fusion' } }),
    row({ type: 'agenome.reproduced', sequence: 7, payload: { mode: 'mutation_only' } }),
    row({ type: 'agenome.mutated', sequence: 8, payload: { outcomes: [] } }),
    row({
      type: 'lineage.culled',
      sequence: 9,
      payload: { targetIds: ['ag1'], reason: 'low', scoreSnapshot: {} },
    }),
    row({
      type: 'lineage.culled',
      sequence: 10,
      payload: { targetIds: ['ag2'], reason: 'low', scoreSnapshot: {} },
    }),
    row({
      type: 'run.completed',
      sequence: 11,
      payload: { finalIdeaRef: 'cand-win', from: 'running', to: 'completed' },
    }),
  ];
}

describe('buildRunSummary', () => {
  it('extracts run metadata, the final idea, and the activity counts', () => {
    const s = buildRunSummary(richRunLog());
    expect(s.runId).toBe('run_1');
    expect(s.status).toBe('completed');
    expect(s.sequenceThrough).toBe(11);
    expect(s.createdAt).toBe('2026-06-26T10:00:00.000Z');
    expect(s.problem).toBe('smooth ER patient flow'); // the "Problem:" label is stripped
    expect(s.finalIdeaTitle).toBe(WINNER.title);
    expect(s.finalIdeaSummary).toContain(WINNER.summary.slice(0, 16));
    expect(s.generations).toBe(2);
    expect(s.candidates).toBe(1);
    expect(s.reproductions).toBe(3);
    expect(s.culls).toBe(2);
    expect(s.mutations).toBe(1);
  });

  it('strips the "Problem:" label and reduces a verbose seed to its first-sentence title', () => {
    const verbose =
      'Problem:\nHospital ERs overflow during surges. Propose a cross-domain transfer, grounded in a proven technique, to smooth patient flow.';
    const log = richRunLog().map((e) =>
      e.type === 'run.configured'
        ? row({ ...e, type: 'run.configured', payload: { seed: verbose } })
        : e,
    );
    const s = buildRunSummary(log);
    expect(s.problem).toBe('Hospital ERs overflow during surges.'); // label stripped + first sentence
    expect(s.problem).not.toMatch(/^Problem:/i);
  });

  it('truncates a long problem (the list payload stays lean)', () => {
    const long = 'x'.repeat(1000);
    const log = richRunLog().map((e) =>
      e.type === 'run.configured'
        ? row({ ...e, type: 'run.configured', payload: { seed: long } })
        : e,
    );
    const s = buildRunSummary(log);
    expect(s.problem!.length).toBeLessThan(300);
    expect(s.problem!.endsWith('…')).toBe(true);
  });

  it('a run with no winner → null final idea, counts still computed', () => {
    const log = [
      row({
        type: 'run.configured',
        sequence: 0,
        occurredAt: new Date('2026-06-26T09:00:00Z'),
        payload: { seed: 'P' },
      }),
      row({ type: 'run.started', sequence: 1, payload: { from: 'configured', to: 'running' } }),
      row({
        type: 'candidate.created',
        sequence: 2,
        payload: { ...validCandidateIdeaCrossDomain, id: 'c1' },
      }),
      row({ type: 'run.failed', sequence: 3, payload: { from: 'running', to: 'failed' } }),
    ];
    const s = buildRunSummary(log);
    expect(s.status).toBe('failed');
    expect(s.finalIdeaTitle).toBeNull();
    expect(s.finalIdeaSummary).toBeNull();
    expect(s.candidates).toBe(1);
    expect(s.reproductions).toBe(0);
    expect(s.fitnessByGeneration).toEqual([]);
    expect(s.winnerFitness).toBeNull();
  });

  it('folds best fitness per generation (chronological) and the winner fitness', () => {
    const score = (id: string, candidateId: string, total: number) => ({
      id,
      candidateId,
      total,
      components: {},
      policyVersion: 'v1',
      explanation: 'x',
    });
    const log = [
      row({
        type: 'run.configured',
        sequence: 0,
        occurredAt: new Date('2026-06-26T10:00:00Z'),
        payload: { seed: 'P' },
      }),
      row({ type: 'run.started', sequence: 1, payload: { from: 'configured', to: 'running' } }),
      row({
        type: 'candidate.created',
        sequence: 2,
        generationId: 'genA',
        candidateId: 'cand-win',
        payload: { ...validCandidateIdeaCrossDomain, id: 'cand-win' },
      }),
      row({
        type: 'fitness.scored',
        sequence: 3,
        generationId: 'genA',
        candidateId: 'c1',
        payload: score('f1', 'c1', 0.4),
      }),
      row({
        type: 'fitness.scored',
        sequence: 4,
        generationId: 'genA',
        candidateId: 'cand-win',
        payload: score('f2', 'cand-win', 0.55),
      }),
      row({ type: 'generation.completed', sequence: 5, generationId: 'genA', payload: {} }),
      row({
        type: 'fitness.scored',
        sequence: 6,
        generationId: 'genB',
        candidateId: 'c2',
        payload: score('f3', 'c2', 0.72),
      }),
      row({ type: 'generation.completed', sequence: 7, generationId: 'genB', payload: {} }),
      row({
        type: 'run.completed',
        sequence: 8,
        generationId: 'genB',
        payload: { finalIdeaRef: 'cand-win', from: 'running', to: 'completed' },
      }),
    ];
    const s = buildRunSummary(log);
    expect(s.fitnessByGeneration).toEqual([0.55, 0.72]); // best per generation, in order
    expect(s.winnerFitness).toBe(0.55); // the selected candidate's own fitness
  });
});
