import { randomUUID } from "node:crypto";
import { type NodePgDatabase, drizzle } from "drizzle-orm/node-postgres";
import { Hono } from "hono";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { appendEvent } from "../src/event-store/append.js";
import { attachErrorHandler } from "../src/http/middleware/error.js";
import { createRunsReadApp } from "../src/http/routes/runs-read.js";
import { createRunsWriteApp } from "../src/http/routes/runs-write.js";
import { type PgContainerHandle, startPgContainer } from "./helpers/pg-container.js";

const VALID_BODY = {
  seed: "seed-r",
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
  app.route("/", createRunsWriteApp({ db }));
  app.route("/", createRunsReadApp({ db }));
  return app;
}

describe("spec(§9) read endpoints", () => {
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

  test("GET /runs lists runs in descending configured_at", async () => {
    const app = buildApp(db);
    await app.request("/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_BODY),
    });
    const list = await app.request("/runs", { method: "GET" });
    expect(list.status).toBe(200);
    const body = (await list.json()) as { runs: { id: string; status: string }[] };
    expect(body.runs).toHaveLength(1);
    expect(body.runs[0]?.status).toBe("configured");
  });

  test("GET /runs/:id returns current-state + headSequence", async () => {
    const app = buildApp(db);
    const create = await app.request("/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_BODY),
    });
    const { runId } = (await create.json()) as { runId: string };

    const res = await app.request(`/runs/${runId}`, { method: "GET" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      runId: string;
      headSequence: number;
      sequenceThrough: number;
      currentState: { run: { status: string } };
    };
    expect(body.runId).toBe(runId);
    expect(body.headSequence).toBe(0);
    expect(body.currentState.run.status).toBe("configured");
  });

  test("GET /runs/:id on unknown id → 404", async () => {
    const app = buildApp(db);
    const res = await app.request(`/runs/${randomUUID()}`, { method: "GET" });
    expect(res.status).toBe(404);
  });

  test("GET /runs/:id/events supports afterSequence cursor", async () => {
    const app = buildApp(db);
    const create = await app.request("/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_BODY),
    });
    const { runId } = (await create.json()) as { runId: string };
    await appendEvent(db, {
      runId,
      type: "generation.started",
      actor: "runtime",
      payload: { index: 0 },
    });
    await appendEvent(db, {
      runId,
      type: "generation.started",
      actor: "runtime",
      payload: { index: 1 },
    });

    const all = await app.request(`/runs/${runId}/events`, { method: "GET" });
    expect(all.status).toBe(200);
    const allBody = (await all.json()) as { events: { sequence: number }[] };
    expect(allBody.events.length).toBe(3);

    const after = await app.request(`/runs/${runId}/events?afterSequence=0`, { method: "GET" });
    const afterBody = (await after.json()) as { events: { sequence: number }[] };
    expect(afterBody.events.map((e) => e.sequence)).toEqual([1, 2]);

    const limit = await app.request(`/runs/${runId}/events?limit=1`, { method: "GET" });
    const limitBody = (await limit.json()) as { events: { sequence: number }[] };
    expect(limitBody.events).toHaveLength(1);
  });

  test("GET /runs/:id/lineage returns a LineageGraphProjection shape", async () => {
    const app = buildApp(db);
    const create = await app.request("/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_BODY),
    });
    const { runId } = (await create.json()) as { runId: string };
    const res = await app.request(`/runs/${runId}/lineage`, { method: "GET" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      runId: string;
      sequenceThrough: number;
      nodes: unknown[];
      edges: unknown[];
    };
    expect(body.runId).toBe(runId);
    expect(Array.isArray(body.nodes)).toBe(true);
    expect(Array.isArray(body.edges)).toBe(true);
  });

  test("GET /runs/:id/replay returns replay summary", async () => {
    const app = buildApp(db);
    const create = await app.request("/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_BODY),
    });
    const { runId } = (await create.json()) as { runId: string };
    const res = await app.request(`/runs/${runId}/replay`, { method: "GET" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { runId: string; status: string };
    expect(body.runId).toBe(runId);
    expect(body.status).toBe("configured");
  });

  test("GET /runs/:id/candidates/:cid → 404 when unknown", async () => {
    const app = buildApp(db);
    const create = await app.request("/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_BODY),
    });
    const { runId } = (await create.json()) as { runId: string };
    const res = await app.request(`/runs/${runId}/candidates/cand_missing`, { method: "GET" });
    expect(res.status).toBe(404);
  });
});
