// P0.1 — RunEventEnvelope: strict 14-field event row. spec(§4): ARCHITECTURE.md §4 / Appendix A
// (the append-only run_events row shape; sequence = sole ordering key; occurredAt display-only).
import { describe, it, expect } from 'vitest';
import { CURRENT_SCHEMA_VERSION, RunEventEnvelope } from '@doppl/contracts';

const validFull = {
  id: 'evt_1',
  runId: 'run_1',
  generationId: 'gen_1',
  agenomeId: 'agn_1',
  candidateId: 'cand_1',
  type: 'run.started',
  sequence: 0,
  occurredAt: '2026-06-20T18:39:56.724Z',
  actor: 'runtime',
  correlationId: 'corr_1',
  langfuseTraceId: 'trace_1',
  langfuseObservationId: 'obs_1',
  payload: { foo: 'bar', nested: { n: 1 } },
  schemaVersion: 1,
};

const REQUIRED_KEYS = [
  'id',
  'runId',
  'type',
  'sequence',
  'occurredAt',
  'actor',
  'payload',
  'schemaVersion',
] as const;

describe('RunEventEnvelope — strict 14-field event row (spec §4)', () => {
  it('envelope_parses_valid_full_object', () => {
    // spec(§4): a fully-populated 14-field envelope parses and round-trips unchanged.
    expect(RunEventEnvelope.parse(validFull)).toEqual(validFull);
  });

  it('envelope_parses_with_optionals_omitted', () => {
    // spec(§4): the 8 required fields alone parse (all 6 optionals omitted).
    const requiredOnly = {
      id: 'evt_2',
      runId: 'run_2',
      type: 'generation.started',
      sequence: 7,
      occurredAt: '2026-06-20T18:40:00.000Z',
      actor: 'agenome',
      payload: {},
      schemaVersion: 1,
    };
    expect(RunEventEnvelope.parse(requiredOnly)).toEqual(requiredOnly);
  });

  it('envelope_rejects_unknown_field', () => {
    // spec(§4): strict object — an unknown key is rejected, never stripped.
    expect(() => RunEventEnvelope.parse({ ...validFull, bogus: 1 })).toThrow();
  });

  it('envelope_rejects_missing_required_field', () => {
    // spec(§4): each of the 8 required fields is mandatory.
    for (const k of REQUIRED_KEYS) {
      const clone: Record<string, unknown> = { ...validFull };
      delete clone[k];
      expect(() => RunEventEnvelope.parse(clone), `missing required field: ${k}`).toThrow();
    }
  });

  it('envelope_rejects_empty_id_and_run_id', () => {
    // spec(§4) / Q2: id and runId are opaque NON-EMPTY strings (z.string().min(1)).
    expect(() => RunEventEnvelope.parse({ ...validFull, id: '' })).toThrow();
    expect(() => RunEventEnvelope.parse({ ...validFull, runId: '' })).toThrow();
  });

  it('envelope_rejects_non_enum_type_or_actor', () => {
    // spec(§4): type/actor are the closed unions at the envelope boundary.
    expect(() => RunEventEnvelope.parse({ ...validFull, type: 'run.exploded' })).toThrow();
    expect(() => RunEventEnvelope.parse({ ...validFull, actor: 'hacker' })).toThrow();
  });

  it('envelope_rejects_non_object_payload', () => {
    // spec(§4) / Q4: payload is an object map (z.record(z.string(), z.unknown())) — scalars rejected
    // at the §2.5 contract boundary (snapshot freezes the field SET, not payload's value-type).
    expect(() => RunEventEnvelope.parse({ ...validFull, payload: 'str' })).toThrow();
    expect(() => RunEventEnvelope.parse({ ...validFull, payload: 42 })).toThrow();
  });

  it('sequence_is_nonnegative_integer', () => {
    // spec(§4): sequence is a per-run monotonic integer ≥ 0 (single-envelope domain pin only).
    expect(RunEventEnvelope.parse({ ...validFull, sequence: 0 }).sequence).toBe(0);
    expect(RunEventEnvelope.parse({ ...validFull, sequence: 42 }).sequence).toBe(42);
    expect(() => RunEventEnvelope.parse({ ...validFull, sequence: 1.5 })).toThrow();
    expect(() => RunEventEnvelope.parse({ ...validFull, sequence: -1 })).toThrow();
    expect(() => RunEventEnvelope.parse({ ...validFull, sequence: '3' })).toThrow();
  });

  it('occurred_at_is_iso_utc_datetime', () => {
    // spec(§4): occurredAt is an ISO-8601 UTC datetime string (display/analytics-only).
    const utc = '2026-06-20T00:00:00Z';
    expect(RunEventEnvelope.parse({ ...validFull, occurredAt: utc }).occurredAt).toBe(utc);
    expect(() => RunEventEnvelope.parse({ ...validFull, occurredAt: 'not-a-date' })).toThrow();
    expect(() => RunEventEnvelope.parse({ ...validFull, occurredAt: '2026-06-20' })).toThrow();
  });

  it('backward_compat_v1_to_v5_envelopes_validate', () => {
    // spec(§4) §19 backward-compat: schemaVersion is a required positive integer on every envelope, and
    // the terminal-event amendment (sv4→5) is purely ADDITIVE — every prior-version envelope still
    // validates at the contract level — 1 (oldest), 2 (P0.1-amend markers), 3 (P0.16 judge), 4 (kernel
    // degraded+repairing), and 5 (current — terminal-event amendment) all parse (the ≤-current reader
    // logic is P1's; the contract just requires a positive int). The non-breaking guarantee made concrete.
    expect(RunEventEnvelope.parse({ ...validFull, schemaVersion: 1 }).schemaVersion).toBe(1);
    expect(RunEventEnvelope.parse({ ...validFull, schemaVersion: 2 }).schemaVersion).toBe(2);
    expect(RunEventEnvelope.parse({ ...validFull, schemaVersion: 3 }).schemaVersion).toBe(3);
    expect(RunEventEnvelope.parse({ ...validFull, schemaVersion: 4 }).schemaVersion).toBe(4);
    expect(RunEventEnvelope.parse({ ...validFull, schemaVersion: 5 }).schemaVersion).toBe(5);
    expect(() => RunEventEnvelope.parse({ ...validFull, schemaVersion: 0 })).toThrow();
    expect(() => RunEventEnvelope.parse({ ...validFull, schemaVersion: -1 })).toThrow();
    expect(() => RunEventEnvelope.parse({ ...validFull, schemaVersion: 1.2 })).toThrow();
  });

  it('current_schema_version_is_8', () => {
    // spec(§4) [frontend-v2 FB.4 diverge/converge dial amendment]: the registry-pinned current schema
    // version is 8 (bumped 7→8 for the additive samplingParams{temperature?} on ModelGatewayRequest +
    // LlmCallTelemetry). The exported constant is the single source the reader's ≤-current ceiling tracks.
    expect(CURRENT_SCHEMA_VERSION).toBe(8);
  });
});
