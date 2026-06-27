import { describe, expect, test } from 'vitest';
import { CURRENT_SCHEMA_VERSION, validCandidateIdeaCrossDomain } from '@doppl/contracts';
import { buildCurrentState, canonicalize, type RunEventRow } from '../../../src/projections';

/**
 * PD.11 — final-idea winner projection bridge (pure unit). spec(§10/§3/§12): the kernel records the
 * winner as `run.completed.finalIdeaRef` (terminalClassifier, the top `fitness.scored ∧ ¬lineage.culled`
 * survivor) but no projection ever produced the `'selected'` candidate status that lineage-graph (→ web
 * `selectWinner`), replay-summary, and the PD.7 final-idea panel all read. A new pure `winnerReducer`,
 * appended LAST to the composed current-state REDUCERS, marks the `finalIdeaRef` candidate `'selected'`
 * — DERIVED from the kernel signal, never fabricated. ZERO new contract surface (`CandidateStatus`
 * already includes `'selected'`).
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

/** A scored (non-'selected') survivor — the kernel's `finalIdeaRef` is by construction a scored survivor. */
const scoredCandidate = { ...validCandidateIdeaCrossDomain, status: 'scored' as const };

describe('winnerReducer — marks the run.completed finalIdeaRef candidate selected (spec §10/§3/§12)', () => {
  // §10 winner = candidate node status 'selected'; §3 scored → selected; §12/§17 the headline. Positive
  // guard: the bridge DERIVES 'selected' from the kernel signal (candidate status not pre-set).
  test('test_run_completed_marks_finalIdeaRef_candidate_selected', () => {
    const { state } = buildCurrentState([
      makeRow('candidate.created', { runId: 'run_1', sequence: 0, payload: scoredCandidate }),
      makeRow('run.completed', {
        runId: 'run_1',
        sequence: 1,
        payload: { from: 'running', to: 'completed', finalIdeaRef: 'cand_1' },
      }),
    ]);
    expect(state.candidateIdeas['cand_1']?.status).toBe('selected');
  });

  // Islands pivot A2 — multi-winner: run.completed.finalIdeaRefs[] marks EACH crowned candidate 'selected'.
  test('test_finalIdeaRefs_marks_all_winners_selected', () => {
    const { state } = buildCurrentState([
      makeRow('candidate.created', { runId: 'run_1', sequence: 0, payload: scoredCandidate }),
      makeRow('candidate.created', {
        runId: 'run_1',
        sequence: 1,
        payload: { ...validCandidateIdeaCrossDomain, id: 'cand_2', status: 'scored' },
      }),
      makeRow('run.completed', {
        runId: 'run_1',
        sequence: 2,
        payload: { from: 'running', to: 'completed', finalIdeaRefs: ['cand_1', 'cand_2'] },
      }),
    ]);
    expect(state.candidateIdeas['cand_1']?.status).toBe('selected');
    expect(state.candidateIdeas['cand_2']?.status).toBe('selected');
  });

  // finalIdeaRefs[] (the multi-winner field) is PREFERRED over the singular finalIdeaRef when both are present.
  test('test_finalIdeaRefs_preferred_over_singular', () => {
    const { state } = buildCurrentState([
      makeRow('candidate.created', { runId: 'run_1', sequence: 0, payload: scoredCandidate }),
      makeRow('candidate.created', {
        runId: 'run_1',
        sequence: 1,
        payload: { ...validCandidateIdeaCrossDomain, id: 'cand_2', status: 'scored' },
      }),
      makeRow('run.completed', {
        runId: 'run_1',
        sequence: 2,
        payload: {
          from: 'running',
          to: 'completed',
          finalIdeaRef: 'cand_1',
          finalIdeaRefs: ['cand_2'],
        },
      }),
    ]);
    expect(state.candidateIdeas['cand_2']?.status).toBe('selected');
    expect(state.candidateIdeas['cand_1']?.status).toBe('scored'); // array preferred → cand_1 not crowned
  });

  // An empty finalIdeaRefs:[] (survivors existed but none cleared the crowning floor) marks NO winner.
  test('test_empty_finalIdeaRefs_marks_no_winner', () => {
    const { state } = buildCurrentState([
      makeRow('candidate.created', { runId: 'run_1', sequence: 0, payload: scoredCandidate }),
      makeRow('run.completed', {
        runId: 'run_1',
        sequence: 1,
        payload: { from: 'running', to: 'completed', finalIdeaRefs: [] },
      }),
    ]);
    expect(Object.values(state.candidateIdeas).some((c) => c.status === 'selected')).toBe(false);
  });

  // rule #6 / §3 — no fabrication: a run.completed with no finalIdeaRef marks no winner (the PD.7
  // terminal zero-survivors path stays honest).
  test('test_no_finalIdeaRef_marks_no_winner', () => {
    const { state } = buildCurrentState([
      makeRow('candidate.created', { runId: 'run_1', sequence: 0, payload: scoredCandidate }),
      makeRow('run.completed', {
        runId: 'run_1',
        sequence: 1,
        payload: { from: 'running', to: 'completed' },
      }),
    ]);
    expect(state.candidateIdeas['cand_1']?.status).toBe('scored'); // unchanged
    expect(Object.values(state.candidateIdeas).some((c) => c.status === 'selected')).toBe(false);
  });

  // §3 — a failed run is winnerless (run.failed carries no_scored_survivor, no finalIdeaRef).
  test('test_run_failed_marks_no_winner', () => {
    const { state } = buildCurrentState([
      makeRow('candidate.created', { runId: 'run_1', sequence: 0, payload: scoredCandidate }),
      makeRow('run.failed', {
        runId: 'run_1',
        sequence: 1,
        payload: { from: 'running', to: 'failed', reason: 'no_scored_survivor' },
      }),
    ]);
    expect(Object.values(state.candidateIdeas).some((c) => c.status === 'selected')).toBe(false);
  });

  // robustness — a finalIdeaRef referencing a non-materialized candidate is a defensive no-op (mirrors
  // candidate_invalidated/candidate.rejected's existing===undefined guard): no crash, no phantom row.
  test('test_finalIdeaRef_to_absent_candidate_is_noop', () => {
    const { state } = buildCurrentState([
      makeRow('candidate.created', { runId: 'run_1', sequence: 0, payload: scoredCandidate }),
      makeRow('run.completed', {
        runId: 'run_1',
        sequence: 1,
        payload: { from: 'running', to: 'completed', finalIdeaRef: 'ghost' },
      }),
    ]);
    expect(state.candidateIdeas['ghost']).toBeUndefined(); // no phantom node
    expect(Object.keys(state.candidateIdeas)).toEqual(['cand_1']); // only the materialized candidate
    expect(state.candidateIdeas['cand_1']?.status).toBe('scored'); // untouched
  });

  // §10/§3 — selectivity: the bridge marks EXACTLY the finalIdeaRef candidate by id, never a sibling,
  // never clobbering another candidate's status (acceptance #1 "the candidate whose id == finalIdeaRef").
  test('test_marks_only_finalIdeaRef_among_multiple_survivors', () => {
    const cand1 = { ...validCandidateIdeaCrossDomain, id: 'cand_1', status: 'scored' as const };
    const cand2 = { ...validCandidateIdeaCrossDomain, id: 'cand_2', status: 'scored' as const };
    const cand3 = { ...validCandidateIdeaCrossDomain, id: 'cand_3', status: 'culled' as const };
    const { state } = buildCurrentState([
      makeRow('candidate.created', { runId: 'run_1', sequence: 0, payload: cand1 }),
      makeRow('candidate.created', { runId: 'run_1', sequence: 1, payload: cand2 }),
      makeRow('candidate.created', { runId: 'run_1', sequence: 2, payload: cand3 }),
      makeRow('run.completed', {
        runId: 'run_1',
        sequence: 3,
        payload: { from: 'running', to: 'completed', finalIdeaRef: 'cand_2' },
      }),
    ]);
    expect(state.candidateIdeas['cand_2']?.status).toBe('selected'); // exactly the finalIdeaRef
    expect(state.candidateIdeas['cand_1']?.status).toBe('scored'); // sibling untouched
    expect(state.candidateIdeas['cand_3']?.status).toBe('culled'); // sibling untouched
  });

  // §9 — idempotent re-fold: re-applying the log (and a duplicate run.completed) yields exactly one
  // 'selected' candidate (the bridge is a pure SET, not an accumulate); a rebuild is canonical-equal.
  test('test_idempotent_refold_single_selected', () => {
    const events = [
      makeRow('candidate.created', { runId: 'run_1', sequence: 0, payload: scoredCandidate }),
      makeRow('run.completed', {
        runId: 'run_1',
        sequence: 1,
        payload: { from: 'running', to: 'completed', finalIdeaRef: 'cand_1' },
      }),
      makeRow('run.completed', {
        runId: 'run_1',
        sequence: 2,
        payload: { from: 'running', to: 'completed', finalIdeaRef: 'cand_1' },
      }),
    ];
    const first = buildCurrentState(events);
    const second = buildCurrentState(events);
    expect(canonicalize(first.state)).toBe(canonicalize(second.state));
    expect(
      Object.values(first.state.candidateIdeas).filter((c) => c.status === 'selected'),
    ).toHaveLength(1);
  });
});
