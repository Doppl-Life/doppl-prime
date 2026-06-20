import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CONTRACTS_SCHEMA_VERSION, type RunConfig, type RunEventEnvelope } from "@doppl/contracts";
import { type NodePgDatabase, drizzle } from "drizzle-orm/node-postgres";
import { appendEvent } from "../../src/event-store/append.js";
import { dumpReplay } from "../../src/event-store/scripts/dump-replay.js";
import { startRun } from "../../src/runtime/start-run.js";
import { type PgContainerHandle, startPgContainer } from "../helpers/pg-container.js";

/**
 * Shared rehearsal scaffolding (PD.8 / U10). Each rehearsal int test
 * boots its own Postgres container + creates a recorded fixture so the
 * tests stay deterministic and isolated. Helpers here keep the per-
 * rehearsal file body focused on the §16 expectation it asserts.
 */

export const REHEARSAL_BASE_CONFIG: RunConfig = {
  seed: "rehearsal-seed",
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
  rngSeed: "rehearsal-rng-1",
};

export const CURATED_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../fixtures/curated-prompts",
);

export interface RehearsalEnv {
  handle: PgContainerHandle;
  db: NodePgDatabase;
  tmpDir: string;
  cleanup: () => Promise<void>;
}

export async function startRehearsalEnv(): Promise<RehearsalEnv> {
  const handle = await startPgContainer();
  const db = drizzle(handle.pool);
  const tmpDir = await mkdtemp(join(tmpdir(), "doppl-rehearsal-"));
  return {
    handle,
    db,
    tmpDir,
    cleanup: async () => {
      await handle.cleanup();
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    },
  };
}

/**
 * Build a recorded run + dump a replay artifact. Returns the artifact
 * path so rehearsals can re-seed it through the fallback ladder.
 */
export async function buildRecordedRun(env: RehearsalEnv): Promise<{
  fixturePath: string;
  runId: string;
}> {
  const { runId } = await startRun(env.db, REHEARSAL_BASE_CONFIG);
  await appendEvent(env.db, {
    runId,
    type: "run.started",
    actor: "runtime",
    payload: { startedAt: new Date().toISOString() },
  });
  await appendEvent(env.db, {
    runId,
    type: "generation.started",
    actor: "runtime",
    payload: { index: 0 },
  });
  await appendEvent(env.db, {
    runId,
    type: "generation.completed",
    actor: "runtime",
    payload: { completedAt: new Date().toISOString(), candidateCount: 0 },
  });
  await appendEvent(env.db, {
    runId,
    type: "run.completed",
    actor: "runtime",
    payload: { completedAt: new Date().toISOString() },
  });
  await env.handle.pool.query("UPDATE runs SET status = 'completed' WHERE id = $1", [runId]);
  const result = await dumpReplay({ db: env.db, runId, outDir: env.tmpDir });
  return { fixturePath: result.path, runId };
}

/**
 * Write a hand-built replay artifact to disk without going through a
 * recorded run. Useful when the rehearsal needs a specific shape.
 */
export async function writeArtifact(
  env: RehearsalEnv,
  filename: string,
  runId: string,
  events: RunEventEnvelope[],
): Promise<string> {
  const path = join(env.tmpDir, filename);
  await writeFile(
    path,
    JSON.stringify({
      runId,
      schemaVersion: CONTRACTS_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      events,
    }),
  );
  return path;
}

/**
 * Truncate the run-state tables; preserve the schema so subsequent
 * seeds reuse the same migrations.
 */
export async function resetDb(env: RehearsalEnv): Promise<void> {
  await env.handle.pool.query("TRUNCATE run_events");
  await env.handle.pool.query("DELETE FROM runs");
}
