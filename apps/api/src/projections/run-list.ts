import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { runEvents } from '../event-store/schema';

/**
 * listRunIds — the demo-track read helper backing GET /runs (the event store is per-run via
 * `readByRun`; this lists the DISTINCT `run_id` across `run_events`). Demo-owned
 * (apps/api/src/projections) — it READS the kernel-owned `runEvents` schema (a read-only cross-layer
 * import is fine; only EDITING the kernel event-store file is avoided). `selectDistinct` is
 * parameterized DDL-free SQL (no id concatenation — IDs-opaque). Sorted for deterministic ordering.
 *
 * Also reusable for P6.6's deferred log-wide active-run scan (a demo-owned, kernel-edit-free reader).
 */
export async function listRunIds(db: NodePgDatabase): Promise<string[]> {
  const rows = await db.selectDistinct({ runId: runEvents.runId }).from(runEvents);
  return rows.map((row) => row.runId).sort();
}
