import { eq, max } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { ProjectionWatermark } from '@doppl/contracts';
import { runEvents } from '../event-store';

/**
 * The watermark / staleness primitive (ARCHITECTURE.md §9). A cached projection records the
 * `(runId, sequenceThrough)` watermark it was built through; it is treated as STALE and discarded /
 * rebuilt whenever `run_events` exist with a sequence greater than that watermark. The decision is a
 * PURE predicate (`isStale`); the one-line DB fetch (`latestSequence`) is the only IO and is
 * integration-tested. No model/web/embedding provider is touched (rule #7).
 */

/**
 * isStale — true when newer events exist than the cached projection's watermark, so it must be
 * discarded and rebuilt. `latestSequence === null` means the run has no events at all (nothing to be
 * stale against → not stale). An append-only log never loses events, so `latestSequence < watermark`
 * cannot occur in practice; it is treated as "nothing newer" (not stale).
 */
export function isStale(watermark: ProjectionWatermark, latestSequence: number | null): boolean {
  if (latestSequence === null) {
    return false;
  }
  return latestSequence > watermark.sequenceThrough;
}

/**
 * latestSequence — the run's current `max(sequence)`, or `null` when the run has no events. The thin
 * parameterized boundary helper the staleness check reads. `runId` is untrusted opaque bytes — bound
 * via Drizzle `eq` (parameterized), never concatenated into SQL (IDs-opaque carry-forward).
 */
export async function latestSequence(db: NodePgDatabase, runId: string): Promise<number | null> {
  const rows = await db
    .select({ value: max(runEvents.sequence) })
    .from(runEvents)
    .where(eq(runEvents.runId, runId));
  return rows[0]?.value ?? null;
}
