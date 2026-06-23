import { afterAll, beforeAll, describe, expect, inject, test } from 'vitest';
import pg from 'pg';
import { and, eq, sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { createEventStore, runEvents, type EventStore } from '../../../../src/event-store';
import { buildServer, DEFAULT_RUN_CONFIG } from '../../../../src/server';
import { applyDemoCapOverride } from '../../../../src/runtime/demo/demo-cap-override';

/**
 * PD.4 — the demo cap-override defends an EXISTING authoritative backstop (defense-in-depth): the route's
 * `overCapField` rejects any cap above `defaultConfig.caps` (§11/§17 — "override cannot raise caps", rule
 * #1), and a LOWERED config built from `applyDemoCapOverride` flows cleanly through the same POST /runs
 * write path (no bypass of state-machine / sequence guards). Reached through the real route + real Postgres.
 */

let pool: pg.Pool;
let db: NodePgDatabase;
let store: EventStore;
let idCounter = 0;

const baseBody = {
  seed: 'demo-scenario',
  enabledSubtypes: ['cross_domain_transfer'] as const,
  modelProfile: 'default',
  scoringPolicyVersion: 'scoring-v1',
  rngSeed: 1,
};

function makeApp() {
  return buildServer({
    store,
    db,
    defaultConfig: DEFAULT_RUN_CONFIG,
    newId: () => `pd4-${idCounter++}`,
  });
}

async function eventsOfType(runId: string, type: string) {
  return (await store.readByRun(runId)).filter((e) => e.type === type);
}

beforeAll(() => {
  pool = new pg.Pool({ connectionString: inject('pgConnectionUri') });
  db = drizzle(pool);
  store = createEventStore({ db, secretValues: [] });
});

afterAll(async () => {
  await pool.end();
});

describe('PD.4 cap-override write-path (spec §17/§11, rule #1)', () => {
  // spec(§17) — the authoritative backstop the helper defends: a cap ABOVE the validated maxima is
  // refused (422, field named) and appends NO run.configured (override cannot raise caps, defense-in-depth).
  test('test_route_rejects_above_ceiling_override', async () => {
    const app = makeApp();
    await app.ready();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/runs',
        payload: {
          ...baseBody,
          caps: {
            ...DEFAULT_RUN_CONFIG.caps,
            maxGenerations: DEFAULT_RUN_CONFIG.caps.maxGenerations + 1,
          },
        },
      });
      expect(res.statusCode).toBe(422);
      const body = res.json() as { error: string; field: string };
      expect(body.error).toBe('cap_override_exceeds_max');
      expect(body.field).toBe('maxGenerations');
    } finally {
      await app.close();
    }
  });

  // rule #2 — a rejected over-cap request leaves ZERO authoritative trace: NO run.configured is
  // persisted for the attempt. Keyed by a unique seed (robust against the shared integration DB +
  // parallel workers — not a global count). Regression guard: today the 422 short-circuits BEFORE the
  // append (runs.ts cap-check precedes newId()/store.append), and this pins that statement order so a
  // future append-before-cap-check reorder fails loud.
  test('test_over_cap_attempt_appends_nothing', async () => {
    const seed = 'pd4-overcap-no-trace';
    const app = makeApp();
    await app.ready();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/runs',
        payload: {
          ...baseBody,
          seed,
          caps: {
            ...DEFAULT_RUN_CONFIG.caps,
            maxPopulation: DEFAULT_RUN_CONFIG.caps.maxPopulation + 5,
          },
        },
      });
      expect(res.statusCode).toBe(422);
      const persisted = await db
        .select()
        .from(runEvents)
        .where(
          and(eq(runEvents.type, 'run.configured'), sql`${runEvents.payload}->>'seed' = ${seed}`),
        );
      expect(persisted).toHaveLength(0);
    } finally {
      await app.close();
    }
  });

  // spec(§17) — a LOWERED config built from applyDemoCapOverride is accepted (201) and appends exactly
  // one run.configured carrying the lowered caps ("started from the same write path as a normal run").
  test('test_lowered_override_config_is_accepted', async () => {
    const loweredCaps = applyDemoCapOverride(DEFAULT_RUN_CONFIG.caps, {
      maxPopulation: 2,
      maxGenerations: 1,
    });
    const app = makeApp();
    await app.ready();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/runs',
        payload: { ...baseBody, caps: loweredCaps },
      });
      expect(res.statusCode).toBe(201);
      const { runId } = res.json() as { runId: string };
      const configured = await eventsOfType(runId, 'run.configured');
      expect(configured).toHaveLength(1);
      const payload = configured[0]?.payload as { caps: typeof loweredCaps } | undefined;
      expect(payload?.caps).toEqual(loweredCaps);
    } finally {
      await app.close();
    }
  });
});
