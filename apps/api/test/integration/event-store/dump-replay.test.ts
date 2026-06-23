import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, inject, test } from 'vitest';
import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { CURRENT_SCHEMA_VERSION } from '@doppl/contracts';
import { createEventStore, type AppendInput, type EventStore } from '../../../src/event-store';
import { dumpReplayToFile } from '../../../src/event-store/scripts/dump-replay';

/**
 * PD.1 dump-replay export — real-PG round-trip (ARCHITECTURE.md §16/§4/§9, KEY SAFETY RULES #4/#7). Seed a
 * run via the REAL append path, dump it to `<dir>/<runId>.json`, assert the file is the sequence-ordered,
 * schemaVersion-pinned stream with payloads verbatim; non-terminal runs are rejected (no file); the dumped
 * JSON carries no secret (redaction already ran at append, the dump re-introduces none).
 */

let pool: pg.Pool;
let db: NodePgDatabase;
let store: EventStore;
let tmpDir: string;
let idc = 0;

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

beforeAll(() => {
  pool = new pg.Pool({ connectionString: inject('pgConnectionUri') });
  db = drizzle(pool);
  store = createEventStore({ db, secretValues: [] });
  tmpDir = mkdtempSync(join(tmpdir(), 'doppl-dump-'));
});

afterAll(async () => {
  rmSync(tmpDir, { recursive: true, force: true });
  await pool.end();
});

interface ParsedFixture {
  schemaVersion: number;
  runId: string;
  events: { sequence: number; type: string; payload: Record<string, unknown> }[];
}

describe('dump-replay — PD.1 prepared-replay export (real PG)', () => {
  // spec(§16/§4/§9) — a terminal run dumps to ordered JSON: events by sequence, schemaVersion pinned, verbatim payloads.
  test('dump_terminal_run_writes_ordered_json', async () => {
    const runId = `dump-ok-${idc++}`;
    await store.append(evt(runId, 'run.configured', { rngSeed: 9, outcome: [0.3, 0.4] }));
    await store.append(evt(runId, 'run.started', { from: 'configured', to: 'running' }));
    await store.append(
      evt(runId, 'run.completed', { from: 'running', to: 'completed', finalIdeaRef: 'cand-x' }),
    );

    const { path, fixture } = await dumpReplayToFile({ store, runId, dir: tmpDir });
    expect(fixture.runId).toBe(runId);

    const parsed = JSON.parse(readFileSync(path, 'utf8')) as ParsedFixture;
    expect(parsed.runId).toBe(runId);
    expect(parsed.schemaVersion).toBe(CURRENT_SCHEMA_VERSION); // pinned at the top level
    expect(parsed.events.map((e) => e.sequence)).toEqual([0, 1, 2]); // sequence order, gap-free from 0
    expect(parsed.events.map((e) => e.type)).toEqual([
      'run.configured',
      'run.started',
      'run.completed',
    ]);
    // replay-determinism inputs carried verbatim (RNG seed + outcome serialized as-is).
    expect(parsed.events[0]!.payload.rngSeed).toBe(9);
    expect(parsed.events[0]!.payload.outcome).toEqual([0.3, 0.4]);
  });

  // spec(§16) — a non-terminal run is rejected: the dump throws and writes NO file.
  test('dump_rejects_non_terminal_run', async () => {
    const runId = `dump-nonterminal-${idc++}`;
    await store.append(evt(runId, 'run.configured', { rngSeed: 1 }));
    await expect(dumpReplayToFile({ store, runId, dir: tmpDir })).rejects.toThrow(/not terminal/i);
    expect(existsSync(join(tmpDir, `${runId}.json`))).toBe(false); // no fixture written
  });

  // spec(rule #4) — redaction already ran at append, so the dumped JSON carries no secret value.
  test('dump_payloads_carry_no_secret', async () => {
    const SECRET = 'sk-super-secret-provider-key-9f3';
    const secretStore = createEventStore({ db, secretValues: [SECRET] });
    const runId = `dump-secret-${idc++}`;
    // The secret rides in a payload string; the append-time scrub redacts it BEFORE persistence.
    await secretStore.append(evt(runId, 'run.configured', { note: `key=${SECRET} embedded` }));
    await secretStore.append(evt(runId, 'run.started', { from: 'configured', to: 'running' }));
    await secretStore.append(evt(runId, 'run.completed', { from: 'running', to: 'completed' }));

    const { path } = await dumpReplayToFile({ store: secretStore, runId, dir: tmpDir });
    const content = readFileSync(path, 'utf8');
    expect(content).not.toContain(SECRET); // redaction ran at append; the dump re-introduces nothing
  });
});
