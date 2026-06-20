import { randomUUID } from "node:crypto";
import { type NodePgDatabase, drizzle } from "drizzle-orm/node-postgres";
import { Hono } from "hono";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { appendEvent } from "../src/event-store/append.js";
import { attachErrorHandler } from "../src/http/middleware/error.js";
import { createHealthRouteApp } from "../src/http/routes/health.js";
import { createRunsWriteApp } from "../src/http/routes/runs-write.js";
import { type PgContainerHandle, startPgContainer } from "./helpers/pg-container.js";

const VALID_BODY = {
  seed: "seed-h",
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
  app.route("/", createHealthRouteApp({ db }));
  return app;
}

describe("spec(§9) GET /runs/:id/health", () => {
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
    const res = await app.request(`/runs/${randomUUID()}/health`, { method: "GET" });
    expect(res.status).toBe(404);
  });

  test("freshly configured run reports zero counters + status=configured", async () => {
    const app = buildApp(db);
    const create = await app.request("/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_BODY),
    });
    const { runId } = (await create.json()) as { runId: string };
    const res = await app.request(`/runs/${runId}/health`, { method: "GET" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      status: string;
      currentGeneration: number;
      candidatesInFlight: number;
      capsConsumed: { energy: number; generations: number; candidates: number; toolCalls: number };
      lastHeartbeatMs: number | null;
    };
    expect(body.status).toBe("configured");
    expect(body.currentGeneration).toBe(0);
    expect(body.candidatesInFlight).toBe(0);
    expect(body.capsConsumed.energy).toBe(0);
    expect(body.lastHeartbeatMs).toBeNull();
  });

  test("after generation.started + candidate.created + energy.spent, counters reflect", async () => {
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
      type: "candidate.created",
      actor: "agenome",
      payload: {
        candidate: {
          id: "cand_h1",
          runId,
          generationId: "gen_0",
          agenomeId: "ag_h",
          subtype: "cross_domain_transfer",
          title: "t",
          summary: "s",
          claims: [],
          evidenceRefs: [],
          status: "created",
          subtypePayload: {
            sourceDomain: "biology",
            sourceTechnique: "selection",
            targetDomain: "ML",
            targetProblem: "x",
            transferMapping: "y",
            expectedMechanism: "z",
          },
        },
      },
      candidateId: "cand_h1",
      agenomeId: "ag_h",
    });
    await appendEvent(db, {
      runId,
      type: "energy.spent",
      actor: "runtime",
      payload: {
        energy: {
          id: randomUUID(),
          runId,
          eventType: "llm",
          estimate: 25,
          actual: 25,
          unit: "doppl_energy",
          reason: "t",
        },
      },
    });
    const res = await app.request(`/runs/${runId}/health`, { method: "GET" });
    const body = (await res.json()) as {
      currentGeneration: number;
      candidatesInFlight: number;
      capsConsumed: { energy: number };
      lastEventOccurredAt: string | null;
    };
    expect(body.currentGeneration).toBe(1);
    expect(body.candidatesInFlight).toBe(1);
    expect(body.capsConsumed.energy).toBe(25);
    expect(body.lastEventOccurredAt).not.toBeNull();
  });

  test("lastHeartbeatMs is null when worker_heartbeats table is absent", async () => {
    const app = buildApp(db);
    const create = await app.request("/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_BODY),
    });
    const { runId } = (await create.json()) as { runId: string };
    const res = await app.request(`/runs/${runId}/health`, { method: "GET" });
    const body = (await res.json()) as { lastHeartbeatMs: number | null };
    // Pre-U10 the table doesn't exist; the projection silently treats
    // this as 'no heartbeat'.
    expect(body.lastHeartbeatMs).toBeNull();
  });
});
