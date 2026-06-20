import { randomUUID } from "node:crypto";
import { type NodePgDatabase, drizzle } from "drizzle-orm/node-postgres";
import { Hono } from "hono";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { attachErrorHandler } from "../src/http/middleware/error.js";
import { createRunsWriteApp } from "../src/http/routes/runs-write.js";
import { type PgContainerHandle, startPgContainer } from "./helpers/pg-container.js";

const VALID_BODY = {
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

function buildApp(db: NodePgDatabase): Hono {
  const app = new Hono();
  attachErrorHandler(app);
  const writeApp = createRunsWriteApp({ db });
  app.route("/", writeApp);
  return app;
}

describe("spec(§9) POST /runs + /stop with idempotency", () => {
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
    await handle.pool.query("DELETE FROM runs");
    await handle.pool.query("DELETE FROM idempotency_keys");
  });

  test("POST /runs with valid config returns 201 + runId", async () => {
    const app = buildApp(db);
    const res = await app.request("/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_BODY),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { runId: string };
    expect(body.runId).toMatch(/^[0-9a-f-]{36}$/);
  });

  test("POST /runs with the same Idempotency-Key returns the same runId at 200", async () => {
    const app = buildApp(db);
    const key = randomUUID();
    const first = await app.request("/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": key },
      body: JSON.stringify(VALID_BODY),
    });
    expect(first.status).toBe(201);
    const firstBody = (await first.json()) as { runId: string };

    const second = await app.request("/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": key },
      body: JSON.stringify(VALID_BODY),
    });
    expect(second.status).toBe(201);
    const secondBody = (await second.json()) as { runId: string };
    expect(secondBody.runId).toBe(firstBody.runId);
  });

  test("Idempotency-Key reuse with a different body returns 422", async () => {
    const app = buildApp(db);
    const key = randomUUID();
    const first = await app.request("/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": key },
      body: JSON.stringify(VALID_BODY),
    });
    expect(first.status).toBe(201);

    // We can't change the body and still have a non-active run; use a
    // tweaked config so the body hash differs even before startRun runs.
    const second = await app.request("/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": key },
      body: JSON.stringify({ ...VALID_BODY, seed: "different-seed" }),
    });
    expect(second.status).toBe(422);
    const body = (await second.json()) as { error: string };
    expect(body.error).toBe("idempotency_key_conflict");
  });

  test("invalid config (missing rngSeed) → 400 with no run inserted", async () => {
    const app = buildApp(db);
    const { rngSeed: _drop, ...bad } = VALID_BODY;
    const res = await app.request("/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bad),
    });
    expect(res.status).toBe(400);
    const rows = await handle.pool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM runs",
    );
    expect(rows.rows[0]?.count).toBe("0");
  });

  test("second POST /runs while a run is non-terminal returns 409 with activeRunId", async () => {
    const app = buildApp(db);
    const first = await app.request("/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_BODY),
    });
    const firstBody = (await first.json()) as { runId: string };
    const second = await app.request("/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_BODY),
    });
    expect(second.status).toBe(409);
    const body = (await second.json()) as { error: string; activeRunId: string };
    expect(body.error).toBe("run_already_active");
    expect(body.activeRunId).toBe(firstBody.runId);
  });

  test("POST /runs/:id/stop emits run.stopped and returns 200", async () => {
    const app = buildApp(db);
    const first = await app.request("/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_BODY),
    });
    const { runId } = (await first.json()) as { runId: string };

    const stop = await app.request(`/runs/${runId}/stop`, { method: "POST" });
    expect(stop.status).toBe(200);
    const body = (await stop.json()) as { runId: string; alreadyTerminal: boolean };
    expect(body.runId).toBe(runId);
    expect(body.alreadyTerminal).toBe(false);

    const events = await handle.pool.query<{ type: string }>(
      "SELECT type FROM run_events WHERE run_id = $1",
      [runId],
    );
    expect(events.rows.some((r) => r.type === "run.stopped")).toBe(true);
  });

  test("POST /runs/:id/stop on unknown run → 404", async () => {
    const app = buildApp(db);
    const res = await app.request(`/runs/${randomUUID()}/stop`, { method: "POST" });
    expect(res.status).toBe(404);
  });

  test("invalid JSON body → 400", async () => {
    const app = buildApp(db);
    const res = await app.request("/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ not json",
    });
    expect(res.status).toBe(400);
  });
});
