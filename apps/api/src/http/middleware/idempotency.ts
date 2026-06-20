import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

/**
 * Idempotency-Key middleware (P6.6, D3). Client provides
 * `Idempotency-Key: <opaque>` on POST /runs. The middleware looks up
 * (key, body_hash) in idempotency_keys: a match returns the stored
 * response_body + status. Otherwise the request flows through; the
 * route handler stores its response via `recordIdempotencyResult`.
 *
 * Body hash is sha256 of the canonical JSON body so two POSTs with
 * different configs but the same key are NOT deduped silently — they
 * 422 with `idempotency_key_conflict`.
 *
 * TTL is DOPPL_IDEMPOTENCY_TTL_HOURS (default 24).
 */

const DEFAULT_TTL_HOURS = Number(process.env.DOPPL_IDEMPOTENCY_TTL_HOURS ?? "24");

export interface StoredIdempotencyEntry {
  key: string;
  runId: string;
  bodyHash: string;
  responseBody: unknown;
  responseStatus: number;
}

export function hashBody(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}

export async function findIdempotencyResult(
  // biome-ignore lint/suspicious/noExplicitAny: drizzle dialect-generic
  db: NodePgDatabase<any>,
  key: string,
): Promise<StoredIdempotencyEntry | null> {
  const result = await db.execute<{
    key: string;
    run_id: string;
    body_hash: string;
    response_body: unknown;
    response_status: number;
  }>(
    sql`SELECT key, run_id, body_hash, response_body, response_status
        FROM idempotency_keys WHERE key = ${key} AND expires_at > NOW() LIMIT 1`,
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    key: row.key,
    runId: row.run_id,
    bodyHash: row.body_hash,
    responseBody: row.response_body,
    responseStatus: row.response_status,
  };
}

export async function recordIdempotencyResult(
  // biome-ignore lint/suspicious/noExplicitAny: drizzle dialect-generic
  db: NodePgDatabase<any>,
  entry: StoredIdempotencyEntry,
  ttlHours: number = DEFAULT_TTL_HOURS,
): Promise<void> {
  await db.execute(
    sql`INSERT INTO idempotency_keys
        (key, run_id, body_hash, response_body, response_status, expires_at)
        VALUES (${entry.key}, ${entry.runId}, ${entry.bodyHash},
                ${JSON.stringify(entry.responseBody)}::jsonb,
                ${entry.responseStatus},
                NOW() + (${ttlHours} || ' hours')::interval)
        ON CONFLICT (key) DO NOTHING`,
  );
}
