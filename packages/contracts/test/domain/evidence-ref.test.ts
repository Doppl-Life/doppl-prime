// P0.5 — EvidenceRef: the explainability pointer carried by candidates/reviews/checks.
// spec(§4): closed 6-kind evidence union + all-optional pointers. spec(§9): EvidenceRef encodes a
// pointer SHAPE only — resolution to the Postgres tier is the P1.7 resolver's job (lesson §6), so
// the schema constrains kind + non-empty pointer strings, not resolvability.
import { describe, it, expect } from 'vitest';
import { EvidenceRef, EvidenceKind } from '@doppl/contracts';

const EVIDENCE_KINDS = [
  'trace',
  'check_output',
  'prior_art',
  'signal',
  'raw_output',
  'other',
] as const;

describe('EvidenceRef — explainability pointer (spec §4)', () => {
  it('evidence_ref_kind_closed_union', () => {
    // spec(§4): all 6 evidence kinds parse; any other kind is rejected (closed union).
    for (const k of EVIDENCE_KINDS) {
      expect(EvidenceKind.parse(k)).toBe(k);
      expect(EvidenceRef.parse({ kind: k }).kind).toBe(k);
    }
    expect(EVIDENCE_KINDS).toHaveLength(6);
    expect(() => EvidenceKind.parse('rumor')).toThrow();
    expect(() => EvidenceKind.parse('')).toThrow();
    expect(() => EvidenceRef.parse({ kind: 'rumor' })).toThrow();
  });

  it('evidence_ref_optional_pointers_and_strict', () => {
    // spec(§4): a ref carrying only `kind` parses — every pointer (eventId/uri/label/
    // langfuseObservationId) is optional (resolution is the P1.7 resolver's job, lesson §6).
    expect(EvidenceRef.parse({ kind: 'prior_art' })).toEqual({ kind: 'prior_art' });
    const full = {
      kind: 'trace',
      eventId: 'evt_1',
      uri: 'postgres://run_events/evt_1',
      label: 'spawn trace',
      langfuseObservationId: 'obs_1',
    };
    expect(EvidenceRef.parse(full)).toEqual(full);
    // strict: an unknown field is rejected, never stripped.
    expect(() => EvidenceRef.parse({ kind: 'trace', bogus: 1 })).toThrow();
    // pointer strings are non-empty when present (consistent with the envelope convention).
    expect(() => EvidenceRef.parse({ kind: 'trace', eventId: '' })).toThrow();
    expect(() => EvidenceRef.parse({ kind: 'trace', langfuseObservationId: '' })).toThrow();
  });
});
