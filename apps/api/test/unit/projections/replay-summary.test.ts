import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION,
  validCandidateIdeaCrossDomain,
  validNoveltyScore,
  validFitnessScore,
  validReproductionEvent,
} from '@doppl/contracts';
import {
  buildCurrentState,
  buildReplaySummary,
  canonicalize,
  type RunEventRow,
} from '../../../src/projections';
import { OLDER_SCHEMA_RUN } from '../../fixtures/replay/older-schema-run';

/**
 * P6.4 — replay-summary projection (pure unit, KEY SAFETY RULE #7). spec(§16/§9): replay rebuilds a
 * seed-to-summary projection PURELY from the persisted, ordered run_events — ZERO model/web/embedding
 * calls. State-equivalence: canonicalize(replay) === canonicalize(captured). RNG/embedding/retrieval
 * outcomes are read from their persisted events (never re-sampled/re-embedded/re-called). An older-
 * schemaVersion fixture replays (≤ current gate).
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

function fullRun(runId: string): RunEventRow[] {
  const winner = { ...validCandidateIdeaCrossDomain, status: 'selected' as const };
  return [
    makeRow('run.configured', {
      runId,
      sequence: 0,
      payload: { seed: 'scenario-alpha', rngSeed: 42 },
    }),
    makeRow('generation.started', { runId, generationId: 'gen_1', sequence: 1 }),
    makeRow('agenome.spawned', { runId, generationId: 'gen_1', agenomeId: 'agn_1', sequence: 2 }),
    makeRow('candidate.created', { runId, sequence: 3, payload: winner }),
    makeRow('novelty.scored', { runId, sequence: 4, payload: validNoveltyScore }),
    makeRow('fitness.scored', { runId, sequence: 5, payload: validFitnessScore }),
    makeRow('agenome.reproduced', {
      runId,
      generationId: 'gen_1',
      agenomeId: 'agn_1',
      sequence: 6,
      payload: validReproductionEvent,
    }),
    makeRow('run.completed', { runId, sequence: 7 }),
  ];
}

describe('buildReplaySummary — replay-determinism over the persisted log (spec §16/§9, rule #7)', () => {
  // §16 — the replayed projection is byte-equal to the captured projection over the canonical
  // serialization (state-equivalence). Positive guard.
  test('test_replay_state_equivalent_to_captured', () => {
    const events = fullRun('run_1');
    const replay = buildReplaySummary(events);
    const captured = buildCurrentState(events);
    expect(canonicalize(replay.state)).toBe(canonicalize(captured.state));
    expect(replay.sequenceThrough).toBe(captured.sequenceThrough);
  });

  // rule #7 — reproduction RNG outcomes are read from the persisted ReproductionEvent payload (the
  // persisted mode surfaces in the lineage edge), never regenerated; the fold is deterministic.
  test('test_replay_reads_persisted_rng_never_resamples', () => {
    const events = fullRun('run_1');
    const replay = buildReplaySummary(events);
    expect(replay.state.lineageEdges['agn_1->agn_3']?.type).toBe('fusion'); // persisted mode read back
    // deterministic — a second replay of the same persisted log is byte-identical (no re-sampling).
    expect(canonicalize(buildReplaySummary(events).state)).toBe(canonicalize(replay.state));
  });

  // rule #7 / §9 — persisted novelty embedding vectors are read back verbatim, never re-embedded.
  test('test_replay_reads_persisted_embeddings_never_reembeds', () => {
    const replay = buildReplaySummary(fullRun('run_1'));
    expect(replay.state.noveltyScores['nov_1']?.vector).toEqual(validNoveltyScore.vector);
    expect(replay.state.noveltyScores['nov_1']?.embeddingModelId).toBe(
      validNoveltyScore.embeddingModelId,
    );
  });

  // rule #7 — a persisted retrieval/web result (here on a tool_call.finished event) is read from the
  // log; replay never re-calls the web (the summary builds without any provider call).
  test('test_replay_reads_persisted_retrieval_never_recalls', () => {
    const events = [
      makeRow('run.configured', { runId: 'run_1', sequence: 0, payload: { seed: 's' } }),
      makeRow('tool_call.finished', {
        runId: 'run_1',
        sequence: 1,
        payload: { tool: 'web_search', retrievalResult: 'persisted web text, not re-fetched' },
      }),
      makeRow('run.completed', { runId: 'run_1', sequence: 2 }),
    ];
    expect(() => buildReplaySummary(events)).not.toThrow();
    expect(buildReplaySummary(events).runId).toBe('run_1');
  });

  // rule #7 (HEADLINE) — structural: the replay modules import NO provider/embedding/web symbol and
  // make no RNG draw (Math.random) or web call (fetch). Positive-guarded so RED isn't vacuous.
  test('test_replay_imports_no_provider', () => {
    const files = ['replay-reader.ts', 'replay-summary.ts'].map((f) =>
      readFileSync(
        fileURLToPath(new URL(`../../../src/projections/${f}`, import.meta.url)),
        'utf8',
      ),
    );
    expect(files.length).toBe(2);
    const importBan =
      /from\s+['"][^'"]*(model-gateway|gateway|openai|@anthropic|openrouter|embedding|retrieval|web-search|axios|node-fetch|undici|node:http)/i;
    for (const src of files) {
      expect(src.length).toBeGreaterThan(0);
      expect(importBan.test(src)).toBe(false);
      // match actual CALLS (`Math.random(` / `fetch(`), not prose mentions in docstrings.
      expect(/Math\.random\s*\(/.test(src)).toBe(false); // no RNG re-sampling
      expect(/\bfetch\s*\(/.test(src)).toBe(false); // no web re-call
    }
  });

  // §16 — a committed schemaVersion < current fixture replays successfully (readers accept ≤ current)
  // and folds to a valid summary.
  test('test_older_schema_version_fixture_replays', () => {
    expect(OLDER_SCHEMA_RUN.every((e) => e.schemaVersion < CURRENT_SCHEMA_VERSION)).toBe(true);
    const replay = buildReplaySummary(OLDER_SCHEMA_RUN);
    expect(replay.runId).toBe('older-run');
    expect(replay.digest.seed).toBe('scenario-older');
    expect(replay.state.candidateIdeas['cand_1']).toBeDefined();
  });

  // seed-to-summary — the digest carries seed (run.configured), generation count, final selected
  // candidate, and the fitness-over-time digest.
  test('test_replay_summary_header', () => {
    const replay = buildReplaySummary(fullRun('run_1'));
    expect(replay.digest.seed).toBe('scenario-alpha');
    expect(replay.digest.generationCount).toBe(1);
    expect(replay.digest.selectedCandidateId).toBe('cand_1'); // the status-'selected' winner
    expect(replay.digest.fitnessOverTime).toEqual([validFitnessScore.total]);
  });
});
