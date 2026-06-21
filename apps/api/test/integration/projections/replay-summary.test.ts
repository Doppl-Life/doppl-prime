import { afterAll, beforeAll, describe, expect, inject, test } from 'vitest';
import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  validCandidateIdeaCrossDomain,
  validNoveltyScore,
  validFitnessScore,
} from '@doppl/contracts';
import { createEventStore, type AppendInput, type EventStore } from '../../../src/event-store';
import {
  buildCurrentState,
  buildReplaySummary,
  canonicalize,
  createReplayReader,
} from '../../../src/projections';

/**
 * P6.4 — replay-summary (integration, testcontainers/real PG, rule #7). Append a full run via the real
 * writer → the replay reader (readByRun only, no providers) → buildReplaySummary; assert state-
 * equivalence to buildCurrentState over the same persisted log + the digest header (§16).
 */

let pool: pg.Pool;
let db: NodePgDatabase;
let store: EventStore;
let idCounter = 0;

function input(type: string, fields: Partial<AppendInput> & { runId: string }): AppendInput {
  return {
    id: `evt-${fields.runId}-${idCounter++}`,
    runId: fields.runId,
    type: type as AppendInput['type'],
    actor: 'runtime',
    payload: fields.payload ?? {},
    schemaVersion: 2,
    ...(fields.generationId !== undefined ? { generationId: fields.generationId } : {}),
    ...(fields.agenomeId !== undefined ? { agenomeId: fields.agenomeId } : {}),
  };
}

beforeAll(() => {
  pool = new pg.Pool({ connectionString: inject('pgConnectionUri') });
  db = drizzle(pool);
  store = createEventStore({ db, secretValues: [] });
});

afterAll(async () => {
  await pool.end();
});

describe('replay-summary — over the real authoritative log (spec §16, rule #7)', () => {
  // §16 — append a full run via the real writer → replay reader → buildReplaySummary; the replayed
  // projection is state-equivalent to buildCurrentState over the same persisted log, and the digest
  // carries the seed/winner/fitness.
  test('test_replay_over_real_appended_log', async () => {
    const runId = 'replay-real';
    const winner = { ...validCandidateIdeaCrossDomain, status: 'selected' as const };
    await store.append(
      input('run.configured', { runId, payload: { seed: 'scenario-real', rngSeed: 9 } }),
    );
    await store.append(input('generation.started', { runId, generationId: 'gen_1' }));
    await store.append(
      input('agenome.spawned', { runId, generationId: 'gen_1', agenomeId: 'agn_1' }),
    );
    await store.append(input('candidate.created', { runId, payload: winner }));
    await store.append(input('novelty.scored', { runId, payload: validNoveltyScore }));
    await store.append(input('fitness.scored', { runId, payload: validFitnessScore }));
    await store.append(input('run.completed', { runId }));

    const reader = createReplayReader(store);
    const events = await reader.read(runId);
    const replay = buildReplaySummary(events);
    const captured = buildCurrentState(events);

    // state-equivalence over the canonical serialization (the replay-determinism contract).
    expect(canonicalize(replay.state)).toBe(canonicalize(captured.state));
    // persisted embedding vector read back verbatim (never re-embedded).
    expect(replay.state.noveltyScores['nov_1']?.vector).toEqual(validNoveltyScore.vector);
    // digest header.
    expect(replay.digest.seed).toBe('scenario-real');
    expect(replay.digest.selectedCandidateId).toBe('cand_1');
    expect(replay.digest.fitnessOverTime).toEqual([validFitnessScore.total]);
  });
});
