import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CONTRACTS_SCHEMA_VERSION } from "@doppl/contracts";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import type { ReplayArtifact } from "../src/event-store/scripts/dump-replay.js";
import { createServer } from "../src/http/server.js";
import { type PgContainerHandle, startPgContainer } from "./helpers/pg-container.js";

const CURATED_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/curated-prompts",
);

describe("spec(PD.4–PD.6) demo HTTP endpoints", () => {
  let handle: PgContainerHandle;
  let tmpDir: string;
  let app: ReturnType<typeof createServer>;

  beforeAll(async () => {
    handle = await startPgContainer();
    tmpDir = await mkdtemp(join(tmpdir(), "doppl-demo-routes-"));
    app = createServer({
      db: drizzle(handle.pool),
      curatedPromptsDir: CURATED_DIR,
      replayFixturesDir: tmpDir,
    });
  });
  afterAll(async () => {
    await handle?.cleanup();
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });
  beforeEach(async () => {
    await handle.pool.query("TRUNCATE run_events");
    await handle.pool.query("DELETE FROM runs");
  });

  test("GET /demo/curated-prompts returns the seeded prompts", async () => {
    const res = await app.request("/demo/curated-prompts");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      prompts: Array<{ id: string; title: string; subtype: string }>;
    };
    const ids = body.prompts.map((p) => p.id).sort();
    expect(ids).toContain("cross-domain-transfer");
    expect(ids).toContain("zeitgeist-synthesis");
  });

  test("POST /demo/runs/live with problemId → 201 + runMode='live'", async () => {
    const res = await app.request("/demo/runs/live", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ problemId: "cross-domain-transfer" }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      runId: string;
      runMode: string;
      source: string;
    };
    expect(body.runMode).toBe("live");
    expect(body.source).toBe("prepared");
    expect(body.runId).toMatch(/^[0-9a-f-]{36}$/);
  });

  test("POST /demo/runs/live with operatorPrompt → 201", async () => {
    const res = await app.request("/demo/runs/live", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operatorPrompt: "Imagine a novel intervention for X." }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { source: string };
    expect(body.source).toBe("operator");
  });

  test("POST /demo/runs/live with unknown problemId → 404", async () => {
    const res = await app.request("/demo/runs/live", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ problemId: "does-not-exist" }),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("curated_prompt_not_found");
  });

  test("POST /demo/runs/live with invalid body → 400", async () => {
    const res = await app.request("/demo/runs/live", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ totally: "wrong" }),
    });
    expect(res.status).toBe(400);
  });

  test("POST /demo/runs/replay/:fixtureId → 201 + runMode='replay'", async () => {
    const runId = "00000000-0000-0000-0000-00000000eeee";
    const artifact: ReplayArtifact = {
      runId,
      schemaVersion: CONTRACTS_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      events: [
        {
          id: "11111111-1111-1111-1111-111111111111",
          runId,
          sequence: 0,
          occurredAt: new Date().toISOString(),
          type: "run.completed",
          actor: "runtime",
          payload: { completedAt: new Date().toISOString() },
          schemaVersion: CONTRACTS_SCHEMA_VERSION,
        },
      ],
    };
    const fixtureId = "fixture-A";
    await writeFile(join(tmpDir, `${fixtureId}.json`), JSON.stringify(artifact));

    const res = await app.request(`/demo/runs/replay/${fixtureId}`, { method: "POST" });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      runId: string;
      runMode: string;
      eventsLoaded: number;
    };
    expect(body.runMode).toBe("replay");
    expect(body.eventsLoaded).toBe(1);
  });

  test("POST /demo/runs/replay rejects fixtureId with traversal characters", async () => {
    const res = await app.request("/demo/runs/replay/..%2Fevil", { method: "POST" });
    // Hono's param decoder leaves the escaped string as-is in some cases; either
    // 400 (decoded ..) or 404 (decoded into a path that doesn't exist) is acceptable.
    expect([400, 404]).toContain(res.status);
  });

  test("POST /demo/runs/replay with missing fixture → 404", async () => {
    const res = await app.request("/demo/runs/replay/does-not-exist", { method: "POST" });
    expect(res.status).toBe(404);
  });

  test("GET /runs/:id surfaces runMode after a replay seed", async () => {
    const runId = "00000000-0000-0000-0000-0000000000aa";
    const artifact: ReplayArtifact = {
      runId,
      schemaVersion: CONTRACTS_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      events: [
        {
          id: "11111111-1111-1111-1111-111111111111",
          runId,
          sequence: 0,
          occurredAt: new Date().toISOString(),
          type: "run.completed",
          actor: "runtime",
          payload: { completedAt: new Date().toISOString() },
          schemaVersion: CONTRACTS_SCHEMA_VERSION,
        },
      ],
    };
    const fixtureId = "fixture-B";
    await writeFile(join(tmpDir, `${fixtureId}.json`), JSON.stringify(artifact));

    const seedRes = await app.request(`/demo/runs/replay/${fixtureId}`, { method: "POST" });
    expect(seedRes.status).toBe(201);

    const detail = await app.request(`/runs/${runId}`);
    expect(detail.status).toBe(200);
    const body = (await detail.json()) as { runMode: string };
    expect(body.runMode).toBe("replay");
  });
});
