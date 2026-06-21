import { afterAll, beforeAll, describe, expect, inject, test } from 'vitest';
import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  validCandidateIdeaCrossDomain,
  validCriticReview,
  validCheckResult,
  validNoveltyScore,
  validFitnessScore,
} from '@doppl/contracts';
import { createEventStore, type AppendInput, type EventStore } from '../../../src/event-store';
import { buildCurrentState, canonicalize } from '../../../src/projections';

/**
 * P6.2 — current-state projection (integration, testcontainers/real PG). The reducer folds over the
 * REAL authoritative log (append → readByRun), no mock on the truth path (§9). Rebuild is idempotent
 * (canonical-serialization equal).
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

describe('current-state projection — fold over the real authoritative log (spec §9)', () => {
  async function appendRealSequence(runId: string): Promise<void> {
    await store.append(input('run.configured', { runId }));
    await store.append(input('generation.started', { runId, generationId: 'gen_1' }));
    await store.append(
      input('agenome.spawned', { runId, generationId: 'gen_1', agenomeId: 'agn_1' }),
    );
    await store.append(
      input('candidate.created', { runId, payload: validCandidateIdeaCrossDomain }),
    );
    await store.append(input('critic.reviewed', { runId, payload: validCriticReview }));
    await store.append(input('check.completed', { runId, payload: validCheckResult }));
    await store.append(input('novelty.scored', { runId, payload: validNoveltyScore }));
    await store.append(input('fitness.scored', { runId, payload: validFitnessScore }));
    await store.append(input('run.completed', { runId }));
  }

  // §9 — append a realistic multi-entity sequence via the REAL writer, readByRun, fold → correct
  // current-state + sequenceThrough (no mock on the truth-log path).
  test('test_fold_over_real_appended_log', async () => {
    const runId = 'cs-real';
    await appendRealSequence(runId);
    const events = await store.readByRun(runId);
    const { state, sequenceThrough } = buildCurrentState(events);
    expect(sequenceThrough).toBe(8); // 9 events, sequences 0..8
    expect(state.runs[runId]?.status).toBe('completed');
    expect(state.generations['gen_1']?.status).toBe('running');
    expect(state.agenomes['agn_1']?.status).toBe('seeded');
    expect(state.candidateIdeas['cand_1']).toEqual(validCandidateIdeaCrossDomain);
    expect(state.noveltyScores['nov_1']?.vector).toEqual([0.12, -0.4, 0.91]); // persisted vector intact
    expect(state.fitnessScores['fit_1']?.total).toBe(0.81);
  });

  // §9 — rebuild from the real log is idempotent: a second fold yields a canonical-serialization-equal
  // current-state.
  test('test_rebuild_idempotent_over_real_log', async () => {
    const runId = 'cs-rebuild';
    await appendRealSequence(runId);
    const first = buildCurrentState(await store.readByRun(runId));
    const second = buildCurrentState(await store.readByRun(runId));
    expect(canonicalize(first.state)).toBe(canonicalize(second.state));
  });
});
