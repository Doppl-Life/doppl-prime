import { randomUUID } from "node:crypto";
import { type NodePgDatabase, drizzle } from "drizzle-orm/node-postgres";
import { Hono } from "hono";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { appendEvent } from "../src/event-store/append.js";
import { attachErrorHandler } from "../src/http/middleware/error.js";
import { createRunsWriteApp } from "../src/http/routes/runs-write.js";
import { createStreamRouteApp } from "../src/http/routes/stream.js";
import { nextEventsAfter } from "../src/http/sse/event-bridge.js";
import { type PgContainerHandle, startPgContainer } from "./helpers/pg-container.js";

const VALID_BODY = {
  seed: "seed-s",
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

function buildApp(db: NodePgDatabase, testMaxDurationMs?: number): Hono {
  const app = new Hono();
  attachErrorHandler(app);
  app.route("/", createRunsWriteApp({ db }));
  app.route(
    "/",
    createStreamRouteApp({
      db,
      ...(testMaxDurationMs !== undefined ? { testMaxDurationMs } : {}),
    }),
  );
  return app;
}

async function readAllFromStream(res: Response, maxMs = 1500): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let acc = "";
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const { value, done } = await reader.read();
    if (done) break;
    acc += decoder.decode(value);
  }
  try {
    await reader.cancel();
  } catch {
    // already closed
  }
  return acc;
}

describe("spec(§9) GET /runs/:id/stream (SSE)", () => {
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

  test("404 when run unknown", async () => {
    const app = buildApp(db);
    const res = await app.request(`/runs/${randomUUID()}/stream`, { method: "GET" });
    expect(res.status).toBe(404);
  });

  test("nextEventsAfter returns serialized events strictly after cursor", async () => {
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

    const all = await nextEventsAfter({ db }, runId, -1);
    expect(all.map((e) => e.sequence)).toEqual([0, 1, 2]);
    const after = await nextEventsAfter({ db }, runId, 0);
    expect(after.map((e) => e.sequence)).toEqual([1, 2]);
  });

  test("catch-up phase streams existing events to the client", async () => {
    const app = buildApp(db, 300);
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

    const res = await app.request(`/runs/${runId}/stream`, { method: "GET" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type") ?? "").toContain("text/event-stream");
    const body = await readAllFromStream(res, 1200);
    expect(body).toContain("id: 0");
    expect(body).toContain("id: 1");
    expect(body).toContain("event: run.configured");
    expect(body).toContain("event: generation.started");
  });

  test("Last-Event-ID resumes from cursor without duplicates", async () => {
    const app = buildApp(db, 300);
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

    const res = await app.request(`/runs/${runId}/stream`, {
      method: "GET",
      headers: { "Last-Event-ID": "0" },
    });
    const body = await readAllFromStream(res, 1200);
    expect(body).not.toContain("id: 0");
    expect(body).toContain("id: 1");
  });
});
