import { randomUUID } from "node:crypto";
import {
  type Actor,
  CONTRACTS_SCHEMA_VERSION,
  RunEventEnvelope,
  type RunEventType,
  parseEventPayload,
  redact,
} from "@doppl/contracts";
import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { nextSequence } from "./sequence.js";

/**
 * Input to `appendEvent`. Mirrors `RunEventEnvelope` minus the fields the
 * writer assigns: `id` (random UUID by default), `sequence` (allocated
 * inside the TX by `nextSequence`), `occurredAt` (stamped by Postgres
 * `DEFAULT NOW()`), `schemaVersion` (defaults to
 * `CONTRACTS_SCHEMA_VERSION`).
 *
 * The caller may supply `id` or `schemaVersion` for replay/import use,
 * but a `schemaVersion > CONTRACTS_SCHEMA_VERSION` is rejected as a
 * forward-compat violation.
 */
export interface AppendEventInput {
  runId: string;
  type: RunEventType;
  actor: Actor;
  payload: unknown;
  generationId?: string;
  agenomeId?: string;
  candidateId?: string;
  correlationId?: string;
  langfuseTraceId?: string;
  langfuseObservationId?: string;
  id?: string;
  schemaVersion?: number;
}

export interface AppendEventResult {
  id: string;
  sequence: number;
  occurredAt: Date;
}

/**
 * Validate, redact, and append a single event to `run_events` in one
 * transaction. The §14 safety pin:
 *  1. Per-type payload validation (rejects a malformed payload before any
 *     DB work).
 *  2. Envelope shape validation against `RunEventEnvelope` (rejects bad
 *     actor / type / forward schemaVersion).
 *  3. `redact()` runs on the payload (no secret reaches the storage tier).
 *  4. `nextSequence(tx, runId)` allocates a gapless monotonic sequence
 *     under an advisory lock.
 *  5. `INSERT … RETURNING` returns the DB-stamped `occurred_at`.
 *
 * Any step failing rolls back the whole transaction — the row is never
 * partially written.
 */
export async function appendEvent(
  // biome-ignore lint/suspicious/noExplicitAny: drizzle's tx generic varies by dialect; only `execute` is used here
  db: NodePgDatabase<any>,
  input: AppendEventInput,
): Promise<AppendEventResult> {
  // 1. Per-type payload validation (outside TX — pure).
  parseEventPayload(input.type, input.payload);

  // 2. Envelope shape validation. `sequence` and `occurredAt` get placeholder
  //    values for parse-time only; the real sequence is assigned in the TX
  //    and `occurredAt` is stamped by Postgres at insert.
  const id = input.id ?? randomUUID();
  const schemaVersion = input.schemaVersion ?? CONTRACTS_SCHEMA_VERSION;
  if (schemaVersion > CONTRACTS_SCHEMA_VERSION) {
    throw new Error(
      `appendEvent: schemaVersion ${schemaVersion} exceeds CONTRACTS_SCHEMA_VERSION ${CONTRACTS_SCHEMA_VERSION}`,
    );
  }
  RunEventEnvelope.parse({
    id,
    runId: input.runId,
    type: input.type,
    sequence: 0,
    occurredAt: new Date().toISOString(),
    actor: input.actor,
    payload: input.payload,
    schemaVersion,
    ...(input.generationId !== undefined ? { generationId: input.generationId } : {}),
    ...(input.agenomeId !== undefined ? { agenomeId: input.agenomeId } : {}),
    ...(input.candidateId !== undefined ? { candidateId: input.candidateId } : {}),
    ...(input.correlationId !== undefined ? { correlationId: input.correlationId } : {}),
    ...(input.langfuseTraceId !== undefined ? { langfuseTraceId: input.langfuseTraceId } : {}),
    ...(input.langfuseObservationId !== undefined
      ? { langfuseObservationId: input.langfuseObservationId }
      : {}),
  });

  // 3. Redact payload (no secret reaches the storage tier).
  const scrubbedPayload = redact(input.payload);

  // 4 + 5. Sequence + insert in one TX.
  return db.transaction(async (tx) => {
    const sequence = await nextSequence(tx, input.runId);
    const result = await tx.execute<{
      id: string;
      sequence: number | string;
      occurred_at: Date | string;
    }>(
      sql`INSERT INTO run_events
            (id, run_id, sequence, type, actor, payload, schema_version,
             correlation_id, langfuse_trace_id, langfuse_observation_id,
             generation_id, agenome_id, candidate_id)
          VALUES (${id}, ${input.runId}, ${sequence}, ${input.type}, ${input.actor},
                  ${sql.raw(`'${JSON.stringify(scrubbedPayload).replace(/'/g, "''")}'::jsonb`)},
                  ${schemaVersion},
                  ${input.correlationId ?? null},
                  ${input.langfuseTraceId ?? null},
                  ${input.langfuseObservationId ?? null},
                  ${input.generationId ?? null},
                  ${input.agenomeId ?? null},
                  ${input.candidateId ?? null})
          RETURNING id, sequence, occurred_at`,
    );
    const row = result.rows[0];
    if (!row) throw new Error("appendEvent: empty insert result");
    return {
      id: row.id,
      sequence: Number(row.sequence),
      // Drizzle's tx.execute returns raw rows without pg's automatic
      // timestamptz → Date conversion. Coerce here so the public return
      // type is always a Date.
      occurredAt: row.occurred_at instanceof Date ? row.occurred_at : new Date(row.occurred_at),
    };
  });
}
