import { describe, expect, test } from 'vitest';
import { CheckResult } from '@doppl/contracts';
import type { CrossDomainTransferPayload } from '@doppl/contracts';
import type { CheckRunnerInput, RetrievalResult } from '../../../../src/check-runners/registry';
import { RETRIEVAL_UNAVAILABLE_REASON } from '../../../../src/check-runners/shared';
import {
  PRIOR_ART_ADAPTER_ID,
  priorArtCheck,
} from '../../../../src/check-runners/transfer/prior-art';

/**
 * P4.9b prior-art grounding check (ARCHITECTURE.md §7/§9, rule #3 pure + rule #7 replay-safe). A PURE
 * CheckRunner scoring the candidate against retrievalResults threaded in as DATA (the caller fetches; the
 * adapter never calls a provider). Passes iff the transfer's mapping/mechanism does NOT substantially
 * duplicate the retrieved prior-art (novel); high overlap → failed; absent results → skipped (no false
 * grounding). The retrieval outcome is persisted into the CheckResult (EvidenceKind prior_art) for replay.
 */

const BASE: CrossDomainTransferPayload = {
  sourceDomain: 'immunology',
  sourceTechnique: 'affinity maturation',
  targetDomain: 'recommender systems',
  targetProblem: 'cold-start ranking',
  transferMapping: 'map antibody affinity maturation to iterative candidate ranking refinement',
  expectedMechanism: 'progressive selection sharpens ranking quality over rounds',
};

const NOVEL_RESULTS: RetrievalResult[] = [
  {
    text: 'blockchain consensus and distributed ledger throughput',
    source: 'corpus-a',
    fallbackSourced: true,
  },
];
const DUPLICATE_RESULTS: RetrievalResult[] = [
  {
    text: 'antibody affinity maturation mapped to iterative candidate ranking refinement technique',
    source: 'corpus-b',
    fallbackSourced: true,
  },
];

function input(
  payload: unknown,
  retrievalResults?: RetrievalResult[],
  candidateOverride?: string,
): CheckRunnerInput {
  const base: CheckRunnerInput = {
    resultId: 'chk_1',
    candidateId: 'cand_1',
    checkType: 'transfer.prior_art',
    candidate: candidateOverride ?? JSON.stringify(payload),
  };
  return retrievalResults === undefined ? base : { ...base, retrievalResults };
}

describe('priorArtCheck — novel vs cited prior art (pure, caller-does-retrieval)', () => {
  // spec(§7) — positive guard first (lesson 10): mapping distinct from retrieved prior art → passed.
  test('prior_art_passes_novel', () => {
    const result = priorArtCheck(input(BASE, NOVEL_RESULTS));
    expect(CheckResult.safeParse(result).success).toBe(true);
    expect(result.status).toBe('passed');
  });

  // spec(§7) — mapping substantially duplicates the retrieved prior art → failed (it IS prior art).
  test('prior_art_fails_duplicate', () => {
    expect(priorArtCheck(input(BASE, DUPLICATE_RESULTS)).status).toBe('failed');
  });

  // spec(§7) — absent retrievalResults → skipped{retrieval_unavailable}; NOT a false pass, never re-fetches.
  test('prior_art_skips_no_results', () => {
    const result = priorArtCheck(input(BASE, undefined));
    expect(result.status).toBe('skipped');
    expect(result.skipReason).toBe(RETRIEVAL_UNAVAILABLE_REASON);
    const empty = priorArtCheck(input(BASE, []));
    expect(empty.status).toBe('skipped');
  });

  // spec(§9) rule #7 — the retrieval outcome it used is persisted into the CheckResult (EvidenceKind
  // prior_art) so replay reads it.
  test('prior_art_persists_retrieval_outcome', () => {
    const result = priorArtCheck(input(BASE, NOVEL_RESULTS));
    expect(result.evidenceRefs.length).toBeGreaterThan(0);
    expect(result.evidenceRefs.every((r) => r.kind === 'prior_art')).toBe(true);
    expect(result.evidenceRefs.some((r) => r.label === 'corpus-a')).toBe(true);
  });

  // spec(§7) rule #3 — unparseable candidate fails, never throws.
  test('prior_art_invalid_payload_fails_not_throws', () => {
    expect(() => priorArtCheck(input(null, NOVEL_RESULTS, 'not-json{'))).not.toThrow();
    expect(priorArtCheck(input(null, NOVEL_RESULTS, 'not-json{')).status).toBe('failed');
  });

  // rule #3 fail-not-throw on caller-threaded DATA: a retrieval result with an EMPTY source (a degraded
  // fetch) must NOT throw (an empty EvidenceRef.label would fail validation) — the ref is dropped, the
  // produced CheckResult stays schema-valid.
  test('prior_art_empty_source_does_not_throw', () => {
    const degraded: RetrievalResult[] = [
      { text: 'blockchain consensus throughput', source: '', fallbackSourced: true },
    ];
    expect(() => priorArtCheck(input(BASE, degraded))).not.toThrow();
    const result = priorArtCheck(input(BASE, degraded));
    expect(CheckResult.safeParse(result).success).toBe(true);
    expect(result.evidenceRefs).toEqual([]);
  });

  // rule #7 — deterministic over (candidate, results): same input → identical CheckResult.
  test('prior_art_is_deterministic', () => {
    expect(priorArtCheck(input(BASE, NOVEL_RESULTS))).toEqual(
      priorArtCheck(input(BASE, NOVEL_RESULTS)),
    );
  });

  test('prior_art_adapter_id_is_stable', () => {
    expect(PRIOR_ART_ADAPTER_ID).toBe('transfer.prior_art');
  });
});
