import { CONTRACTS_SCHEMA_VERSION, type RunEventEnvelope } from "@doppl/contracts";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { replayReader } from "../event-store/replay-reader.js";

/**
 * Projection-builder core (P6.1). Pure fold over a run's event log
 * strictly ordered by (runId, sequence). occurredAt is NEVER consulted.
 * Returns the folded state plus the highest sequence consumed —
 * `sequenceThrough` is the watermark consumers use to detect staleness.
 *
 * Invariants:
 *  - Event sequences within a run MUST be monotonic and gap-free
 *    starting at the first observed sequence. A gap or non-monotonic
 *    step throws ProjectionGapError rather than producing a partial
 *    projection silently.
 *  - Envelopes with schemaVersion > CONTRACTS_SCHEMA_VERSION are
 *    rejected (ProjectionForwardSchemaError). The replay-reader already
 *    enforces this at the envelope boundary; this is belt-and-braces.
 */

export class ProjectionGapError extends Error {
  constructor(runId: string, expected: number, actual: number) {
    super(
      `projection gap in run ${runId}: expected sequence ${expected}, got ${actual} (gap or non-monotonic)`,
    );
    this.name = "ProjectionGapError";
  }
}

export class ProjectionForwardSchemaError extends Error {
  constructor(runId: string, observed: number, current: number) {
    super(
      `projection rejects envelope with schemaVersion ${observed} > current ${current} for run ${runId}`,
    );
    this.name = "ProjectionForwardSchemaError";
  }
}

export interface BuildProjectionInput<TState> {
  // biome-ignore lint/suspicious/noExplicitAny: drizzle dialect-generic
  db: NodePgDatabase<any>;
  runId: string;
  initial: TState;
  reduce: (state: TState, event: RunEventEnvelope) => TState;
}

export interface BuiltProjection<TState> {
  state: TState;
  sequenceThrough: number;
  eventsConsumed: number;
}

/**
 * Sentinel returned when no events exist for the run.
 */
export const EMPTY_SEQUENCE_THROUGH = -1;

export async function buildProjection<TState>(
  input: BuildProjectionInput<TState>,
): Promise<BuiltProjection<TState>> {
  let state = input.initial;
  let sequenceThrough = EMPTY_SEQUENCE_THROUGH;
  let eventsConsumed = 0;
  let expectedNext: number | null = null;

  for await (const envelope of replayReader(input.db).events(input.runId)) {
    if (envelope.schemaVersion > CONTRACTS_SCHEMA_VERSION) {
      throw new ProjectionForwardSchemaError(
        input.runId,
        envelope.schemaVersion,
        CONTRACTS_SCHEMA_VERSION,
      );
    }
    if (expectedNext === null) {
      expectedNext = envelope.sequence;
    }
    if (envelope.sequence !== expectedNext) {
      throw new ProjectionGapError(input.runId, expectedNext, envelope.sequence);
    }
    state = input.reduce(state, envelope);
    sequenceThrough = envelope.sequence;
    eventsConsumed += 1;
    expectedNext = envelope.sequence + 1;
  }

  return { state, sequenceThrough, eventsConsumed };
}
