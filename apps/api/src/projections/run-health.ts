import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { replayReader } from "../event-store/replay-reader.js";

/**
 * Run health projection (P6.8). Pure read over the persisted event log
 * plus the optional worker_heartbeats row (U10). Returns:
 *  - status: derived from terminal events; "stalled" when worker
 *    heartbeat is older than 2× the configured cadence
 *  - currentGeneration: count of `generation.started` events
 *  - candidatesInFlight: created candidates not in {invalid, rejected,
 *    culled}. (Phase 5 emits selection events; this approximates by
 *    using `candidate.created - candidate_invalidated`.)
 *  - lastEventOccurredAt: max occurred_at from run_events
 *  - capsConsumed: energy (sum of energy.spent.actual), generations
 *    (started count), candidates (created count), toolCalls (sum of
 *    energy events with eventType=tool)
 *  - lastHeartbeatMs: ms since worker_heartbeats.beat_at when present
 */

const STALL_MULTIPLIER = 2;
const DEFAULT_HEARTBEAT_INTERVAL_MS = Number(process.env.DOPPL_HEARTBEAT_INTERVAL_MS ?? "5000");

export type RunHealthStatus =
  | "configured"
  | "running"
  | "completed"
  | "stopped"
  | "failed"
  | "cancelled"
  | "stalled"
  | "unknown";

export interface RunHealth {
  runId: string;
  status: RunHealthStatus;
  currentGeneration: number;
  candidatesInFlight: number;
  lastEventOccurredAt: string | null;
  capsConsumed: {
    energy: number;
    generations: number;
    candidates: number;
    toolCalls: number;
  };
  lastHeartbeatMs: number | null;
}

interface EnergyPayload {
  energy?: { actual?: number; estimate?: number; eventType?: string };
}

interface CandidateInvalidatedPayload {
  candidateId?: string;
}

async function fetchLastHeartbeatMs(
  // biome-ignore lint/suspicious/noExplicitAny: drizzle dialect-generic
  db: NodePgDatabase<any>,
): Promise<number | null> {
  try {
    const result = await db.execute<{ beat_at: Date | string | null }>(
      sql`SELECT MAX(beat_at) AS beat_at FROM worker_heartbeats`,
    );
    const raw = result.rows[0]?.beat_at;
    if (!raw) return null;
    const at = raw instanceof Date ? raw : new Date(raw);
    return Date.now() - at.getTime();
  } catch (_err) {
    // Table absent (pre-U10 migration) — treat as no heartbeat.
    return null;
  }
}

export interface BuildRunHealthInput {
  // biome-ignore lint/suspicious/noExplicitAny: drizzle dialect-generic
  db: NodePgDatabase<any>;
  runId: string;
}

export async function buildRunHealth(input: BuildRunHealthInput): Promise<RunHealth | null> {
  // Confirm the run exists
  const runRow = await input.db.execute<{ id: string; status: string }>(
    sql`SELECT id, status FROM runs WHERE id = ${input.runId} LIMIT 1`,
  );
  if (!runRow.rows[0]) return null;
  const baseStatus = runRow.rows[0].status as RunHealthStatus;

  let currentGeneration = 0;
  let candidatesCreated = 0;
  let candidatesInvalidated = 0;
  let energySpent = 0;
  let toolCalls = 0;
  let lastEventOccurredAt: string | null = null;

  for await (const env of replayReader(input.db).events(input.runId)) {
    lastEventOccurredAt = String(env.occurredAt);
    switch (env.type) {
      case "generation.started":
        currentGeneration += 1;
        break;
      case "candidate.created":
        candidatesCreated += 1;
        break;
      case "candidate_invalidated":
        candidatesInvalidated += 1;
        break;
      case "energy.spent": {
        const energy = (env.payload as EnergyPayload).energy;
        if (energy) {
          energySpent += energy.actual ?? energy.estimate ?? 0;
          if (energy.eventType === "tool") toolCalls += 1;
        }
        break;
      }
      default: {
        // Touch a typed payload accessor on candidate_invalidated for
        // future expansion without losing the linter's exhaustive-check
        // intent.
        void (env.payload as CandidateInvalidatedPayload);
        break;
      }
    }
  }

  const lastHeartbeatMs = await fetchLastHeartbeatMs(input.db);
  let status: RunHealthStatus = baseStatus;
  if (
    baseStatus === "running" &&
    lastHeartbeatMs !== null &&
    lastHeartbeatMs > STALL_MULTIPLIER * DEFAULT_HEARTBEAT_INTERVAL_MS
  ) {
    status = "stalled";
  }

  return {
    runId: input.runId,
    status,
    currentGeneration,
    candidatesInFlight: Math.max(0, candidatesCreated - candidatesInvalidated),
    lastEventOccurredAt,
    capsConsumed: {
      energy: energySpent,
      generations: currentGeneration,
      candidates: candidatesCreated,
      toolCalls,
    },
    lastHeartbeatMs,
  };
}
