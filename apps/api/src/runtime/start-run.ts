import { randomUUID } from "node:crypto";
import type { RunConfig } from "@doppl/contracts";
import { RunConfig as RunConfigSchema } from "@doppl/contracts";
import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { appendEvent } from "../event-store/append.js";
import { runs } from "../event-store/schema.js";
import { RunAlreadyActiveError } from "./errors.js";

/**
 * Submit a new run to the kernel's DB-backed queue (P3.12).
 *
 * Steps:
 *   1. Validate the config against the Phase 0 RunConfig schema.
 *   2. Check whether any run is in a non-terminal state. If yes, throw
 *      `RunAlreadyActiveError` — the single-active-run invariant is
 *      enforced at the API boundary (operator's pick).
 *   3. Insert a `runs` row at `status='configured'` with the config + a
 *      `configured_at` timestamp (DEFAULT NOW() per migration 0002).
 *   4. Append a `run.configured` event capturing the config snapshot.
 *
 * Returns the run id. The worker (separate process or loop) picks up
 * configured runs in `configured_at` order on its next poll.
 */
export interface StartRunOptions {
  /** Optional override for the gen-0 seed bundle (defaults to
   * `defaultGen0Bundle` in U7). The seeds are NOT persisted by
   * `startRun`; the generation loop reads `seedOverrides` when it
   * materializes generation 0. */
  seedOverrides?: unknown[];
}

const NON_TERMINAL_STATUSES = ["configured", "running", "completing", "stopping"] as const;

export async function startRun(
  // biome-ignore lint/suspicious/noExplicitAny: drizzle's tx generic varies by dialect
  db: NodePgDatabase<any>,
  config: RunConfig,
  _options: StartRunOptions = {},
): Promise<{ runId: string }> {
  // 1. Validate the config (defense-in-depth — RunConfig is already
  //    Zod-typed by the caller, but a stale caller may pass a wrong shape).
  RunConfigSchema.parse(config);

  // 2. Check for an active run.
  const active = await db.execute<{ id: string }>(
    sql`SELECT id FROM runs WHERE status IN ('configured', 'running', 'completing', 'stopping') LIMIT 1`,
  );
  const activeRow = active.rows[0];
  if (activeRow) {
    throw new RunAlreadyActiveError(activeRow.id);
  }

  // 3. Insert the runs row at status='configured'.
  const runId = randomUUID();
  await db.insert(runs).values({
    id: runId,
    status: "configured",
    config: config as Record<string, unknown>,
  });

  // 4. Append the run.configured event.
  await appendEvent(db, {
    runId,
    type: "run.configured",
    actor: "operator",
    payload: { config },
  });

  return { runId };
}

void NON_TERMINAL_STATUSES; // referenced in the SQL string above; keep for future maintainers
