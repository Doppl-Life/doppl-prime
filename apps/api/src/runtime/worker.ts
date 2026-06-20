import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { type HeartbeatHandle, startHeartbeat } from "../observability/heartbeat.js";

/**
 * In-process async worker (P3.12 + P6.10). Polls the `runs` table for
 * the oldest configured run and processes it. Single-active-run is
 * structural: the worker never starts a new run while another is in a
 * non-terminal state.
 *
 * Polling interval is `DOPPL_WORKER_POLL_MS` (default 1000ms). The
 * `processRun` callback is supplied at construction so the generation
 * loop (U8) can be wired in without circular deps.
 *
 * Heartbeat (Phase 6 P6.10): on `start()` a per-process worker_id
 * begins writing to `worker_heartbeats` every
 * DOPPL_HEARTBEAT_INTERVAL_MS (default 5s). The GET /runs/:id/health
 * endpoint reads this to surface a stalled worker.
 */
export interface WorkerOptions {
  // biome-ignore lint/suspicious/noExplicitAny: drizzle's tx generic varies by dialect
  db: NodePgDatabase<any>;
  pollMs?: number;
  processRun: (runId: string) => Promise<void>;
  /** Disable heartbeat — useful for tests not provisioning the table. */
  disableHeartbeat?: boolean;
}

export class Worker {
  // biome-ignore lint/suspicious/noExplicitAny: drizzle's tx generic varies by dialect
  private readonly db: NodePgDatabase<any>;
  private readonly pollMs: number;
  private readonly processRun: (runId: string) => Promise<void>;
  private readonly disableHeartbeat: boolean;
  private running = false;
  private currentRunPromise: Promise<void> | null = null;
  private heartbeat: HeartbeatHandle | null = null;

  constructor(options: WorkerOptions) {
    this.db = options.db;
    this.pollMs = options.pollMs ?? Number(process.env.DOPPL_WORKER_POLL_MS ?? "1000");
    this.processRun = options.processRun;
    this.disableHeartbeat = options.disableHeartbeat ?? false;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    if (!this.disableHeartbeat && this.heartbeat === null) {
      try {
        this.heartbeat = await startHeartbeat({ db: this.db });
      } catch (err) {
        process.stderr.write(`Worker: heartbeat start failed: ${String(err)}\n`);
      }
    }
    while (this.running) {
      // Skip polling while a run is in flight.
      if (this.currentRunPromise) {
        await this.currentRunPromise;
        this.currentRunPromise = null;
        continue;
      }
      const runId = await this.peekNextConfigured();
      if (runId === null) {
        // Nothing to do — sleep and try again.
        await sleep(this.pollMs);
        continue;
      }
      this.currentRunPromise = this.processRun(runId).catch((err: unknown) => {
        // The generation loop is responsible for emitting terminal
        // events on failure; the worker swallows the throw so it can
        // continue polling.
        process.stderr.write(`Worker: processRun(${runId}) failed: ${String(err)}\n`);
      });
    }
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.currentRunPromise) {
      await this.currentRunPromise;
      this.currentRunPromise = null;
    }
    if (this.heartbeat) {
      await this.heartbeat.stop();
      this.heartbeat = null;
    }
  }

  /** Query for the oldest run at status='configured'. Public for tests. */
  async peekNextConfigured(): Promise<string | null> {
    const result = await this.db.execute<{ id: string }>(
      sql`SELECT id FROM runs WHERE status = 'configured' ORDER BY configured_at ASC LIMIT 1`,
    );
    return result.rows[0]?.id ?? null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
