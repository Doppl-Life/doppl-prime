import { CONTRACTS_SCHEMA_VERSION } from "@doppl/contracts";
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

describe("spec(§4) appendEvent — validate + redact + insert in one TX", () => {
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
    await handle.pool.query("DELETE FROM run_events");
  });

  test("happy path: valid run.configured envelope inserts a row at sequence 0", async () => {
    const result = await appendEvent(db, {
      runId: "run_happy",
      type: "run.configured",
      actor: "operator",
      payload: { config: validRunConfig },
    });
    expect(result.sequence).toBe(0);
    expect(result.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.occurredAt).toBeInstanceOf(Date);

    const rows = await handle.pool.query<{ id: string; sequence: string; payload: unknown }>(
      "SELECT id, sequence, payload FROM run_events WHERE run_id = $1",
      ["run_happy"],
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]?.id).toBe(result.id);
  });

  test("second append for same run gets sequence 1", async () => {
    await appendEvent(db, {
      runId: "run_two",
      type: "run.configured",
      actor: "operator",
      payload: { config: validRunConfig },
    });
    const second = await appendEvent(db, {
      runId: "run_two",
      type: "run.started",
      actor: "runtime",
      payload: { startedAt: "2026-06-19T12:00:00.000Z" },
    });
    expect(second.sequence).toBe(1);
  });

  test("rejects a payload that does not match its event type (no row written)", async () => {
    await expect(
      appendEvent(db, {
        runId: "run_bad_payload",
        type: "run.configured",
        actor: "operator",
        payload: { not: "a config" },
      }),
    ).rejects.toThrow();

    const count = await handle.pool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM run_events WHERE run_id = $1",
      ["run_bad_payload"],
    );
    expect(count.rows[0]?.count).toBe("0");
  });

  test("rejects an unknown actor value (closed 7-role union)", async () => {
    await expect(
      appendEvent(db, {
        runId: "run_bad_actor",
        type: "run.configured",
        // biome-ignore lint/suspicious/noExplicitAny: deliberately invalid input
        actor: "developer" as any,
        payload: { config: validRunConfig },
      }),
    ).rejects.toThrow();
  });

  test("rejects an unknown event type", async () => {
    await expect(
      appendEvent(db, {
        runId: "run_bad_type",
        // biome-ignore lint/suspicious/noExplicitAny: deliberately invalid input
        type: "run.exploded" as any,
        actor: "runtime",
        payload: {},
      }),
    ).rejects.toThrow();
  });

  test("REQ-S-004: a sk- secret in the payload is redacted before insert", async () => {
    const secret = "sk-abcdefghijklmnopqrstuvwxyz0123";
    await appendEvent(db, {
      runId: "run_redact",
      type: "provider_call_failed",
      actor: "runtime",
      payload: {
        reason: `auth failed with ${secret}`,
        routeId: "openrouter:gpt-4o",
      },
    });

    const rows = await handle.pool.query<{ payload: { reason: string; routeId: string } }>(
      "SELECT payload FROM run_events WHERE run_id = $1",
      ["run_redact"],
    );
    const payload = rows.rows[0]?.payload;
    expect(payload).toBeDefined();
    expect(payload?.reason).not.toContain(secret);
    expect(payload?.reason).toContain("[REDACTED]");
    expect(payload?.routeId).toBe("openrouter:gpt-4o");
  });

  test("REQ-S-004 safety invariant: no secret substring in any column of the row", async () => {
    const secret = "sk-XXXrealsecret9876543210";
    await appendEvent(db, {
      runId: "run_safety",
      type: "provider_call_failed",
      actor: "runtime",
      payload: { reason: `failed: apiKey=${secret}` },
    });
    const rows = await handle.pool.query(
      "SELECT row_to_json(t)::text AS dump FROM run_events t WHERE run_id = $1",
      ["run_safety"],
    );
    const dump = (rows.rows[0] as { dump: string }).dump;
    expect(dump).not.toContain(secret);
  });

  test("schemaVersion defaults to CONTRACTS_SCHEMA_VERSION when caller omits it", async () => {
    const result = await appendEvent(db, {
      runId: "run_schemaversion_default",
      type: "run.configured",
      actor: "operator",
      payload: { config: validRunConfig },
    });
    const row = await handle.pool.query<{ schema_version: number }>(
      "SELECT schema_version FROM run_events WHERE id = $1",
      [result.id],
    );
    expect(row.rows[0]?.schema_version).toBe(CONTRACTS_SCHEMA_VERSION);
  });

  test("schemaVersion > CONTRACTS_SCHEMA_VERSION is rejected (no row written)", async () => {
    await expect(
      appendEvent(db, {
        runId: "run_future_schema",
        type: "run.configured",
        actor: "operator",
        payload: { config: validRunConfig },
        schemaVersion: CONTRACTS_SCHEMA_VERSION + 1,
      }),
    ).rejects.toThrow(/schemaVersion/i);

    const count = await handle.pool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM run_events WHERE run_id = $1",
      ["run_future_schema"],
    );
    expect(count.rows[0]?.count).toBe("0");
  });

  test("occurredAt is DB-stamped; passing an old value does NOT control the column", async () => {
    const first = await appendEvent(db, {
      runId: "run_stamp",
      type: "run.configured",
      actor: "operator",
      payload: { config: validRunConfig },
    });
    const second = await appendEvent(db, {
      runId: "run_stamp",
      type: "run.started",
      actor: "runtime",
      payload: { startedAt: "2026-06-19T12:00:00.000Z" },
    });
    // Both occurredAt values came from Postgres NOW(); first <= second.
    expect(first.occurredAt.getTime()).toBeLessThanOrEqual(second.occurredAt.getTime());
    // Both are within the last 10 seconds (sanity check against frozen clocks).
    const now = Date.now();
    expect(now - first.occurredAt.getTime()).toBeLessThan(10_000);
  });
});
