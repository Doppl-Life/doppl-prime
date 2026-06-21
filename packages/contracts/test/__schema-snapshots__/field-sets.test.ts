// P0.1 — §2.5 cross-track schema-snapshot gate. spec(§4) spec(§2.5): the envelope field-name set,
// the RunEventType member set, and the Actor member set each equal a checked-in frozen snapshot —
// any field/member add/remove/rename fails here BEFORE the parallel tracks fork (cross-track regression gate).
import { describe, it, expect } from 'vitest';
import { Actor, RunEventType, RunEventEnvelope, CURRENT_SCHEMA_VERSION } from '@doppl/contracts';

const ENVELOPE_FIELD_SNAPSHOT = [
  'id',
  'runId',
  'generationId',
  'agenomeId',
  'candidateId',
  'type',
  'sequence',
  'occurredAt',
  'actor',
  'correlationId',
  'langfuseTraceId',
  'langfuseObservationId',
  'payload',
  'schemaVersion',
];

const EVENT_TYPE_SNAPSHOT = [
  'run.configured',
  'run.started',
  'run.completed',
  'run.failed',
  'run.stopped',
  'generation.started',
  'generation.completed',
  'agenome.spawned',
  'agenome.fused',
  'agenome.mutated',
  'agenome.reproduced',
  'candidate.created',
  'critic.reviewed',
  'check.completed',
  // judge-output amendment: held-out judge acceptance result (narrows to JudgeResult).
  'judge.reviewed',
  'novelty.scored',
  'fitness.scored',
  'lineage.culled',
  'energy.spent',
  'provider_call_failed',
  'output_schema_rejected',
  'candidate_invalidated',
  'energy_exhausted',
  'generation_failed',
  'reproduction_aborted_insufficient_parents',
  'novelty_scoring_degraded',
  // P0.1-amend: 11 operation-start / in-flight observability markers (25 → 36).
  'generation.verifying',
  'generation.scoring',
  'generation.reproducing',
  'candidate.generation_started',
  'critic.review_started',
  'check.started',
  'novelty.scoring_started',
  'judge.review_started',
  'fusion.started',
  'tool_call.started',
  'tool_call.finished',
];

const ACTOR_SNAPSHOT = [
  'operator',
  'runtime',
  'agenome',
  'critic',
  'check_runner',
  'selection_controller',
  'system',
];

const sorted = (a: readonly string[]): string[] => [...a].sort();

describe('schema snapshots — frozen field/member sets (spec §4 / §2.5)', () => {
  it('barrel_exports_schemas_and_types', () => {
    // spec(§2.5): the public surface re-exports every schema + the version constant from one barrel.
    expect(typeof Actor.parse).toBe('function');
    expect(typeof RunEventType.parse).toBe('function');
    expect(typeof RunEventEnvelope.parse).toBe('function');
    expect(Number.isInteger(CURRENT_SCHEMA_VERSION)).toBe(true);
    // judge-output amendment: deliberate schemaVersion bump 2 → 3 (P0.1-amend bumped 1 → 2), pinned
    // by literal so it can't move silently.
    expect(CURRENT_SCHEMA_VERSION).toBe(3);
  });

  it('schema_snapshot_field_and_member_sets', () => {
    // spec(§4) spec(§2.5): live schema field/member sets == the checked-in frozen snapshots.
    expect(sorted(Object.keys(RunEventEnvelope.shape))).toEqual(sorted(ENVELOPE_FIELD_SNAPSHOT));
    expect(sorted(RunEventType.options)).toEqual(sorted(EVENT_TYPE_SNAPSHOT));
    expect(sorted(Actor.options)).toEqual(sorted(ACTOR_SNAPSHOT));
    expect(ENVELOPE_FIELD_SNAPSHOT).toHaveLength(14);
    expect(EVENT_TYPE_SNAPSHOT).toHaveLength(37);
    expect(ACTOR_SNAPSHOT).toHaveLength(7);
  });
});
