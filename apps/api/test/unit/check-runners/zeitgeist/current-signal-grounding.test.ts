import { describe, expect, test } from 'vitest';
import { CheckResult } from '@doppl/contracts';
import type { ZeitgeistSynthesisPayload } from '@doppl/contracts';
import type { CheckRunnerInput, RetrievalResult } from '../../../../src/check-runners/registry';
import { RETRIEVAL_UNAVAILABLE_REASON } from '../../../../src/check-runners/shared';
import {
  CURRENT_SIGNAL_GROUNDING_ADAPTER_ID,
  currentSignalGroundingCheck,
} from '../../../../src/check-runners/zeitgeist/current-signal-grounding';

/**
 * P4.10b current-signal-grounding check (ARCHITECTURE.md §7/§9, rule #3 pure + rule #7 replay-safe). A
 * PURE CheckRunner: passes iff the candidate's currentSignals[] are corroborated by the retrieved texts
 * (token overlap ≥ threshold). Absent results → skipped{retrieval_unavailable}. Persists the retrieval
 * outcome (EvidenceKind signal) for replay.
 */

const BASE: ZeitgeistSynthesisPayload = {
  thesis: 'on-device language models replace cloud inference for privacy apps',
  audience: 'mobile product teams',
  currentSignals: ['neural processing units shipping in consumer phones'],
  whyNow: 'on-device inference is now viable',
  falsifiablePredictions: ['flagship phones run a local assistant by 2027'],
  comparablePriorArt: ['federated learning research'],
};

const CORROBORATING: RetrievalResult[] = [
  {
    text: 'industry reports confirm neural processing units now ship in flagship consumer phones',
    source: 'signal-corpus',
    fallbackSourced: true,
  },
];
const UNRELATED: RetrievalResult[] = [
  {
    text: 'orchard irrigation schedules for the autumn harvest',
    source: 'signal-corpus',
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
    checkType: 'zeitgeist.current_signal_grounding',
    candidate: candidateOverride ?? JSON.stringify(payload),
  };
  return retrievalResults === undefined ? base : { ...base, retrievalResults };
}

describe('currentSignalGroundingCheck — signals corroborated by retrieval (pure)', () => {
  // spec(§7) — positive guard first (lesson 10): signals corroborated by retrieved texts → passed.
  test('current_signal_grounding_passes_corroborated', () => {
    const result = currentSignalGroundingCheck(input(BASE, CORROBORATING));
    expect(CheckResult.safeParse(result).success).toBe(true);
    expect(result.status).toBe('passed');
  });

  // spec(§7) — signals not corroborated by the retrieved texts → failed.
  test('current_signal_grounding_fails_uncorroborated', () => {
    expect(currentSignalGroundingCheck(input(BASE, UNRELATED)).status).toBe('failed');
  });

  // spec(§7) — absent retrievalResults → skipped{retrieval_unavailable}.
  test('current_signal_grounding_skips_no_results', () => {
    expect(currentSignalGroundingCheck(input(BASE, undefined)).status).toBe('skipped');
    expect(currentSignalGroundingCheck(input(BASE, undefined)).skipReason).toBe(
      RETRIEVAL_UNAVAILABLE_REASON,
    );
  });

  // spec(§9) rule #7 — the retrieval outcome is persisted (EvidenceKind signal) for replay.
  test('current_signal_grounding_persists_retrieval_outcome', () => {
    const result = currentSignalGroundingCheck(input(BASE, CORROBORATING));
    expect(result.evidenceRefs.length).toBeGreaterThan(0);
    expect(result.evidenceRefs.every((r) => r.kind === 'signal')).toBe(true);
  });

  // spec(§7) rule #3 — unparseable candidate fails, never throws.
  test('current_signal_grounding_invalid_payload_fails_not_throws', () => {
    expect(() => currentSignalGroundingCheck(input(null, CORROBORATING, '{bad'))).not.toThrow();
    expect(currentSignalGroundingCheck(input(null, CORROBORATING, '{bad')).status).toBe('failed');
  });

  // rule #7 — deterministic.
  test('current_signal_grounding_is_deterministic', () => {
    expect(currentSignalGroundingCheck(input(BASE, CORROBORATING))).toEqual(
      currentSignalGroundingCheck(input(BASE, CORROBORATING)),
    );
  });

  test('current_signal_grounding_adapter_id_is_stable', () => {
    expect(CURRENT_SIGNAL_GROUNDING_ADAPTER_ID).toBe('zeitgeist.current_signal_grounding');
  });
});
