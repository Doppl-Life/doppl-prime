import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

/**
 * Per-run monotonic-gapless sequence allocation (ARCHITECTURE.md §4) — `sequence` is the sole
 * ordering key. Called INSIDE the append transaction.
 *
 * Same-run appends serialize via `pg_advisory_xact_lock(hashtext(run_id))`: the lock is held until
 * the txn commits/rolls back, so two concurrent same-run appends can't read the same MAX(sequence)
 * (no duplicate, no gap). Different run_ids hash to different lock keys, so cross-run appends never
 * contend. `run_id` is parameterized (IDs-opaque carry-forward — never concatenated into SQL).
 */

// Minimal structural view of the drizzle transaction we use (avoids importing drizzle's deep generics).
export interface SequenceExecutor {
  execute(query: SQL): Promise<{ rows: Array<Record<string, unknown>> }>;
}

export async function allocateSequence(tx: SequenceExecutor, runId: string): Promise<number> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${runId}))`);
  const result = await tx.execute(
    sql`SELECT COALESCE(MAX(sequence) + 1, 0)::int AS next FROM run_events WHERE run_id = ${runId}`,
  );
  return Number(result.rows[0]?.next ?? 0);
}
