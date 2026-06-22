import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION,
  RunEventType,
  validCandidateIdeaCrossDomain,
  validCriticReview,
  validCheckResult,
  validNoveltyScore,
  validFitnessScore,
  validReproductionEvent,
  validCullingEvent,
  validJudgeResult,
} from '@doppl/contracts';
import {
  buildCurrentState,
  canonicalize,
  currentStateReducer,
  type RunEventRow,
} from '../../../src/projections';

/**
 * P6.2 — current-state projection (pure unit). spec(§9): a concrete reducer INJECTED into P6.1's
 * buildProjection (no hand-rolled fold) folds the closed RunEventType stream into current-state rows
 * for the 9 entities; rows are keyed by id + set (idempotent re-fold); terminal events move the
 * affected entity to its frozen-enum terminal status; novelty reads the persisted vector verbatim
 * (rule #7, no re-embed); non-current-state events (in-flight markers) fold to a no-op.
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

describe('buildCurrentState — concrete reducer over the P6.1 fold (spec §9)', () => {
  // §9 — a multi-entity stream produces a current-state row for all 9 entities. Positive guard.
  test('test_folds_each_entity_type', () => {
    const runId = 'run_1';
    const events: RunEventRow[] = [
      makeRow('run.configured', { runId, sequence: 0 }),
      makeRow('generation.started', { runId, generationId: 'gen_1', sequence: 1 }),
      makeRow('agenome.spawned', { runId, generationId: 'gen_1', agenomeId: 'agn_1', sequence: 2 }),
      makeRow('candidate.created', { runId, sequence: 3, payload: validCandidateIdeaCrossDomain }),
      makeRow('critic.reviewed', { runId, sequence: 4, payload: validCriticReview }),
      makeRow('check.completed', { runId, sequence: 5, payload: validCheckResult }),
      makeRow('novelty.scored', { runId, sequence: 6, payload: validNoveltyScore }),
      makeRow('fitness.scored', { runId, sequence: 7, payload: validFitnessScore }),
      // reproduction: parents agn_1 + agn_2 → child agn_3 (mode fusion); envelope.agenomeId = the
      // parent that reproduced.
      makeRow('agenome.reproduced', {
        runId,
        generationId: 'gen_1',
        agenomeId: 'agn_1',
        sequence: 8,
        payload: validReproductionEvent,
      }),
    ];
    const { state, sequenceThrough } = buildCurrentState(events);
    expect(sequenceThrough).toBe(8);

    expect(state.runs['run_1']?.status).toBe('configured');
    expect(state.generations['gen_1']?.status).toBe('running');
    expect(state.agenomes['agn_1']?.status).toBe('reproduced');
    expect(state.candidateIdeas['cand_1']).toEqual(validCandidateIdeaCrossDomain);
    expect(state.criticReviews['rev_1']).toEqual(validCriticReview);
    expect(state.checkResults['chk_1']).toEqual(validCheckResult);
    expect(state.noveltyScores['nov_1']).toEqual(validNoveltyScore);
    expect(state.fitnessScores['fit_1']).toEqual(validFitnessScore);
    // reproduction → one lineage edge per parent → child, type = mode.
    expect(state.lineageEdges['agn_1->agn_3']).toEqual({
      id: 'agn_1->agn_3',
      source: 'agn_1',
      target: 'agn_3',
      type: 'fusion',
    });
    expect(state.lineageEdges['agn_2->agn_3']?.target).toBe('agn_3');
  });

  // §9 — terminal/failure events move the affected entity to its frozen-enum terminal status. Per §5,
  // energy_exhausted is mid-flight (drain + score) and the FOLLOWING run.completed/run.failed sets the
  // run terminal — so energy_exhausted alone does NOT move the run terminal.
  test('test_terminal_events_move_to_terminal_state', () => {
    const failed = buildCurrentState([
      makeRow('run.configured', { runId: 'r_f', sequence: 0 }),
      makeRow('run.started', { runId: 'r_f', sequence: 1 }),
      makeRow('run.failed', { runId: 'r_f', sequence: 2 }),
    ]);
    expect(failed.state.runs['r_f']?.status).toBe('failed');

    const stopped = buildCurrentState([
      makeRow('run.started', { runId: 'r_s', sequence: 0 }),
      makeRow('run.stopped', { runId: 'r_s', sequence: 1 }),
    ]);
    expect(stopped.state.runs['r_s']?.status).toBe('stopped');

    const genFailed = buildCurrentState([
      makeRow('generation.started', { runId: 'r_g', generationId: 'g_1', sequence: 0 }),
      makeRow('generation_failed', { runId: 'r_g', generationId: 'g_1', sequence: 1 }),
    ]);
    expect(genFailed.state.generations['g_1']?.status).toBe('failed');

    // energy_exhausted is NOT itself a run-terminal (§5): the run stays 'running' until run.completed.
    const exhausted = buildCurrentState([
      makeRow('run.started', { runId: 'r_e', sequence: 0 }),
      makeRow('energy_exhausted', { runId: 'r_e', sequence: 1 }),
    ]);
    expect(exhausted.state.runs['r_e']?.status).toBe('running');
    const exhaustedThenDone = buildCurrentState([
      makeRow('run.started', { runId: 'r_e2', sequence: 0 }),
      makeRow('energy_exhausted', { runId: 'r_e2', sequence: 1 }),
      makeRow('run.completed', { runId: 'r_e2', sequence: 2 }),
    ]);
    expect(exhaustedThenDone.state.runs['r_e2']?.status).toBe('completed');
  });

  // §3/§9 (Step-2.5 TWEAK #2) — the generation-phase markers verifying/scoring/reproducing ARE durable
  // GenerationStatus phases (the frozen enum has them; these markers are their only source) → applied
  // to status. (The other 8 operation markers stay no-op — see test_non_current_state_event_is_noop.)
  test('test_generation_markers_advance_status', () => {
    const runId = 'run_1';
    const phased = buildCurrentState([
      makeRow('generation.started', { runId, generationId: 'gen_1', sequence: 0 }),
      makeRow('generation.verifying', { runId, generationId: 'gen_1', sequence: 1 }),
      makeRow('generation.scoring', { runId, generationId: 'gen_1', sequence: 2 }),
      makeRow('generation.reproducing', { runId, generationId: 'gen_1', sequence: 3 }),
    ]);
    expect(phased.state.generations['gen_1']?.status).toBe('reproducing');

    const verifying = buildCurrentState([
      makeRow('generation.started', { runId, generationId: 'g', sequence: 0 }),
      makeRow('generation.verifying', { runId, generationId: 'g', sequence: 1 }),
    ]);
    expect(verifying.state.generations['g']?.status).toBe('verifying');
  });

  // §9 — idempotent re-fold: rebuilding from the same log yields identical current-state (canonical-
  // serialization equal), and a duplicate-by-id event sets (does not duplicate) the row.
  test('test_idempotent_refold', () => {
    const runId = 'run_1';
    const events: RunEventRow[] = [
      makeRow('candidate.created', { runId, sequence: 0, payload: validCandidateIdeaCrossDomain }),
      // a second candidate.created for the SAME id at a later sequence → sets, never duplicates.
      makeRow('candidate.created', { runId, sequence: 1, payload: validCandidateIdeaCrossDomain }),
    ];
    const first = buildCurrentState(events);
    const second = buildCurrentState(events);
    expect(canonicalize(first.state)).toBe(canonicalize(second.state));
    expect(Object.keys(first.state.candidateIdeas)).toEqual(['cand_1']); // one row, no dupe
  });

  // rule #7 — novelty_scores reads the persisted vector + embeddingModelId + dimension verbatim; the
  // stored row equals the payload exactly (no re-embed / transform).
  test('test_novelty_reads_persisted_vector_no_reembed', () => {
    const { state } = buildCurrentState([
      makeRow('novelty.scored', { runId: 'run_1', sequence: 0, payload: validNoveltyScore }),
    ]);
    expect(state.noveltyScores['nov_1']).toEqual(validNoveltyScore);
    expect(state.noveltyScores['nov_1']?.vector).toEqual([0.12, -0.4, 0.91]);
    expect(state.noveltyScores['nov_1']?.embeddingModelId).toBe('text-embedding-3-small');
    expect(state.noveltyScores['nov_1']?.dimension).toBe(3);
  });

  // §9 — a non-current-state event (an in-flight marker / energy.spent) folds to a no-op for the
  // current-state rows (no corruption, no reject).
  test('test_non_current_state_event_is_noop', () => {
    const runId = 'run_1';
    const { state } = buildCurrentState([
      makeRow('run.configured', { runId, sequence: 0 }),
      makeRow('tool_call.started', { runId, sequence: 1 }), // in-flight marker → no-op
      makeRow('energy.spent', { runId, sequence: 2 }), // energy ledger → no current-state row
      makeRow('run.started', { runId, sequence: 3 }),
    ]);
    expect(state.runs['run_1']?.status).toBe('running'); // markers didn't corrupt the fold
    expect(Object.keys(state.runs)).toEqual(['run_1']); // no stray rows from the markers
  });

  // §9 / cull — lineage.culled moves the targeted entities (here candidates, per the fixture) to
  // 'culled'; the targeted candidates exist first.
  test('test_cull_moves_targets_to_culled', () => {
    const runId = 'run_1';
    const candC: typeof validCandidateIdeaCrossDomain = {
      ...validCandidateIdeaCrossDomain,
      id: 'cand_3',
      status: 'scored',
    };
    const candD: typeof validCandidateIdeaCrossDomain = {
      ...validCandidateIdeaCrossDomain,
      id: 'cand_4',
      status: 'scored',
    };
    const { state } = buildCurrentState([
      makeRow('candidate.created', { runId, sequence: 0, payload: candC }),
      makeRow('candidate.created', { runId, sequence: 1, payload: candD }),
      makeRow('lineage.culled', {
        runId,
        generationId: 'gen_1',
        sequence: 2,
        payload: validCullingEvent,
      }),
    ]);
    expect(state.candidateIdeas['cand_3']?.status).toBe('culled');
    expect(state.candidateIdeas['cand_4']?.status).toBe('culled');
  });

  // §4/§7 (sv5) — judge.reviewed projects its JudgeResult VERBATIM into a new judgeResults row keyed
  // by JudgeResult.id (mirrors noveltyScores/fitnessScores); rule #7 read-back, never re-judged.
  test('test_judge_reviewed_projects_judge_result', () => {
    const { state } = buildCurrentState([
      makeRow('judge.reviewed', { runId: 'run_1', sequence: 0, payload: validJudgeResult }),
    ]);
    expect(state.judgeResults['judge_1']).toEqual(validJudgeResult);
  });

  // §3/§9 (sv5) — the 4 new sv5 terminal events move the affected entity to its frozen terminal status
  // (mirrors candidate_invalidated→'invalid'): run.cancelled / generation.skipped / agenome.failed /
  // candidate.rejected.
  test('test_sv5_terminals_set_terminal_status', () => {
    const cancelled = buildCurrentState([
      makeRow('run.configured', { runId: 'r_c', sequence: 0 }),
      makeRow('run.cancelled', { runId: 'r_c', sequence: 1 }),
    ]);
    expect(cancelled.state.runs['r_c']?.status).toBe('cancelled');

    const skipped = buildCurrentState([
      makeRow('generation.started', { runId: 'r_g', generationId: 'g_1', sequence: 0 }),
      makeRow('generation.skipped', { runId: 'r_g', generationId: 'g_1', sequence: 1 }),
    ]);
    expect(skipped.state.generations['g_1']?.status).toBe('skipped');

    const agnFailed = buildCurrentState([
      makeRow('agenome.spawned', {
        runId: 'r_a',
        generationId: 'g_1',
        agenomeId: 'agn_1',
        sequence: 0,
      }),
      makeRow('agenome.failed', {
        runId: 'r_a',
        generationId: 'g_1',
        agenomeId: 'agn_1',
        sequence: 1,
      }),
    ]);
    expect(agnFailed.state.agenomes['agn_1']?.status).toBe('failed');

    const candRejected = buildCurrentState([
      makeRow('candidate.created', {
        runId: 'r_r',
        sequence: 0,
        payload: validCandidateIdeaCrossDomain,
      }),
      makeRow('candidate.rejected', { runId: 'r_r', candidateId: 'cand_1', sequence: 1 }),
    ]);
    expect(candRejected.state.candidateIdeas['cand_1']?.status).toBe('rejected');
  });

  // §3 (sv5) — the sv4 statuses generation 'degraded' / candidate 'repairing' are kernel-internal
  // state-machine states with NO RunEventType carrying them: NO event type folds an entity to those
  // statuses through the projection (display coverage is the web status-map's job, demo-029). Exhaustive
  // over the closed 41-member registry, folding each onto a running-generation + created-candidate seed.
  test('test_degraded_repairing_have_no_event_transition', () => {
    const { state: seed } = buildCurrentState([
      makeRow('generation.started', { runId: 'run_1', generationId: 'gen_1', sequence: 0 }),
      makeRow('candidate.created', {
        runId: 'run_1',
        sequence: 1,
        payload: validCandidateIdeaCrossDomain,
      }),
    ]);
    for (const type of RunEventType.options) {
      const next = currentStateReducer(
        seed,
        makeRow(type, {
          runId: 'run_1',
          generationId: 'gen_1',
          candidateId: 'cand_1',
          sequence: 2,
        }),
      );
      expect(
        next.generations['gen_1']?.status,
        `${type} must not drive generation to degraded`,
      ).not.toBe('degraded');
      expect(
        next.candidateIdeas['cand_1']?.status,
        `${type} must not drive candidate to repairing`,
      ).not.toBe('repairing');
    }
  });

  // §9 (sv5) — idempotent re-fold preserved for the new branches: re-applying the same judge.reviewed /
  // terminal event sets the same keyed row (never double-counts); a rebuild is canonical-equal.
  test('test_sv5_refold_idempotent', () => {
    const runId = 'run_1';
    const events: RunEventRow[] = [
      makeRow('judge.reviewed', { runId, sequence: 0, payload: validJudgeResult }),
      makeRow('judge.reviewed', { runId, sequence: 1, payload: validJudgeResult }),
      makeRow('run.cancelled', { runId, sequence: 2 }),
      makeRow('run.cancelled', { runId, sequence: 3 }),
    ];
    const first = buildCurrentState(events);
    const second = buildCurrentState(events);
    expect(canonicalize(first.state)).toBe(canonicalize(second.state));
    expect(Object.keys(first.state.judgeResults)).toEqual(['judge_1']); // one row, no dupe
    expect(first.state.runs[runId]?.status).toBe('cancelled');
  });

  // rule #7 — structural: the current-state reducer modules import no ModelGateway/provider/embedding.
  test('test_projection_imports_no_provider', () => {
    const dir = fileURLToPath(new URL('../../../src/projections/', import.meta.url));
    const files: string[] = [];
    const walk = (d: string): void => {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        if (entry.isDirectory()) walk(`${d}${entry.name}/`);
        else if (entry.name.endsWith('.ts')) files.push(`${d}${entry.name}`);
      }
    };
    walk(dir);
    expect(files.length).toBeGreaterThan(0);
    const forbidden =
      /from\s+['"][^'"]*(model-gateway|gateway|openai|@anthropic|openrouter|embedding)/i;
    for (const f of files) {
      expect(forbidden.test(readFileSync(f, 'utf8')), `${f} must not import a provider`).toBe(
        false,
      );
    }
  });
});
