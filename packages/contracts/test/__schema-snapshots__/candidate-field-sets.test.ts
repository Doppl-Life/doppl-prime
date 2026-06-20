// P0.5 — §2.5 cross-track schema-snapshot gate for the candidate contracts. spec(§3) spec(§4)
// spec(§2.5): each CandidateIdea variant's field-name set (11), the CandidateStatus member set (8),
// the EvidenceRef field set (5) + EvidenceKind member set (6), and each subtype payload's field set
// equal checked-in frozen snapshots — any add/remove/rename fails here BEFORE the runtime/verifier/
// selection/projection tracks consume these models. Also pins the discriminant literal set.
import { describe, it, expect } from 'vitest';
import {
  CandidateIdea,
  CandidateStatus,
  EvidenceRef,
  EvidenceKind,
  CrossDomainTransferPayload,
  ZeitgeistSynthesisPayload,
  Subtype,
} from '@doppl/contracts';

const CANDIDATE_FIELD_SNAPSHOT = [
  'id',
  'runId',
  'generationId',
  'agenomeId',
  'subtype',
  'title',
  'summary',
  'claims',
  'evidenceRefs',
  'status',
  'subtypePayload',
];

const CANDIDATE_STATUS_SNAPSHOT = [
  'created',
  'under_review',
  'checked',
  'scored',
  'selected',
  'rejected',
  'culled',
  'invalid',
];

const EVIDENCE_REF_FIELD_SNAPSHOT = ['kind', 'eventId', 'uri', 'label', 'langfuseObservationId'];

const EVIDENCE_KIND_SNAPSHOT = [
  'trace',
  'check_output',
  'prior_art',
  'signal',
  'raw_output',
  'other',
];

const CDT_PAYLOAD_FIELD_SNAPSHOT = [
  'sourceDomain',
  'sourceTechnique',
  'targetDomain',
  'targetProblem',
  'transferMapping',
  'expectedMechanism',
  'executableCheckIdea',
];

const ZEIT_PAYLOAD_FIELD_SNAPSHOT = [
  'thesis',
  'audience',
  'currentSignals',
  'whyNow',
  'falsifiablePredictions',
  'comparablePriorArt',
];

const sorted = (a: readonly string[]): string[] => [...a].sort();

// Probe which Subtype member a discriminated-union variant accepts on its `subtype` field —
// version-robust (no dependency on ZodLiteral internals across zod minors).
const acceptedSubtype = (variant: {
  shape: { subtype: { safeParse: (v: unknown) => { success: boolean } } };
}): string | undefined => Subtype.options.find((s) => variant.shape.subtype.safeParse(s).success);

describe('schema snapshot — CandidateIdea / payloads / EvidenceRef (spec §3 / §4 / §2.5)', () => {
  it('barrel_exports_candidate_contracts', () => {
    // spec(§2.5): the public surface re-exports each schema from the one barrel.
    expect(typeof CandidateIdea.parse).toBe('function');
    expect(typeof CandidateStatus.parse).toBe('function');
    expect(typeof EvidenceRef.parse).toBe('function');
    expect(typeof EvidenceKind.parse).toBe('function');
    expect(typeof CrossDomainTransferPayload.parse).toBe('function');
    expect(typeof ZeitgeistSynthesisPayload.parse).toBe('function');
  });

  it('schema_snapshot_candidate_payloads_evidence_sets', () => {
    // Both discriminated-union variants share the same 11-field top-level set.
    expect(CandidateIdea.options).toHaveLength(2);
    for (const variant of CandidateIdea.options) {
      expect(sorted(Object.keys(variant.shape))).toEqual(sorted(CANDIDATE_FIELD_SNAPSHOT));
    }
    // The discriminant literals are exactly the two canonical Subtype members (sourced from P0.3).
    expect(sorted(CandidateIdea.options.map(acceptedSubtype) as string[])).toEqual(
      sorted(['cross_domain_transfer', 'zeitgeist_synthesis']),
    );

    expect(sorted(CandidateStatus.options)).toEqual(sorted(CANDIDATE_STATUS_SNAPSHOT));
    expect(sorted(Object.keys(EvidenceRef.shape))).toEqual(sorted(EVIDENCE_REF_FIELD_SNAPSHOT));
    expect(sorted(EvidenceKind.options)).toEqual(sorted(EVIDENCE_KIND_SNAPSHOT));
    expect(sorted(Object.keys(CrossDomainTransferPayload.shape))).toEqual(
      sorted(CDT_PAYLOAD_FIELD_SNAPSHOT),
    );
    expect(sorted(Object.keys(ZeitgeistSynthesisPayload.shape))).toEqual(
      sorted(ZEIT_PAYLOAD_FIELD_SNAPSHOT),
    );

    expect(CANDIDATE_FIELD_SNAPSHOT).toHaveLength(11);
    expect(CANDIDATE_STATUS_SNAPSHOT).toHaveLength(8);
    expect(EVIDENCE_REF_FIELD_SNAPSHOT).toHaveLength(5);
    expect(EVIDENCE_KIND_SNAPSHOT).toHaveLength(6);
    expect(CDT_PAYLOAD_FIELD_SNAPSHOT).toHaveLength(7);
    expect(ZEIT_PAYLOAD_FIELD_SNAPSHOT).toHaveLength(6);
  });
});
