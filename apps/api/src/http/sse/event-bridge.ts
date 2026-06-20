import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { replayReader } from "../../event-store/replay-reader.js";

/**
 * SSE event-bridge (P6.9). MVP implementation uses the polling path —
 * the SSE handler asks `nextEventsAfter(runId, cursor)` every
 * DOPPL_SSE_POLLING_FALLBACK_MS (default 250) for new events. A future
 * iteration can swap in Postgres LISTEN/NOTIFY by replacing the
 * polling loop; the consumer-side API stays the same.
 *
 * Catch-up + live use the same primitive: nextEventsAfter pulls every
 * event with sequence > cursor and returns it in order. The caller
 * advances the cursor as it emits.
 */

export interface SerializedEvent {
  id: string;
  sequence: number;
  type: string;
  actor: string;
  occurredAt: string;
  runId: string;
  candidateId?: string;
  agenomeId?: string;
  generationId?: string;
  correlationId?: string;
  payload: unknown;
  /** Required by the client-side RunEventEnvelope schema; omitting it makes
   *  every SSE frame fail safeParse and silently drop. */
  schemaVersion: number;
}

export interface EventBridgeDeps {
  // biome-ignore lint/suspicious/noExplicitAny: drizzle dialect-generic
  db: NodePgDatabase<any>;
}

export async function nextEventsAfter(
  deps: EventBridgeDeps,
  runId: string,
  cursor: number,
  limit = 200,
): Promise<SerializedEvent[]> {
  const events: SerializedEvent[] = [];
  for await (const env of replayReader(deps.db).events(runId)) {
    if (env.sequence <= cursor) continue;
    events.push({
      id: env.id,
      sequence: env.sequence,
      type: env.type,
      actor: env.actor,
      occurredAt: String(env.occurredAt),
      runId: env.runId,
      ...(env.candidateId !== undefined ? { candidateId: env.candidateId } : {}),
      ...(env.agenomeId !== undefined ? { agenomeId: env.agenomeId } : {}),
      ...(env.generationId !== undefined ? { generationId: env.generationId } : {}),
      ...(env.correlationId !== undefined ? { correlationId: env.correlationId } : {}),
      payload: env.payload,
      schemaVersion: env.schemaVersion,
    });
    if (events.length >= limit) break;
  }
  return events;
}

export async function getHeadSequence(deps: EventBridgeDeps, runId: string): Promise<number> {
  const result = await deps.db.execute<{ max: string | null }>(
    sql`SELECT MAX(sequence)::text AS max FROM run_events WHERE run_id = ${runId}`,
  );
  const raw = result.rows[0]?.max;
  return raw === null || raw === undefined ? -1 : Number(raw);
}

export function formatSseFrame(event: SerializedEvent): string {
  const data = JSON.stringify(event);
  return `id: ${event.sequence}\nevent: ${event.type}\ndata: ${data}\n\n`;
}
