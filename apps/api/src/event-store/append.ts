import { asc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { z } from 'zod';
import { RunEventEnvelope, validateEventPayload } from '@doppl/contracts';
import { runEvents } from './schema';
import { scrubEventPayload } from './redaction';
import { allocateSequence } from './sequence';

/**
 * The single authoritative append path for `run_events` (KEY SAFETY RULES #2 + #4, ARCHITECTURE.md
 * §4/§14). One transaction does: validate the envelope (frozen RunEventEnvelope) → per-type narrow +
 * payload-DoS ceiling (P0.10) → secret-redaction scrub (P1.2) → allocate the per-run monotonic
 * sequence (advisory-lock serialized) → insert. It relies on the P1.4 append-only trigger +
 * unique(run_id, sequence). The store exposes ONLY append + an ordered read — never update/delete.
 */

// The append input is the envelope MINUS the two server/DB-assigned fields: `sequence` (the writer
// allocates it) and `occurredAt` (the DB stamps it). Omitting them makes "the caller can't set the
// log's clock or ordering" safe-by-construction (rule #2), not merely discarded by discipline.
const AppendInputSchema = RunEventEnvelope.omit({ sequence: true, occurredAt: true });
export type AppendInput = z.infer<typeof AppendInputSchema>;

export interface AppendResult {
  id: string;
  runId: string;
  sequence: number;
}

export type AppendRejectionReason = 'schema_invalid' | 'max_bytes' | 'max_depth' | 'shape_mismatch';

/** A rejected append — the writer is a pure mechanism; the caller (P3 kernel) emits the failure event. */
export class AppendError extends Error {
  constructor(
    public readonly reason: AppendRejectionReason,
    message: string,
  ) {
    super(message);
    this.name = 'AppendError';
  }
}

export type RunEventRow = typeof runEvents.$inferSelect;

export interface EventStore {
  append(input: AppendInput): Promise<AppendResult>;
  readByRun(runId: string): Promise<RunEventRow[]>;
}

export interface EventStoreDeps {
  db: NodePgDatabase;
  /** Loaded process.env secret values, injected at boot (IO at the boundary, LESSONS 4). */
  secretValues: readonly string[];
}

export function createEventStore({ db, secretValues }: EventStoreDeps): EventStore {
  return {
    async append(input: AppendInput): Promise<AppendResult> {
      return db.transaction(async (tx) => {
        // 1. Validate the envelope (strict, minus server/DB-assigned fields) — in-txn, so a
        //    schema-invalid envelope rejects with nothing written.
        const parsed = AppendInputSchema.safeParse(input);
        if (!parsed.success) {
          throw new AppendError(
            'schema_invalid',
            `envelope failed validation: ${parsed.error.message}`,
          );
        }
        const env = parsed.data;

        // 2. Per-type narrow + payload-DoS ceiling. Returns the PARSED payload (lesson §18), so a
        //    pre-transform value can't reach the authoritative log.
        const validated = validateEventPayload(env.type, env.payload);
        if (!validated.ok) {
          throw new AppendError(validated.reason, `payload rejected: ${validated.reason}`);
        }

        // 3. Secret-redaction scrub BEFORE insert (rule #4 / §14) — on the validated payload. Covers
        //    over-persisted raw outputs + opaque gateway passthroughs; an unscrubbed payload can't land.
        const scrubbedPayload = scrubEventPayload(validated.payload, secretValues);

        // 4. Allocate the per-run monotonic gapless sequence (advisory-lock serialized).
        const sequence = await allocateSequence(tx, env.runId);

        // 5. Insert — occurred_at omitted so the DB stamps it (UTC, never caller-ordered).
        await tx.insert(runEvents).values({
          id: env.id,
          runId: env.runId,
          generationId: env.generationId,
          agenomeId: env.agenomeId,
          candidateId: env.candidateId,
          type: env.type,
          sequence,
          actor: env.actor,
          correlationId: env.correlationId,
          langfuseTraceId: env.langfuseTraceId,
          langfuseObservationId: env.langfuseObservationId,
          payload: scrubbedPayload,
          schemaVersion: env.schemaVersion,
        });

        return { id: env.id, runId: env.runId, sequence };
      });
    },

    async readByRun(runId: string): Promise<RunEventRow[]> {
      return db
        .select()
        .from(runEvents)
        .where(eq(runEvents.runId, runId))
        .orderBy(asc(runEvents.sequence));
    },
  };
}
