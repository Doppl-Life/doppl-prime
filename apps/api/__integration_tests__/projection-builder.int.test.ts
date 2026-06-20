import { randomUUID } from "node:crypto";
import type { RunEventEnvelope } from "@doppl/contracts";
import { type NodePgDatabase, drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { appendEvent } from "../src/event-store/append.js";
import { EMPTY_SEQUENCE_THROUGH, buildProjection } from "../src/projections/projection-builder.js";
import { createWatermarkCache } from "../src/projections/watermark.js";
import { type PgContainerHandle, startPgContainer } from "./helpers/pg-container.js";

const VALID_RUN_CONFIG = {
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

describe("spec(§9) projection-builder core", () => {
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

  test("empty event log → initial state, sequenceThrough = -1", async () => {
    const out = await buildProjection({
      db,
      runId: "run_empty",
      initial: { count: 0 },
      reduce: (s) => ({ count: s.count + 1 }),
    });
    expect(out.state).toEqual({ count: 0 });
    expect(out.sequenceThrough).toBe(EMPTY_SEQUENCE_THROUGH);
    expect(out.eventsConsumed).toBe(0);
  });

  test("folds events strictly by (runId, sequence)", async () => {
    const runId = "run_fold";
    await appendEvent(db, {
      runId,
      type: "run.configured",
      actor: "operator",
      payload: { config: VALID_RUN_CONFIG },
    });
    await appendEvent(db, {
      runId,
      type: "run.started",
      actor: "runtime",
      payload: { startedAt: new Date().toISOString() },
    });
    await appendEvent(db, {
      runId,
      type: "generation.started",
      actor: "runtime",
      payload: { index: 0 },
    });

    const out = await buildProjection({
      db,
      runId,
      initial: [] as string[],
      reduce: (s, e) => [...s, e.type],
    });
    expect(out.state).toEqual(["run.configured", "run.started", "generation.started"]);
    expect(out.sequenceThrough).toBe(2);
    expect(out.eventsConsumed).toBe(3);
  });

  test("idempotency: same events folded twice produce the same state", async () => {
    const runId = "run_idem";
    await appendEvent(db, {
      runId,
      type: "run.configured",
      actor: "operator",
      payload: { config: VALID_RUN_CONFIG },
    });
    await appendEvent(db, {
      runId,
      type: "generation.started",
      actor: "runtime",
      payload: { index: 0 },
    });

    const reduce = (s: string[], e: RunEventEnvelope) => [...s, e.type];
    const first = await buildProjection({ db, runId, initial: [] as string[], reduce });
    const second = await buildProjection({ db, runId, initial: [] as string[], reduce });
    expect(first.state).toEqual(second.state);
    expect(first.sequenceThrough).toBe(second.sequenceThrough);
  });

  test("rejects envelope with schemaVersion above current (via replay-reader)", async () => {
    const runId = "run_forward_schema";
    await appendEvent(db, {
      runId,
      type: "run.configured",
      actor: "operator",
      payload: { config: VALID_RUN_CONFIG },
    });
    // The append-only trigger blocks UPDATE in normal operation. Disable
    // it for this fixture, bump schema_version, then re-enable. The
    // replay-reader's ReplaySchemaTooNewError is the load-bearing check
    // and the projection-builder propagates it. (The redundant
    // ProjectionForwardSchemaError exists as belt-and-braces but should
    // never fire in practice.)
    await handle.pool.query("ALTER TABLE run_events DISABLE TRIGGER run_events_reject_update");
    try {
      await handle.pool.query("UPDATE run_events SET schema_version = 99 WHERE run_id = $1", [
        runId,
      ]);
      await expect(
        buildProjection({
          db,
          runId,
          initial: 0,
          reduce: (s) => s + 1,
        }),
      ).rejects.toThrow();
    } finally {
      await handle.pool.query("ALTER TABLE run_events ENABLE TRIGGER run_events_reject_update");
    }
  });

  test("reducer receives every envelope in sequence order", async () => {
    const runId = "run_order";
    const types = ["run.configured", "run.started", "generation.started", "generation.completed"];
    await appendEvent(db, {
      runId,
      type: "run.configured",
      actor: "operator",
      payload: { config: VALID_RUN_CONFIG },
    });
    await appendEvent(db, {
      runId,
      type: "run.started",
      actor: "runtime",
      payload: { startedAt: new Date().toISOString() },
    });
    await appendEvent(db, {
      runId,
      type: "generation.started",
      actor: "runtime",
      payload: { index: 0 },
    });
    await appendEvent(db, {
      runId,
      type: "generation.completed",
      actor: "runtime",
      payload: { completedAt: new Date().toISOString(), candidateCount: 1 },
    });

    const seen: { seq: number; type: string }[] = [];
    const out = await buildProjection({
      db,
      runId,
      initial: null,
      reduce: (_s, e) => {
        seen.push({ seq: e.sequence, type: e.type });
        return null;
      },
    });

    expect(seen.map((s) => s.seq)).toEqual([0, 1, 2, 3]);
    expect(seen.map((s) => s.type)).toEqual(types);
    expect(out.eventsConsumed).toBe(4);
  });

  test("only events for the target runId are folded", async () => {
    const r1 = "run_a";
    const r2 = "run_b";
    await appendEvent(db, {
      runId: r1,
      type: "run.configured",
      actor: "operator",
      payload: { config: VALID_RUN_CONFIG },
    });
    await appendEvent(db, {
      runId: r2,
      type: "run.configured",
      actor: "operator",
      payload: { config: VALID_RUN_CONFIG },
    });
    const out = await buildProjection({
      db,
      runId: r1,
      initial: 0,
      reduce: (s) => s + 1,
    });
    expect(out.eventsConsumed).toBe(1);
  });
});

describe("watermark cache", () => {
  test("get returns undefined on miss", () => {
    const cache = createWatermarkCache<number>();
    expect(cache.get("nope", 0)).toBeUndefined();
  });

  test("get returns cached when stored watermark >= currentSequence", () => {
    const cache = createWatermarkCache<string>();
    cache.put("r1", 10, "snapshot-10");
    expect(cache.get("r1", 10)).toBe("snapshot-10");
    expect(cache.get("r1", 5)).toBe("snapshot-10");
  });

  test("get invalidates and returns undefined when stored watermark < currentSequence", () => {
    const cache = createWatermarkCache<string>();
    cache.put("r1", 5, "stale");
    expect(cache.get("r1", 10)).toBeUndefined();
    expect(cache.size()).toBe(0);
  });

  test("invalidate clears one runId", () => {
    const cache = createWatermarkCache<string>();
    cache.put("r1", 1, "a");
    cache.put("r2", 1, "b");
    cache.invalidate("r1");
    expect(cache.get("r1", 0)).toBeUndefined();
    expect(cache.get("r2", 0)).toBe("b");
  });

  test("clear wipes everything", () => {
    const cache = createWatermarkCache<string>();
    cache.put("r1", 1, "a");
    cache.put("r2", 1, "b");
    cache.clear();
    expect(cache.size()).toBe(0);
  });

  test("put overwrites the existing entry", () => {
    const cache = createWatermarkCache<string>();
    cache.put("r1", 1, "v1");
    cache.put("r1", 2, "v2");
    expect(cache.get("r1", 2)).toBe("v2");
  });
});

void randomUUID;
