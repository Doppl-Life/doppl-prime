import { type NodePgDatabase, drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { startHeartbeat } from "../src/observability/heartbeat.js";
import { type PgContainerHandle, startPgContainer } from "./helpers/pg-container.js";

describe("spec(§9) worker heartbeat", () => {
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
    await handle.pool.query("TRUNCATE worker_heartbeats");
  });

  test("first beat lands a row immediately", async () => {
    const hb = await startHeartbeat({
      db,
      intervalMs: 60_000,
      workerId: "worker-imm",
    });
    try {
      const rows = await handle.pool.query<{ worker_id: string }>(
        "SELECT worker_id FROM worker_heartbeats WHERE worker_id = $1",
        ["worker-imm"],
      );
      expect(rows.rows).toHaveLength(1);
    } finally {
      await hb.stop();
    }
  });

  test("subsequent beats update beat_at via ON CONFLICT DO UPDATE", async () => {
    const hb = await startHeartbeat({
      db,
      intervalMs: 50,
      workerId: "worker-upsert",
    });
    try {
      const first = await handle.pool.query<{ beat_at: Date }>(
        "SELECT beat_at FROM worker_heartbeats WHERE worker_id = $1",
        ["worker-upsert"],
      );
      await new Promise((r) => setTimeout(r, 200));
      const second = await handle.pool.query<{ beat_at: Date }>(
        "SELECT beat_at FROM worker_heartbeats WHERE worker_id = $1",
        ["worker-upsert"],
      );
      const firstAt = new Date(first.rows[0]?.beat_at as Date).getTime();
      const secondAt = new Date(second.rows[0]?.beat_at as Date).getTime();
      expect(secondAt).toBeGreaterThan(firstAt);
      const rows = await handle.pool.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM worker_heartbeats WHERE worker_id = $1",
        ["worker-upsert"],
      );
      expect(rows.rows[0]?.count).toBe("1");
    } finally {
      await hb.stop();
    }
  });

  test("stop() clears the interval — no further beats", async () => {
    const hb = await startHeartbeat({
      db,
      intervalMs: 30,
      workerId: "worker-stop",
    });
    await new Promise((r) => setTimeout(r, 100));
    await hb.stop();
    const before = await handle.pool.query<{ beat_at: Date }>(
      "SELECT beat_at FROM worker_heartbeats WHERE worker_id = $1",
      ["worker-stop"],
    );
    await new Promise((r) => setTimeout(r, 150));
    const after = await handle.pool.query<{ beat_at: Date }>(
      "SELECT beat_at FROM worker_heartbeats WHERE worker_id = $1",
      ["worker-stop"],
    );
    expect(after.rows[0]?.beat_at).toEqual(before.rows[0]?.beat_at);
  });
});
