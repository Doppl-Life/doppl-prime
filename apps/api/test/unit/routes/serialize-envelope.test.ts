import { describe, expect, test } from 'vitest';
import { RunEventEnvelope } from '@doppl/contracts';
import { serializeEnvelope } from '../../../src/routes/_support/serializeEnvelope';

/**
 * PD.15 — the shared wire serializer omits null/undefined optionals so the frozen `RunEventEnvelope`
 * (`.optional()`, NOT `.nullable()`) re-parses on the consumer (the web). Root cause of the PD.14
 * Finding: drizzle returns DB-`null` for an absent optional column; `JSON.stringify(row)` emits `null`;
 * the frozen schema rejects `null` → the web's `getEvents`/SSE `RunEventEnvelope.parse` throws (the live
 * SSE silently drops every event). Fixing at the SOURCE (omit nulls on the wire) keeps the frozen
 * contract untouched (no `.nullable()`) and the persisted log untouched (rule #2 — read-path only).
 */
describe('serializeEnvelope — omit null/undefined optionals (wire serializer)', () => {
  // A RunEventRow as drizzle returns it: DB-null optionals + a Date occurredAt.
  const nullBearingRow = {
    id: 'ev1',
    runId: 'run_1',
    type: 'run.configured',
    sequence: 0,
    occurredAt: new Date('2026-06-20T12:00:00.000Z'),
    actor: 'operator',
    payload: { caps: { maxPopulation: 3 } },
    schemaVersion: 5,
    generationId: null,
    agenomeId: null,
    candidateId: null,
    correlationId: null,
    langfuseTraceId: null,
    langfuseObservationId: null,
  };

  test('serialize_envelope_omits_null_optionals', () => {
    const wire = JSON.parse(JSON.stringify(serializeEnvelope(nullBearingRow))) as Record<
      string,
      unknown
    >;
    for (const key of [
      'generationId',
      'agenomeId',
      'candidateId',
      'correlationId',
      'langfuseTraceId',
      'langfuseObservationId',
    ]) {
      expect(key in wire).toBe(false); // ABSENT, not `null`
    }
    // occurredAt is preserved as an ISO string (the Date is NOT flattened to `{}` — LESSON §31).
    expect(wire.occurredAt).toBe('2026-06-20T12:00:00.000Z');
    expect(wire.id).toBe('ev1');
    // The frozen envelope now parses the wire form (the consumer no longer chokes on nulls).
    expect(() => RunEventEnvelope.parse(wire)).not.toThrow();
  });

  test('preserves present optionals + arrays; drops nested null payload keys (deep)', () => {
    const row = {
      ...nullBearingRow,
      candidateId: 'cand_1',
      generationId: 'gen_0',
      payload: { items: [1, 2, 3], nested: { absent: null, present: 'keep' } },
    };
    const wire = JSON.parse(JSON.stringify(serializeEnvelope(row))) as {
      candidateId?: string;
      payload: { items: number[]; nested: Record<string, unknown> };
    };
    expect(wire.candidateId).toBe('cand_1');
    expect(wire.payload.items).toEqual([1, 2, 3]); // arrays preserved, elements never dropped
    expect('absent' in wire.payload.nested).toBe(false); // deep null key dropped
    expect(wire.payload.nested.present).toBe('keep');
    expect(() => RunEventEnvelope.parse(wire)).not.toThrow();
  });
});
