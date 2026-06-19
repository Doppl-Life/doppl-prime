import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

/**
 * Compute the next gapless `sequence` for `runId`, holding an advisory
 * transaction-scoped lock keyed by the run's hash for the lifetime of
 * `tx`. The lock auto-releases on commit/rollback, so a rolled-back
 * transaction does not consume a sequence (the next successful append
 * for the same run uses the abandoned number).
 *
 * Cross-run scoping: the advisory key is derived from `runId` only, so
 * concurrent appends to different runs do NOT contend on each other's
 * lock. Same-run concurrent appends serialize on the lock.
 *
 * SQL invariants enforced together:
 *  - `pg_advisory_xact_lock` serializes the read-then-write window.
 *  - `MAX(sequence) + 1` computes the next gap-free integer.
 *  - The `UNIQUE (run_id, sequence)` index on `run_events` is the last-
 *    mile guard against any caller bypassing the lock.
 */
export async function nextSequence(
  // biome-ignore lint/suspicious/noExplicitAny: drizzle's tx generic varies by dialect; only `execute` is used here
  tx: NodePgDatabase<any>,
  runId: string,
): Promise<number> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${runId}, 0))`);
  const result = await tx.execute<{ next: number | string | bigint }>(
    sql`SELECT COALESCE(MAX(sequence), -1) + 1 AS next FROM run_events WHERE run_id = ${runId}`,
  );
  const row = result.rows[0];
  if (!row) throw new Error("nextSequence: unexpected empty result");
  return Number(row.next);
}
