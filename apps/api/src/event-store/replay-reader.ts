import { CONTRACTS_SCHEMA_VERSION, RunEventEnvelope } from "@doppl/contracts";
import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

/**
 * Thrown when the replay reader encounters an envelope whose
 * `schemaVersion` exceeds `CONTRACTS_SCHEMA_VERSION`. Per
 * `ARCHITECTURE.md §4` readers accept any `schemaVersion ≤ current` and
 * reject anything newer (forward-compat is the one direction allowed).
 */
export class ReplaySchemaTooNewError extends Error {
  public readonly eventId: string;
  public readonly schemaVersion: number;
  public readonly currentSchemaVersion: number;
  constructor(eventId: string, schemaVersion: number) {
    super(
      `Replay aborted: event ${eventId} has schemaVersion ${schemaVersion} > current ${CONTRACTS_SCHEMA_VERSION}`,
    );
    this.name = "ReplaySchemaTooNewError";
    this.eventId = eventId;
    this.schemaVersion = schemaVersion;
    this.currentSchemaVersion = CONTRACTS_SCHEMA_VERSION;
  }
}

/**
 * Thrown when the replay reader observes a gap or out-of-order sequence
 * in the stored log. Under healthy operation (U4 + U5) this cannot
 * happen — its purpose is to surface DB corruption or a future code
 * change that bypasses the writer.
 */
export class ReplaySequenceGapError extends Error {
  public readonly runId: string;
  public readonly expected: number;
  public readonly actual: number;
  constructor(runId: string, expected: number, actual: number) {
    super(
      `Replay aborted: run ${runId} expected sequence ${expected} but got ${actual} (gap or out-of-order)`,
    );
    this.name = "ReplaySequenceGapError";
    this.runId = runId;
    this.expected = expected;
    this.actual = actual;
  }
}

interface RawEventRow {
  id: string;
  run_id: string;
  sequence: number | string;
  occurred_at: Date | string;
  type: string;
  actor: string;
  payload: unknown;
  schema_version: number;
  correlation_id: string | null;
  langfuse_trace_id: string | null;
  langfuse_observation_id: string | null;
  generation_id: string | null;
  agenome_id: string | null;
  candidate_id: string | null;
}

function rowToEnvelope(row: RawEventRow): RunEventEnvelope {
  const occurredAt =
    row.occurred_at instanceof Date
      ? row.occurred_at.toISOString()
      : new Date(row.occurred_at).toISOString();
  return RunEventEnvelope.parse({
    id: row.id,
    runId: row.run_id,
    sequence: Number(row.sequence),
    occurredAt,
    type: row.type,
    actor: row.actor,
    payload: row.payload,
    schemaVersion: row.schema_version,
    ...(row.correlation_id ? { correlationId: row.correlation_id } : {}),
    ...(row.langfuse_trace_id ? { langfuseTraceId: row.langfuse_trace_id } : {}),
    ...(row.langfuse_observation_id ? { langfuseObservationId: row.langfuse_observation_id } : {}),
    ...(row.generation_id ? { generationId: row.generation_id } : {}),
    ...(row.agenome_id ? { agenomeId: row.agenome_id } : {}),
    ...(row.candidate_id ? { candidateId: row.candidate_id } : {}),
  });
}

/**
 * Build a replay reader bound to a database connection. Per
 * `ARCHITECTURE.md §4 / §14` and `IMPLEMENTATION_PLAN.md P1.8`:
 *  - events are yielded strictly in `(run_id, sequence ASC)` order
 *  - no model, embedding, or web call is ever issued
 *  - any row with `schemaVersion > CONTRACTS_SCHEMA_VERSION` aborts
 *    replay (a `ReplaySchemaTooNewError`)
 *  - any sequence gap or out-of-order row aborts replay (a
 *    `ReplaySequenceGapError`)
 *
 * The structural no-external-calls invariant is pinned by a source-grep
 * test (mirroring U7's evidence-resolver grep).
 */
export function replayReader(
  // biome-ignore lint/suspicious/noExplicitAny: drizzle's tx generic varies by dialect
  db: NodePgDatabase<any>,
) {
  return {
    events(runId: string): AsyncIterable<RunEventEnvelope> {
      return {
        async *[Symbol.asyncIterator]() {
          const result = await db.execute<RawEventRow>(
            sql`SELECT * FROM run_events WHERE run_id = ${runId} ORDER BY sequence ASC`,
          );
          let expected = 0;
          for (const row of result.rows) {
            const actualSeq = Number(row.sequence);
            if (actualSeq !== expected) {
              throw new ReplaySequenceGapError(runId, expected, actualSeq);
            }
            if (row.schema_version > CONTRACTS_SCHEMA_VERSION) {
              throw new ReplaySchemaTooNewError(row.id, row.schema_version);
            }
            yield rowToEnvelope(row);
            expected += 1;
          }
        },
      };
    },
  };
}
