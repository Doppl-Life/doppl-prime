import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

/**
 * Worker heartbeat emitter (P6.10, D2). Writes a row to
 * `worker_heartbeats` every `intervalMs` (default 5s). On each tick:
 *   INSERT … ON CONFLICT (worker_id) DO UPDATE SET beat_at = NOW()
 *
 * The GET /runs/:id/health endpoint (U8) reads MAX(beat_at) to compute
 * lastHeartbeatMs. A stalled or crashed worker stops writing; absence
 * is detectable as 'lastHeartbeatMs > 2 × interval'.
 *
 * Errors are caught + logged via the supplied warn callback; the
 * worker continues. A failed heartbeat write never blocks or mutates
 * authoritative state.
 */

export const DEFAULT_HEARTBEAT_INTERVAL_MS = Number(
  process.env.DOPPL_HEARTBEAT_INTERVAL_MS ?? "5000",
);

export interface StartHeartbeatOptions {
  // biome-ignore lint/suspicious/noExplicitAny: drizzle dialect-generic
  db: NodePgDatabase<any>;
  intervalMs?: number;
  workerId?: string;
  onError?: (err: unknown) => void;
}

export interface HeartbeatHandle {
  workerId: string;
  stop(): Promise<void>;
}

async function beat(
  // biome-ignore lint/suspicious/noExplicitAny: drizzle dialect-generic
  db: NodePgDatabase<any>,
  workerId: string,
): Promise<void> {
  await db.execute(
    sql`INSERT INTO worker_heartbeats (worker_id, beat_at)
        VALUES (${workerId}, NOW())
        ON CONFLICT (worker_id) DO UPDATE SET beat_at = NOW()`,
  );
}

export async function startHeartbeat(options: StartHeartbeatOptions): Promise<HeartbeatHandle> {
  const workerId = options.workerId ?? randomUUID();
  const intervalMs = options.intervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
  const onError =
    options.onError ??
    ((err: unknown) => process.stderr.write(`heartbeat error: ${String(err)}\n`));

  // First beat right away so the table reflects worker-up immediately.
  try {
    await beat(options.db, workerId);
  } catch (err) {
    onError(err);
  }

  const timer = setInterval(() => {
    void (async () => {
      try {
        await beat(options.db, workerId);
      } catch (err) {
        onError(err);
      }
    })();
  }, intervalMs);

  return {
    workerId,
    async stop() {
      clearInterval(timer);
    },
  };
}
