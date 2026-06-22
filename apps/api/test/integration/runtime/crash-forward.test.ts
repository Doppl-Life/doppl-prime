import { afterAll, beforeAll, describe, expect, inject, test } from 'vitest';
import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { CURRENT_SCHEMA_VERSION } from '@doppl/contracts';
import type { AppendInput } from '../../../src/event-store';
import { createEventStore, type EventStore } from '../../../src/event-store';
import { crashForward } from '../../../src/runtime/recovery/crashForward';
import { isRunTerminal } from '../../../src/runtime/worker/activeRunGuard';

/**
 * P3.13 crash-forward — integration (testcontainers, real PG). Recover orphaned non-terminal runs at boot
 * via the real append path: running→run.failed{crash}, configured→run.cancelled{crash}; already-terminal
 * untouched; after recovery every run is terminal (P3.12's single-active-run guard starts clean — §5).
 */

let pool: pg.Pool;
let db: NodePgDatabase;
let store: EventStore;

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
});
afterAll(async () => {
  await pool.end();
});

describe('crashForward — P3.13 crash recovery at boot (real PG append path)', () => {
  const running = 'crash-it-running';
  const configured = 'crash-it-configured';
  const terminal = 'crash-it-terminal';
  // listRunIds is scoped to this scenario's runs (the shared testcontainer DB carries other tests' runs).
  const scan = [running, configured, terminal];

  // spec(§5/§H) — recover the two non-terminal runs to their §3-legal crash terminal; terminal untouched.
  test('recovers_nonterminal_runs_end_to_end', async () => {
    await store.append(evt(running, 'run.configured'));
    await store.append(evt(running, 'run.started', { from: 'configured', to: 'running' }));
    await store.append(evt(configured, 'run.configured'));
    await store.append(evt(terminal, 'run.configured'));
    await store.append(evt(terminal, 'run.started', { from: 'configured', to: 'running' }));
    await store.append(evt(terminal, 'run.completed', { from: 'running', to: 'completed' }));
    const terminalCountBefore = (await store.readByRun(terminal)).length;

    const result = await crashForward({ eventStore: store, listRunIds: async () => scan });
    expect(result.recovered.map((r) => r.runId).sort()).toEqual([configured, running]);

    const runningLog = await store.readByRun(running);
    const runFailed = runningLog.filter((e) => e.type === 'run.failed');
    expect(runFailed).toHaveLength(1);
    expect(runFailed[0]!.payload).toMatchObject({ from: 'running', to: 'failed', reason: 'crash' });
    // sequence-ordered — the crash terminal is the highest sequence for the run.
    expect(runFailed[0]!.sequence).toBe(Math.max(...runningLog.map((e) => e.sequence)));

    const configuredLog = await store.readByRun(configured);
    expect(configuredLog.filter((e) => e.type === 'run.cancelled')).toHaveLength(1);
    expect(configuredLog.find((e) => e.type === 'run.cancelled')!.payload).toMatchObject({
      reason: 'crash',
    });

    // the terminal run is untouched (no new event).
    expect(await store.readByRun(terminal)).toHaveLength(terminalCountBefore);
  });

  // spec(§5 + P3.12) — after crash-forward every scanned run is terminal: the worker's single-active-run
  // guard starts from a clean no-active-run state.
  test('clean_slate_for_worker', async () => {
    for (const runId of scan) {
      expect(isRunTerminal(await store.readByRun(runId))).toBe(true);
    }
  });
});
