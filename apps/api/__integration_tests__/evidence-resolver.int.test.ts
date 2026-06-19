import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type NodePgDatabase, drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { appendEvent } from "../src/event-store/append.js";
import { resolveEvidence } from "../src/event-store/evidence-resolver.js";
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

describe("spec(§9) resolveEvidence — Postgres-tier only, fails closed", () => {
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

  test("resolves a present eventId to the parsed RunEventEnvelope", async () => {
    const appended = await appendEvent(db, {
      runId: "run_evid",
      type: "run.configured",
      actor: "operator",
      payload: { config: validRunConfig },
    });
    const result = await resolveEvidence(db, { kind: "trace", eventId: appended.id });
    expect(result.status).toBe("resolved");
    if (result.status === "resolved") {
      expect(result.event.id).toBe(appended.id);
      expect(result.event.runId).toBe("run_evid");
      expect(result.event.type).toBe("run.configured");
      expect(result.event.sequence).toBe(0);
    }
  });

  test("returns not_found for a missing eventId", async () => {
    const result = await resolveEvidence(db, {
      kind: "trace",
      eventId: "evt_does_not_exist",
    });
    expect(result).toEqual({ status: "not_found", eventId: "evt_does_not_exist" });
  });

  test("external uri only → external_only (no network call)", async () => {
    const result = await resolveEvidence(db, {
      kind: "prior_art",
      uri: "https://example.com/x",
    });
    expect(result).toEqual({ status: "external_only", uri: "https://example.com/x" });
  });

  test("langfuseObservationId only → langfuse_only", async () => {
    const result = await resolveEvidence(db, {
      kind: "trace",
      langfuseObservationId: "obs_1",
    });
    expect(result).toEqual({ status: "langfuse_only", langfuseObservationId: "obs_1" });
  });

  test("eventId + uri together — eventId wins (Postgres tier is authoritative)", async () => {
    const appended = await appendEvent(db, {
      runId: "run_both",
      type: "run.configured",
      actor: "operator",
      payload: { config: validRunConfig },
    });
    const result = await resolveEvidence(db, {
      kind: "trace",
      eventId: appended.id,
      uri: "https://example.com/x",
    });
    expect(result.status).toBe("resolved");
  });

  test("structural no-external-calls invariant: resolver source imports zero HTTP modules", () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      path.resolve(here, "..", "src", "event-store", "evidence-resolver.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/from\s+["']https?\b/);
    expect(source).not.toMatch(/from\s+["']axios/);
    expect(source).not.toMatch(/from\s+["']node-fetch/);
    expect(source).not.toMatch(/from\s+["']undici/);
    expect(source).not.toMatch(/\bfetch\s*\(/);
  });
});
