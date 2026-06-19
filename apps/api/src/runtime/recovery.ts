import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { appendEvent } from "../event-store/append.js";

/**
 * Crash-forward recovery at boot (P3.13). Scans for runs in non-terminal
 * statuses (`running | completing | stopping`) and either:
 *
 *   - `resume` (default): leaves them alone. The worker's next poll will
 *     see the configured/active runs and the generation loop will pick
 *     up from the last persisted event. This matches the demo posture.
 *   - `fail-on-startup`: transitions each to `failed` and emits a
 *     `run.failed` event with reason "process restart during active
 *     generation". Safer when the crash itself implies inconsistent
 *     state.
 *
 * Mode is read from `DOPPL_RECOVERY_MODE` env (default `resume`) or can
 * be passed explicitly. Idempotent: re-running against an already-
 * recovered tree is a no-op (since fail-on-startup converted the runs
 * to terminal status, the scan returns nothing on the second call).
 *
 * Terminal runs (`completed | stopped | failed | cancelled`) are
 * skipped — recovery never touches them.
 */

export type RecoveryMode = "resume" | "fail-on-startup";

export interface RecoveryResult {
  runId: string;
  action: "leave-for-resume" | "failed";
}

export interface RecoverOptions {
  // biome-ignore lint/suspicious/noExplicitAny: drizzle's tx generic varies by dialect
  db: NodePgDatabase<any>;
  mode?: RecoveryMode;
}

const NON_TERMINAL_SQL = "status IN ('running', 'completing', 'stopping')";

export async function recoverIncompleteRuns(options: RecoverOptions): Promise<RecoveryResult[]> {
  const mode =
    options.mode ?? (process.env.DOPPL_RECOVERY_MODE as RecoveryMode | undefined) ?? "resume";

  const result = await options.db.execute<{ id: string }>(
    sql.raw(`SELECT id FROM runs WHERE ${NON_TERMINAL_SQL}`),
  );
  const runIds = result.rows.map((r) => r.id);

  if (runIds.length === 0) return [];

  if (mode === "resume") {
    return runIds.map((runId) => ({ runId, action: "leave-for-resume" }));
  }

  // fail-on-startup mode.
  const outcomes: RecoveryResult[] = [];
  for (const runId of runIds) {
    await options.db.execute(
      sql`UPDATE runs SET status='failed', completed_at=NOW() WHERE id=${runId}`,
    );
    await appendEvent(options.db, {
      runId,
      type: "run.failed",
      actor: "runtime",
      payload: {
        completedAt: new Date().toISOString(),
        reason: "process restart during active generation",
      },
    });
    outcomes.push({ runId, action: "failed" });
  }
  return outcomes;
}
