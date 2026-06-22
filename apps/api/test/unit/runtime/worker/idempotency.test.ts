import { describe, expect, test } from 'vitest';
import type { RunEventType } from '@doppl/contracts';
import { CURRENT_SCHEMA_VERSION } from '@doppl/contracts';
import type { RunEventRow } from '../../../../src/event-store';
import {
  guardStep,
  sequenceWatermark,
  stepAlreadyRecorded,
} from '../../../../src/runtime/worker/idempotency';

/**
 * P3.12 — sequence-watermark idempotency (ARCHITECTURE.md §5 "every job is idempotent, guarded by
 * event-sequence checks" + §4 per-run monotonic `sequence`). PURE over the persisted log: a step whose
 * events already exist is a no-op (no double-append, no double `energy.spent` debit — rule #8); the guard
 * keys off the PERSISTED log/sequence watermark, never an in-memory counter.
 */

let autoSeq = 0;
function row(over: Partial<RunEventRow> & { type: RunEventType }): RunEventRow {
  const sequence = over.sequence ?? autoSeq++;
  return {
    id: over.id ?? `e-${sequence}`,
    runId: over.runId ?? 'run_w',
    generationId: over.generationId ?? null,
    agenomeId: over.agenomeId ?? null,
    candidateId: over.candidateId ?? null,
    type: over.type,
    sequence,
    occurredAt: over.occurredAt ?? new Date(0),
    actor: over.actor ?? 'runtime',
    correlationId: over.correlationId ?? null,
    langfuseTraceId: over.langfuseTraceId ?? null,
    langfuseObservationId: over.langfuseObservationId ?? null,
    payload: over.payload ?? {},
    schemaVersion: over.schemaVersion ?? CURRENT_SCHEMA_VERSION,
  } as RunEventRow;
}

describe('idempotency (P3.12 — sequence-watermark step guard)', () => {
  // spec(§5) — a step whose event is already in the log is skipped (no-op, appends nothing).
  test('step_already_in_log_is_noop', () => {
    const log = [row({ type: 'run.configured' }), row({ type: 'run.started' })];
    const decision = guardStep(log, { type: 'run.started' });
    expect(decision.run).toBe(false);
    if (!decision.run) expect(decision.reason).toBe('already_recorded');
  });

  // spec(§5) — a step with no persisted event runs.
  test('fresh_step_executes', () => {
    const log = [row({ type: 'run.configured' })];
    expect(guardStep(log, { type: 'run.started' }).run).toBe(true);
  });

  // rule #8 + spec(§5) — re-entering a step that already emitted `energy.spent` (matched by scope) is a
  // no-op, so it never debits energy a second time.
  test('no_double_energy_debit_on_reentry', () => {
    const log = [
      row({ type: 'generation.started', generationId: 'g0' }),
      row({ type: 'energy.spent', generationId: 'g0', agenomeId: 'a0' }),
    ];
    const decision = guardStep(log, { type: 'energy.spent', generationId: 'g0', agenomeId: 'a0' });
    expect(decision.run).toBe(false);
    // a DIFFERENT scope (other agenome) is NOT yet recorded → it would still run.
    expect(guardStep(log, { type: 'energy.spent', generationId: 'g0', agenomeId: 'a1' }).run).toBe(
      true,
    );
  });

  // spec(§4) — the watermark is the max persisted per-run sequence (-1 for an empty log).
  test('sequence_watermark_is_max_persisted_sequence', () => {
    expect(sequenceWatermark([])).toBe(-1);
    const log = [
      row({ type: 'run.configured', sequence: 0 }),
      row({ type: 'run.started', sequence: 1 }),
    ];
    expect(sequenceWatermark(log)).toBe(1);
  });

  // spec(§5) — stepAlreadyRecorded matches by type (+ optional scope); the worker uses it for run-level
  // idempotency (run.started present ⇒ already started) and run.configured presence.
  test('step_already_recorded_matches_by_type_and_scope', () => {
    const log = [row({ type: 'run.configured' }), row({ type: 'run.started' })];
    expect(stepAlreadyRecorded(log, { type: 'run.started' })).toBe(true);
    expect(stepAlreadyRecorded(log, { type: 'run.completed' })).toBe(false);
    const scoped = [row({ type: 'energy.spent', generationId: 'g0', agenomeId: 'a0' })];
    expect(stepAlreadyRecorded(scoped, { type: 'energy.spent', agenomeId: 'a0' })).toBe(true);
    expect(stepAlreadyRecorded(scoped, { type: 'energy.spent', agenomeId: 'a9' })).toBe(false);
  });
});
