import { afterAll, beforeAll, describe, expect, inject, test } from 'vitest';
import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  LineageGraphProjection,
  validCandidateIdeaCrossDomain,
  validCriticReview,
  validCheckResult,
  validFitnessScore,
  validReproductionEvent,
} from '@doppl/contracts';
import { createEventStore, type AppendInput, type EventStore } from '../../../src/event-store';
import { buildCurrentState, buildLineageGraph } from '../../../src/projections';

/**
 * P6.3 — lineage-graph projection (integration, testcontainers/real PG). append → buildCurrentState →
 * buildLineageGraph over the REAL authoritative log (§10); output conforms to the frozen P0.13 contract.
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

describe('lineage-graph projection — over the real authoritative log (spec §10)', () => {
  // §10 — append a multi-entity + reproduction sequence via the real writer → buildCurrentState →
  // buildLineageGraph; assert nodes/edges/sequenceThrough + frozen-contract conformance.
  test('test_lineage_over_real_appended_log', async () => {
    const runId = 'lg-real';
    await store.append(input('generation.started', { runId, generationId: 'gen_1' }));
    await store.append(
      input('agenome.spawned', { runId, generationId: 'gen_1', agenomeId: 'agn_1' }),
    );
    await store.append(
      input('candidate.created', { runId, payload: validCandidateIdeaCrossDomain }),
    );
    await store.append(input('critic.reviewed', { runId, payload: validCriticReview }));
    await store.append(input('check.completed', { runId, payload: validCheckResult }));
    await store.append(input('fitness.scored', { runId, payload: validFitnessScore }));
    await store.append(
      input('agenome.reproduced', {
        runId,
        generationId: 'gen_1',
        agenomeId: 'agn_1',
        payload: validReproductionEvent,
      }),
    );

    const cs = buildCurrentState(await store.readByRun(runId));
    const graph = buildLineageGraph(cs);

    expect(graph.runId).toBe(runId);
    expect(graph.sequenceThrough).toBe(cs.sequenceThrough);
    expect(graph.nodes.some((n) => n.type === 'candidate' && n.id === 'cand_1')).toBe(true);
    expect(graph.nodes.some((n) => n.type === 'score' && n.id === 'fit_1')).toBe(true);
    expect(graph.edges.some((e) => e.source === 'agn_1' && e.target === 'agn_3')).toBe(true);
    expect(LineageGraphProjection.safeParse(graph).success).toBe(true);
  });
});
