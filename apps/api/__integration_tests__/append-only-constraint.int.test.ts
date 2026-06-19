import { type NodePgDatabase, drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { appendEvent } from "../src/event-store/append.js";
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

describe("spec(§4) run_events append-only enforcement (U6 trigger)", () => {
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
    // TRUNCATE bypasses BEFORE DELETE triggers (documented limitation); use
    // it here to reset between tests. The kernel never issues TRUNCATE.
    await handle.pool.query("TRUNCATE run_events");
  });

  test("the trigger and function are present after migration", async () => {
    const triggers = await handle.pool.query<{ tgname: string }>(
      "SELECT tgname FROM pg_trigger WHERE tgname = 'run_events_reject_update'",
    );
    expect(triggers.rows).toHaveLength(1);

    const fn = await handle.pool.query<{ proname: string }>(
      "SELECT proname FROM pg_proc WHERE proname = 'run_events_reject_mutation'",
    );
    expect(fn.rows).toHaveLength(1);
  });

  test("UPDATE against an appended event is rejected by the trigger", async () => {
    const result = await appendEvent(db, {
      runId: "run_no_update",
      type: "run.configured",
      actor: "operator",
      payload: { config: validRunConfig },
    });
    await expect(
      handle.pool.query("UPDATE run_events SET type = $1 WHERE id = $2", [
        "run.completed",
        result.id,
      ]),
    ).rejects.toThrow(/append-only/i);

    // Row is unchanged.
    const after = await handle.pool.query<{ type: string }>(
      "SELECT type FROM run_events WHERE id = $1",
      [result.id],
    );
    expect(after.rows[0]?.type).toBe("run.configured");
  });

  test("DELETE against an appended event is rejected by the trigger", async () => {
    const result = await appendEvent(db, {
      runId: "run_no_delete",
      type: "run.configured",
      actor: "operator",
      payload: { config: validRunConfig },
    });
    await expect(
      handle.pool.query("DELETE FROM run_events WHERE id = $1", [result.id]),
    ).rejects.toThrow(/append-only/i);

    // Row is still there.
    const after = await handle.pool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM run_events WHERE id = $1",
      [result.id],
    );
    expect(after.rows[0]?.count).toBe("1");
  });

  test("INSERT continues to work normally — only mutations are blocked", async () => {
    const a = await appendEvent(db, {
      runId: "run_inserts_still_work",
      type: "run.configured",
      actor: "operator",
      payload: { config: validRunConfig },
    });
    expect(a.sequence).toBe(0);
    const b = await appendEvent(db, {
      runId: "run_inserts_still_work",
      type: "run.started",
      actor: "runtime",
      payload: { startedAt: "2026-06-19T12:00:00.000Z" },
    });
    expect(b.sequence).toBe(1);
  });

  test("documented limitation: TRUNCATE is NOT blocked by BEFORE DELETE triggers", async () => {
    await appendEvent(db, {
      runId: "run_truncate_test",
      type: "run.configured",
      actor: "operator",
      payload: { config: validRunConfig },
    });
    // TRUNCATE succeeds — this is the documented escape hatch (TRUNCATE is
    // DDL-tier, BEFORE DELETE FOR EACH ROW triggers don't fire). The kernel
    // never issues TRUNCATE; hardening the doppl role is a follow-up.
    await expect(handle.pool.query("TRUNCATE run_events")).resolves.toBeDefined();
    const count = await handle.pool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM run_events",
    );
    expect(count.rows[0]?.count).toBe("0");
  });
});
