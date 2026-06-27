import { describe, it, expect } from 'vitest';
import { CURRENT_SCHEMA_VERSION, validCandidateIdeaCrossDomain } from '@doppl/contracts';
import type { RunEventType } from '@doppl/contracts';
import type { RunEventRow } from '../../../src/event-store';
import { buildCaseStudyGraph } from '../../../src/projections/case-study-graph';

/**
 * CaseStudyGraph projection (Islands pivot A3) — the first CROSS-RUN read model: case study → runs →
 * doppels. Composes N per-run current-state folds (never a mixed-run fold). Pure / rebuildable (rule #7).
 */

let autoSeq = 0;
function row(over: Partial<RunEventRow> & { type: RunEventType; runId: string }): RunEventRow {
  const sequence = over.sequence ?? autoSeq++;
  return {
    id: over.id ?? `e-${over.runId}-${sequence}`,
    runId: over.runId,
    generationId: over.generationId ?? null,
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

/** A run with one candidate crowned as the winner, configured against `caseStudyId` at `createdAt`. */
function runWithWinner(runId: string, caseStudyId: string, createdAt: string): RunEventRow[] {
  const cand = { ...validCandidateIdeaCrossDomain, id: `${runId}-c1` };
  return [
    row({
      type: 'run.configured',
      runId,
      sequence: 0,
      occurredAt: new Date(createdAt),
      payload: { seed: 'Problem: smooth ER patient flow', caseStudyId },
    }),
    row({
      type: 'run.started',
      runId,
      sequence: 1,
      payload: { from: 'configured', to: 'running' },
    }),
    row({ type: 'candidate.created', runId, sequence: 2, candidateId: cand.id, payload: cand }),
    row({
      type: 'run.completed',
      runId,
      sequence: 3,
      payload: { from: 'running', to: 'completed', finalIdeaRefs: [cand.id] },
    }),
  ];
}

describe('buildCaseStudyGraph', () => {
  it('groups runs under the case study with each run’s doppels (the crowned winners)', () => {
    const graph = buildCaseStudyGraph('cs_er_flow', [
      runWithWinner('run_a', 'cs_er_flow', '2026-06-26T10:00:00Z'),
    ]);
    expect(graph.caseStudyId).toBe('cs_er_flow');
    expect(graph.runs).toHaveLength(1);
    const run = graph.runs[0]!;
    expect(run.runId).toBe('run_a');
    expect(run.status).toBe('completed');
    expect(run.problem).toBe('smooth ER patient flow'); // "Problem:" stripped, first sentence
    expect(run.createdAt).toBe('2026-06-26T10:00:00.000Z');
    expect(run.doppels).toHaveLength(1);
    expect(run.doppels[0]!.candidateId).toBe('run_a-c1');
    expect(run.doppels[0]!.title).toBe(validCandidateIdeaCrossDomain.title);
  });

  it('orders runs newest-first across the case study (the bloom traversal)', () => {
    const graph = buildCaseStudyGraph('cs_x', [
      runWithWinner('run_old', 'cs_x', '2026-06-20T10:00:00Z'),
      runWithWinner('run_new', 'cs_x', '2026-06-27T10:00:00Z'),
    ]);
    expect(graph.runs.map((r) => r.runId)).toEqual(['run_new', 'run_old']);
  });

  it('a run with no crowned winner contributes a node with zero doppels (an island, no doppel)', () => {
    const noWinner = [
      row({
        type: 'run.configured',
        runId: 'run_empty',
        sequence: 0,
        occurredAt: new Date('2026-06-26T10:00:00Z'),
        payload: { seed: 'P', caseStudyId: 'cs_x' },
      }),
      row({
        type: 'run.failed',
        runId: 'run_empty',
        sequence: 1,
        payload: { from: 'running', to: 'failed', reason: 'no_scored_survivor' },
      }),
    ];
    const graph = buildCaseStudyGraph('cs_x', [noWinner]);
    expect(graph.runs).toHaveLength(1);
    expect(graph.runs[0]!.status).toBe('failed');
    expect(graph.runs[0]!.doppels).toEqual([]);
  });

  it('an empty case study (no runs) → a valid empty graph', () => {
    expect(buildCaseStudyGraph('cs_none', [])).toEqual({ caseStudyId: 'cs_none', runs: [] });
  });
});
