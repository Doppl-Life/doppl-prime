import { validCandidateIdeaCrossDomain, validFitnessScore } from '@doppl/contracts';
import type { RunEventRow } from '../../../src/projections';

/**
 * A committed OLDER-schemaVersion (v1) run fixture (ARCHITECTURE.md §16 replay must-pass). Proves the
 * replay reader accepts `schemaVersion ≤ current` and folds a pre-amend log to a valid summary. Uses
 * ONLY v1 event types (the 11 operation-start markers are v2-only, P0.1-amend), so it is a faithful
 * pre-amend log. Shaped as persisted `run_events` rows (`RunEventRow`); `occurredAt` is display-only.
 */

const SCHEMA_V1 = 1;
const RUN_ID = 'older-run';

let counter = 0;
function row(type: string, sequence: number, fields: Partial<RunEventRow> = {}): RunEventRow {
  return {
    id: `older-evt-${counter++}`,
    runId: RUN_ID,
    generationId: fields.generationId ?? null,
    agenomeId: fields.agenomeId ?? null,
    candidateId: fields.candidateId ?? null,
    type,
    sequence,
    occurredAt: new Date('2026-06-19T00:00:00.000Z'),
    actor: 'runtime',
    correlationId: null,
    langfuseTraceId: null,
    langfuseObservationId: null,
    payload: fields.payload ?? {},
    schemaVersion: SCHEMA_V1,
  };
}

// The winning candidate carries status 'selected' so the replay digest can surface the final winner.
const winner = { ...validCandidateIdeaCrossDomain, status: 'selected' as const };

export const OLDER_SCHEMA_RUN_ID = RUN_ID;

export const OLDER_SCHEMA_RUN: RunEventRow[] = [
  row('run.configured', 0, { payload: { seed: 'scenario-older', rngSeed: 7 } }),
  row('generation.started', 1, { generationId: 'gen_1' }),
  row('agenome.spawned', 2, { generationId: 'gen_1', agenomeId: 'agn_1' }),
  row('candidate.created', 3, { payload: winner }),
  row('fitness.scored', 4, { payload: validFitnessScore }),
  row('run.completed', 5, {}),
];
