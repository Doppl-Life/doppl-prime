import { describe, expect, test } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION,
  validRunCaps,
  validCandidateIdeaCrossDomain,
} from '@doppl/contracts';
import { buildRunHealth, type RunEventRow } from '../../../src/projections';

/**
 * P6.8 — run-health projection (pure unit). spec(§11/§12/§4): a read-only runtime signal derived from
 * the log — generation count, candidates-in-flight (non-terminal), operations-in-flight (UNPAIRED
 * operation-start markers: count(*_started) - count(completion), clamped ≥0), last-event time,
 * caps-consumed CLAMPED to the configured ceiling (never over-reports). Judge pairing is sv3-reconcile.
 */

let idCounter = 0;
function makeRow(
  type: string,
  fields: Partial<RunEventRow> & { sequence: number; runId: string },
): RunEventRow {
  return {
    id: `evt-${idCounter++}`,
    runId: fields.runId,
    generationId: fields.generationId ?? null,
    agenomeId: fields.agenomeId ?? null,
    candidateId: fields.candidateId ?? null,
    type,
    sequence: fields.sequence,
    occurredAt: fields.occurredAt ?? new Date('2026-06-21T00:00:00.000Z'),
    actor: 'runtime',
    correlationId: null,
    langfuseTraceId: null,
    langfuseObservationId: null,
    payload: fields.payload ?? {},
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
}

describe('buildRunHealth — read-only runtime signal from the log (spec §11/§12)', () => {
  // §4/§12 — operations-in-flight = unpaired operation-start markers (count start - count completion).
  test('test_operations_in_flight_from_unpaired_markers', () => {
    const runId = 'run_1';
    const open = buildRunHealth([
      makeRow('run.configured', { runId, sequence: 0, payload: { seed: 's', caps: validRunCaps } }),
      makeRow('critic.review_started', { runId, sequence: 1 }), // unpaired
      makeRow('check.started', { runId, sequence: 2 }), // unpaired
    ]);
    expect(open.operationsInFlight.byType.critic).toBe(1);
    expect(open.operationsInFlight.byType.check).toBe(1);
    expect(open.operationsInFlight.total).toBe(2);

    const closed = buildRunHealth([
      makeRow('run.configured', { runId, sequence: 0, payload: { seed: 's', caps: validRunCaps } }),
      makeRow('critic.review_started', { runId, sequence: 1 }),
      makeRow('critic.reviewed', {
        runId,
        sequence: 2,
        payload: { id: 'rev_1', candidateId: 'cand_1' },
      }),
    ]);
    expect(closed.operationsInFlight.byType.critic).toBe(0); // paired → cleared
    expect(closed.operationsInFlight.total).toBe(0);
  });

  // §11 — caps-consumed reports usage vs RunCaps and is CLAMPED to the ceiling (never exceeds).
  test('test_caps_consumed_never_exceeds_ceiling', () => {
    const runId = 'run_caps';
    const events: RunEventRow[] = [
      makeRow('run.configured', { runId, sequence: 0, payload: { seed: 's', caps: validRunCaps } }),
    ];
    // start far more generations than the ceiling allows.
    let seq = 1;
    for (let g = 0; g < validRunCaps.maxGenerations + 5; g++) {
      events.push(
        makeRow('generation.started', { runId, generationId: `gen_${g}`, sequence: seq++ }),
      );
    }
    const health = buildRunHealth(events);
    expect(health.capsConsumed?.generations.ceiling).toBe(validRunCaps.maxGenerations);
    expect(health.capsConsumed?.generations.consumed).toBe(validRunCaps.maxGenerations); // clamped
    expect(health.capsConsumed?.generations.consumed).toBeLessThanOrEqual(
      health.capsConsumed?.generations.ceiling ?? 0,
    );
  });

  // §11 — candidates-in-flight = candidates whose status is not terminal (selected/rejected/culled/invalid).
  test('test_candidates_in_flight_counts_non_terminal', () => {
    const runId = 'run_cand';
    const created = { ...validCandidateIdeaCrossDomain, id: 'c_open', status: 'created' as const };
    const selected = {
      ...validCandidateIdeaCrossDomain,
      id: 'c_done',
      status: 'selected' as const,
    };
    const health = buildRunHealth([
      makeRow('run.configured', { runId, sequence: 0, payload: { seed: 's', caps: validRunCaps } }),
      makeRow('candidate.created', { runId, sequence: 1, payload: created }),
      makeRow('candidate.created', { runId, sequence: 2, payload: selected }),
    ]);
    expect(health.candidatesInFlight).toBe(1); // only the non-terminal 'created' one
  });

  // §11 — generation count + last-event time reflect the folded log.
  test('test_generation_count_and_last_event_time', () => {
    const runId = 'run_gen';
    const health = buildRunHealth([
      makeRow('run.configured', { runId, sequence: 0, payload: { seed: 's', caps: validRunCaps } }),
      makeRow('generation.started', { runId, generationId: 'gen_0', sequence: 1 }),
      makeRow('generation.started', {
        runId,
        generationId: 'gen_1',
        sequence: 2,
        occurredAt: new Date('2026-06-21T05:00:00.000Z'),
      }),
    ]);
    expect(health.generationCount).toBe(2);
    expect(health.lastEventAt).toBe('2026-06-21T05:00:00.000Z'); // the highest-sequence event's stamp
    expect(health.sequenceThrough).toBe(2);
  });

  // §11 — with no caps in run.configured, capsConsumed is null (can't report ceilings).
  test('test_caps_consumed_null_without_config', () => {
    const runId = 'run_nocaps';
    const health = buildRunHealth([makeRow('run.started', { runId, sequence: 0 })]);
    expect(health.capsConsumed).toBeNull();
  });
});
