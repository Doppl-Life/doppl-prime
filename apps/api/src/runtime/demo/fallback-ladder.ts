import type { RunConfig } from "@doppl/contracts";
import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { seedDemo } from "../../event-store/scripts/seed-demo.js";
import { startRun } from "../start-run.js";
import { type DemoCapOverride, applyDemoOverride } from "./demo-cap-override.js";

/**
 * Fallback-ladder controller (PD.4 D7). Surfaces the three operator-
 * driven rungs of the §16 demo fallback ladder:
 *
 *   Rung 1 — low-cap live   : start a live run with caps lowered via
 *                              applyDemoOverride. Result has mode='live'.
 *   Rung 2 — prepared known  : start a live run against a curated
 *                              problem-set config. Result has mode='live'.
 *   Rung 3 — labeled replay  : seed a prepared fixture into the DB,
 *                              flag it mode='replay'. Operator narrates
 *                              the fallback to the audience.
 *
 * Each transition starts a NEW run (rungs 1+2) OR mounts a replay-served
 * projection (rung 3). The previous rung's run stays terminal and
 * inspectable. The operator controls timing — no auto-switch.
 */

export interface ActivateLowCapLiveInput {
  // biome-ignore lint/suspicious/noExplicitAny: drizzle dialect-generic
  db: NodePgDatabase<any>;
  baseConfig: RunConfig;
  override?: DemoCapOverride;
}

export interface ActivateLowCapLiveResult {
  runId: string;
  mode: "live";
  warnings: string[];
}

export async function activateLowCapLive(
  input: ActivateLowCapLiveInput,
): Promise<ActivateLowCapLiveResult> {
  const { config, warnings } = applyDemoOverride(input.baseConfig, input.override);
  const { runId } = await startRun(input.db, config);
  // startRun inserts at mode='live' by default (column default per 0005).
  return { runId, mode: "live", warnings };
}

export interface ActivatePreparedRunInput {
  // biome-ignore lint/suspicious/noExplicitAny: drizzle dialect-generic
  db: NodePgDatabase<any>;
  preparedConfig: RunConfig;
  override?: DemoCapOverride;
}

export interface ActivatePreparedRunResult {
  runId: string;
  mode: "live";
  warnings: string[];
}

export async function activatePreparedRun(
  input: ActivatePreparedRunInput,
): Promise<ActivatePreparedRunResult> {
  const { config, warnings } = applyDemoOverride(input.preparedConfig, input.override);
  const { runId } = await startRun(input.db, config);
  return { runId, mode: "live", warnings };
}

export interface ActivateReplayInput {
  // biome-ignore lint/suspicious/noExplicitAny: drizzle dialect-generic
  db: NodePgDatabase<any>;
  fixturePath: string;
}

export interface ActivateReplayResult {
  runId: string;
  mode: "replay";
  eventsLoaded: number;
  eventsSkipped: number;
}

export async function activateReplay(input: ActivateReplayInput): Promise<ActivateReplayResult> {
  const result = await seedDemo({ db: input.db, fixturePath: input.fixturePath });
  return {
    runId: result.runId,
    mode: "replay",
    eventsLoaded: result.eventsLoaded,
    eventsSkipped: result.eventsSkipped,
  };
}

export interface ReadRunModeResult {
  runId: string;
  mode: string;
  status: string;
}

export async function readRunMode(
  // biome-ignore lint/suspicious/noExplicitAny: drizzle dialect-generic
  db: NodePgDatabase<any>,
  runId: string,
): Promise<ReadRunModeResult | null> {
  const result = await db.execute<{ id: string; mode: string; status: string }>(
    sql`SELECT id, mode, status FROM runs WHERE id = ${runId} LIMIT 1`,
  );
  const row = result.rows[0];
  if (!row) return null;
  return { runId: row.id, mode: row.mode, status: row.status };
}
