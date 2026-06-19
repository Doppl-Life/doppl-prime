import { type EvidenceRef, RunEventEnvelope } from "@doppl/contracts";
import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

/**
 * Result of resolving an EvidenceRef. Per `ARCHITECTURE.md §9` the
 * resolver NEVER reaches outside Postgres — external-only references
 * fail closed (return `external_only` or `langfuse_only`) rather than
 * issuing a network call. Callers handle the closed-fail cases
 * explicitly.
 */
export type EvidenceResolution =
  | { status: "resolved"; event: RunEventEnvelope }
  | { status: "not_found"; eventId: string }
  | { status: "external_only"; uri: string }
  | { status: "langfuse_only"; langfuseObservationId: string };

/**
 * Dereference an EvidenceRef strictly within the Postgres tier.
 *
 * Precedence:
 *   1. `eventId` is authoritative — when present, look up `run_events`
 *      and return `resolved` or `not_found`.
 *   2. `langfuseObservationId` only — return `langfuse_only` (Langfuse
 *      is a non-authoritative side channel; the resolver does not
 *      contact it).
 *   3. `uri` only — return `external_only`.
 *   4. No locator — return `external_only` with an empty string uri
 *      (defensive; should not happen with a well-formed EvidenceRef).
 *
 * If both `eventId` and `uri` are supplied, `eventId` wins.
 */
export async function resolveEvidence(
  // biome-ignore lint/suspicious/noExplicitAny: drizzle's tx generic varies by dialect
  db: NodePgDatabase<any>,
  ref: EvidenceRef,
): Promise<EvidenceResolution> {
  if (ref.eventId !== undefined) {
    const result = await db.execute<{
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
    }>(sql`SELECT * FROM run_events WHERE id = ${ref.eventId} LIMIT 1`);
    const row = result.rows[0];
    if (!row) return { status: "not_found", eventId: ref.eventId };
    const occurredAt =
      row.occurred_at instanceof Date
        ? row.occurred_at.toISOString()
        : new Date(row.occurred_at).toISOString();
    const envelope = RunEventEnvelope.parse({
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
      ...(row.langfuse_observation_id
        ? { langfuseObservationId: row.langfuse_observation_id }
        : {}),
      ...(row.generation_id ? { generationId: row.generation_id } : {}),
      ...(row.agenome_id ? { agenomeId: row.agenome_id } : {}),
      ...(row.candidate_id ? { candidateId: row.candidate_id } : {}),
    });
    return { status: "resolved", event: envelope };
  }

  if (ref.langfuseObservationId !== undefined) {
    return {
      status: "langfuse_only",
      langfuseObservationId: ref.langfuseObservationId,
    };
  }

  return { status: "external_only", uri: ref.uri ?? "" };
}
