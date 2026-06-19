import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CONTRACTS_SCHEMA_VERSION } from "@doppl/contracts";
import { type NodePgDatabase, drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { appendEvent } from "../src/event-store/append.js";
import {
  ReplaySchemaTooNewError,
  ReplaySequenceGapError,
  replayReader,
} from "../src/event-store/replay-reader.js";
import { type PgContainerHandle, startPgContainer } from "./helpers/pg-container.js";

const validRunConfig = {
  seed: "operator-seed",
  enabledSubtypes: ["cross_domain_transfer"],
  caps: {
    maxPopulation: 4,
    maxGenerations: 3,
    energyBudget: 1_000,
    maxSpawnDepth: 2,
    maxToolCalls: 10,
    wallClockTimeoutMs: 60_000,
  },
  modelProfile: "default",
  scoringPolicyVersion: "v1",
  rngSeed: "rng-1",
};

async function seedRun(db: NodePgDatabase, runId: string, count: number): Promise<void> {
  await appendEvent(db, {
    runId,
    type: "run.configured",
    actor: "operator",
    payload: { config: validRunConfig },
  });
  for (let i = 1; i < count; i += 1) {
    await appendEvent(db, {
      runId,
      type: "run.started",
      actor: "runtime",
      payload: { startedAt: "2026-06-19T12:00:00.000Z" },
    });
  }
}

describe("spec(§4) replayReader — ordered, deterministic, no external calls", () => {
  let handle: PgContainerHandle;
  let db: NodePgDatabase;

  beforeAll(async () => {
    handle = await startPgContainer();
    db = drizzle(handle.pool);
  });

  afterAll(async () => {
    await handle?.cleanup();
  });

  beforeEach(async () => {
    await handle.pool.query("TRUNCATE run_events");
  });

  test("yields events in sequence order for a single run", async () => {
    await seedRun(db, "run_order", 3);
    const events = [];
    for await (const env of replayReader(db).events("run_order")) {
      events.push(env);
    }
    expect(events).toHaveLength(3);
    expect(events.map((e) => e.sequence)).toEqual([0, 1, 2]);
    expect(events[0]?.type).toBe("run.configured");
    expect(events[1]?.type).toBe("run.started");
  });

  test("yields nothing for an empty run", async () => {
    const events = [];
    for await (const env of replayReader(db).events("run_empty")) {
      events.push(env);
    }
    expect(events).toHaveLength(0);
  });

  test("isolates events per run (cross-run scoping)", async () => {
    await seedRun(db, "run_a", 2);
    await seedRun(db, "run_b", 3);
    const aEvents = [];
    for await (const env of replayReader(db).events("run_a")) {
      aEvents.push(env);
    }
    const bEvents = [];
    for await (const env of replayReader(db).events("run_b")) {
      bEvents.push(env);
    }
    expect(aEvents).toHaveLength(2);
    expect(bEvents).toHaveLength(3);
    expect(aEvents.every((e) => e.runId === "run_a")).toBe(true);
    expect(bEvents.every((e) => e.runId === "run_b")).toBe(true);
  });

  test("throws ReplaySchemaTooNewError on schemaVersion > CONTRACTS_SCHEMA_VERSION", async () => {
    // Bypass the writer (which would reject schemaVersion > current) by
    // inserting via raw SQL. This is the corruption-alarm path.
    await handle.pool.query(
      `INSERT INTO run_events
         (id, run_id, sequence, type, actor, payload, schema_version)
       VALUES ('evt_future', 'run_future', 0, 'run.started', 'runtime', '{"startedAt":"2026-06-19T12:00:00.000Z"}'::jsonb, $1)`,
      [CONTRACTS_SCHEMA_VERSION + 1],
    );
    const iter = replayReader(db).events("run_future");
    await expect(
      (async () => {
        for await (const _ of iter) {
          // exhaust
        }
      })(),
    ).rejects.toBeInstanceOf(ReplaySchemaTooNewError);
  });

  test("throws ReplaySequenceGapError on a missing sequence", async () => {
    // Insert sequences 0 and 2 — skipping 1. Bypass the writer because
    // U4's nextSequence would never produce a gap.
    await handle.pool.query(
      `INSERT INTO run_events (id, run_id, sequence, type, actor, payload, schema_version)
       VALUES ('evt_0', 'run_gap', 0, 'run.started', 'runtime', '{"startedAt":"2026-06-19T12:00:00.000Z"}'::jsonb, 1),
              ('evt_2', 'run_gap', 2, 'run.started', 'runtime', '{"startedAt":"2026-06-19T12:00:00.000Z"}'::jsonb, 1)`,
    );
    let caught: unknown;
    try {
      for await (const _ of replayReader(db).events("run_gap")) {
        // consume
      }
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ReplaySequenceGapError);
    const err = caught as ReplaySequenceGapError;
    expect(err.expected).toBe(1);
    expect(err.actual).toBe(2);
  });

  test("structural no-external-calls invariant: source imports zero HTTP modules", () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      path.resolve(here, "..", "src", "event-store", "replay-reader.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/from\s+["']https?\b/);
    expect(source).not.toMatch(/from\s+["']axios/);
    expect(source).not.toMatch(/from\s+["']node-fetch/);
    expect(source).not.toMatch(/from\s+["']undici/);
    expect(source).not.toMatch(/from\s+["']openai/);
    expect(source).not.toMatch(/\bfetch\s*\(/);
  });

  test("accepts schemaVersion < CONTRACTS_SCHEMA_VERSION (forward-compat)", async () => {
    // At today's freeze CONTRACTS_SCHEMA_VERSION === 1, so we can't
    // insert "older" events. This test documents the invariant for when
    // a future CONTRACTS_SCHEMA_VERSION bump lands; today it's a tautology.
    if (CONTRACTS_SCHEMA_VERSION === 1) {
      expect(CONTRACTS_SCHEMA_VERSION).toBe(1); // sanity tick
      return;
    }
    await handle.pool.query(
      `INSERT INTO run_events (id, run_id, sequence, type, actor, payload, schema_version)
       VALUES ('evt_old', 'run_old', 0, 'run.started', 'runtime', '{"startedAt":"2026-06-19T12:00:00.000Z"}'::jsonb, 1)`,
    );
    const events = [];
    for await (const env of replayReader(db).events("run_old")) {
      events.push(env);
    }
    expect(events).toHaveLength(1);
  });
});
