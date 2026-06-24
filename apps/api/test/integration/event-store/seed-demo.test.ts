import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, inject, test } from 'vitest';
import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { CURRENT_SCHEMA_VERSION } from '@doppl/contracts';
import {
  createEventStore,
  runMigrations,
  type AppendInput,
  type EventStore,
} from '../../../src/event-store';
import { buildCurrentState } from '../../../src/projections';
import { isRunTerminal } from '../../../src/runtime/worker/activeRunGuard';
import { dumpReplayToFile } from '../../../src/event-store/scripts/dump-replay';
import { seedDemo } from '../../../src/event-store/scripts/seed-demo';

/**
 * PD.2 seed-demo — real-PG restore (ARCHITECTURE.md §17/§9/§4, KEY SAFETY RULES #2/#7). Load a committed
 * fixture into a fresh demo DB via a DIRECT insert preserving the recorded (sequence, occurredAt) exactly
 * (the append path re-allocates sequence + stamps now(), so it can't restore); idempotent on the unique
 * (run_id, sequence); refuses without migrations; closes the dump → seed → replay-equivalent loop.
 *
 * Each test boots its OWN database (CREATE DATABASE) — a restore inserts a specific runId, so it must not
 * pre-exist + must control whether migrations have run.
 */

let adminPool: pg.Pool;
let baseUri: string;
let tmpDir: string;
let dbc = 0;
const created: { pool: pg.Pool; name: string }[] = [];

beforeAll(() => {
  baseUri = inject('pgConnectionUri');
  adminPool = new pg.Pool({ connectionString: baseUri });
  tmpDir = mkdtempSync(join(tmpdir(), 'doppl-seed-'));
});

afterAll(async () => {
  for (const c of created) await c.pool.end();
  for (const c of created)
    await adminPool.query(`DROP DATABASE IF EXISTS "${c.name}" WITH (FORCE)`);
  await adminPool.end();
  rmSync(tmpDir, { recursive: true, force: true });
});

async function freshDb(migrate: boolean): Promise<{ db: NodePgDatabase; store: EventStore }> {
  const name = `doppl_seed_${dbc++}`;
  await adminPool.query(`CREATE DATABASE "${name}"`);
  const uri = new URL(baseUri);
  uri.pathname = `/${name}`;
  if (migrate) await runMigrations(uri.toString());
  const pool = new pg.Pool({ connectionString: uri.toString() });
  created.push({ pool, name });
  const db = drizzle(pool);
  return { db, store: createEventStore({ db, secretValues: [] }) };
}

/** A serialized fixture row (occurredAt as the recorded ISO string — the on-disk shape PD.1 wrote). */
function fixtureRow(
  runId: string,
  sequence: number,
  type: string,
  occurredAt: string,
  payload: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: `${runId}-${sequence}`,
    runId,
    generationId: null,
    agenomeId: null,
    candidateId: null,
    type,
    sequence,
    occurredAt,
    actor: 'runtime',
    correlationId: null,
    langfuseTraceId: null,
    langfuseObservationId: null,
    payload,
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
}

function writeFixture(runId: string, events: Record<string, unknown>[]): void {
  writeFileSync(
    join(tmpDir, `${runId}.json`),
    JSON.stringify({ schemaVersion: CURRENT_SCHEMA_VERSION, runId, events }, null, 2),
  );
}

const evt = (
  runId: string,
  type: AppendInput['type'],
  payload: Record<string, unknown> = {},
): AppendInput => ({
  id: `${runId}-${type}`,
  runId,
  type,
  actor: 'runtime',
  payload,
  schemaVersion: CURRENT_SCHEMA_VERSION,
});

describe('seed-demo — PD.2 prepared-replay restore (real PG)', () => {
  // spec(§4/§9) — a direct restore preserves the RECORDED sequence + occurredAt (not now()) exactly.
  test('seed_inserts_preserving_sequence_and_occurred_at', async () => {
    const { db, store } = await freshDb(true);
    const runId = `seed-pres-${dbc}`;
    const t0 = '2023-11-14T22:13:20.000Z'; // a fixed PAST instant — provably not now()
    writeFixture(runId, [
      fixtureRow(runId, 0, 'run.configured', t0, { rngSeed: 5 }),
      fixtureRow(runId, 1, 'run.started', '2023-11-14T22:13:21.000Z', {
        from: 'configured',
        to: 'running',
      }),
      fixtureRow(runId, 2, 'run.completed', '2023-11-14T22:13:22.000Z', {
        from: 'running',
        to: 'completed',
      }),
    ]);

    const result = await seedDemo({ db, dir: tmpDir, runId });
    expect(result.rows).toBe(3);

    const rows = await store.readByRun(runId);
    expect(rows.map((r) => r.sequence)).toEqual([0, 1, 2]);
    expect(rows.map((r) => r.type)).toEqual(['run.configured', 'run.started', 'run.completed']);
    expect(rows[0]!.occurredAt.toISOString()).toBe(t0); // recorded instant preserved, NOT now()
    expect((rows[0]!.payload as { rngSeed?: number }).rngSeed).toBe(5);
  });

  // spec(idempotent) — re-seeding is a clean no-op: onConflictDoNothing on (run_id, sequence), no duplication.
  test('seed_idempotent_reseed', async () => {
    const { db, store } = await freshDb(true);
    const runId = `seed-idem-${dbc}`;
    writeFixture(runId, [
      fixtureRow(runId, 0, 'run.configured', '2023-11-14T00:00:00.000Z'),
      fixtureRow(runId, 1, 'run.started', '2023-11-14T00:00:01.000Z'),
      fixtureRow(runId, 2, 'run.stopped', '2023-11-14T00:00:02.000Z'),
    ]);

    await seedDemo({ db, dir: tmpDir, runId });
    const afterFirst = (await store.readByRun(runId)).length;
    await seedDemo({ db, dir: tmpDir, runId }); // re-seed
    const afterSecond = await store.readByRun(runId);

    expect(afterFirst).toBe(3);
    expect(afterSecond).toHaveLength(3); // no duplication
    expect(afterSecond.map((r) => r.sequence)).toEqual([0, 1, 2]); // ordering intact
  });

  // spec(§17) — migrate-before-seed: against a DB with no run_events table, fail fast "run migrations first".
  test('seed_refuses_without_migrations', async () => {
    const { db } = await freshDb(false); // NO migrations
    const runId = `seed-nomig-${dbc}`;
    writeFixture(runId, [fixtureRow(runId, 0, 'run.completed', '2023-11-14T00:00:00.000Z')]);

    await expect(seedDemo({ db, dir: tmpDir, runId })).rejects.toThrow(/run migrations first/i);
  });

  // spec(closed-loop / rule #7) — dump (PD.1) → seed → the seeded run reconstructs EQUIVALENT, zero provider calls.
  test('seed_round_trip_replays_equivalent', async () => {
    const source = await freshDb(true);
    const target = await freshDb(true);
    const runId = `seed-rt-${dbc}`;
    // A real terminal run with DB-stamped occurredAt (append path), dumped via PD.1.
    await source.store.append(evt(runId, 'run.configured', { rngSeed: 3 }));
    await source.store.append(evt(runId, 'run.started', { from: 'configured', to: 'running' }));
    await source.store.append(
      evt(runId, 'run.completed', { from: 'running', to: 'completed', finalIdeaRef: 'c1' }),
    );
    await dumpReplayToFile({ store: source.store, runId, dir: tmpDir });

    await seedDemo({ db: target.db, dir: tmpDir, runId });

    const srcRows = await source.store.readByRun(runId);
    const tgtRows = await target.store.readByRun(runId);
    // identical authoritative log → identical reconstruction (replay-truth): same (sequence, type, payload, occurredAt).
    const project = (rows: typeof srcRows) =>
      rows.map((r) => [r.sequence, r.type, JSON.stringify(r.payload), r.occurredAt.toISOString()]);
    expect(project(tgtRows)).toEqual(project(srcRows));
    expect(isRunTerminal(tgtRows)).toBe(true);
    // the projection reconstruction matches (buildCurrentState calls NO provider — replay-truth, rule #7).
    expect(buildCurrentState(tgtRows).state.runs[runId]).toEqual(
      buildCurrentState(srcRows).state.runs[runId],
    );
  });
});
