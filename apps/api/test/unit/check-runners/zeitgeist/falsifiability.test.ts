import { describe, expect, test } from 'vitest';
import { CheckResult } from '@doppl/contracts';
import type { ZeitgeistSynthesisPayload } from '@doppl/contracts';
import type { CheckRunnerInput, RetrievalResult } from '../../../../src/check-runners/registry';
import { RETRIEVAL_UNAVAILABLE_REASON } from '../../../../src/check-runners/shared';
import {
  FALSIFIABILITY_ADAPTER_ID,
  falsifiabilityCheck,
} from '../../../../src/check-runners/zeitgeist/falsifiability';

/**
 * P4.10b falsifiability check (ARCHITECTURE.md §7/§9, rule #3 pure + rule #7 replay-safe). A PURE
 * CheckRunner: passes iff every falsifiablePrediction is checkable against the retrieved evidence (each
 * shares ≥1 grounding token with some retrieved text). No predictions → failed (nothing to falsify).
 * Absent results → skipped{retrieval_unavailable}. Persists the retrieval outcome (EvidenceKind signal).
 */

const BASE: ZeitgeistSynthesisPayload = {
  thesis: 'on-device language models replace cloud inference for privacy apps',
  audience: 'mobile product teams',
  currentSignals: ['neural processing units shipping in phones'],
  whyNow: 'on-device inference is now viable',
  falsifiablePredictions: ['flagship phones run a local language model by 2027'],
  comparablePriorArt: ['federated learning research'],
};

const CHECKABLE: RetrievalResult[] = [
  {
    text: 'benchmarks show flagship phones can already run a local language model assistant',
    source: 'evidence-corpus',
    fallbackSourced: true,
  },
];
const UNGROUNDED: RetrievalResult[] = [
  {
    text: 'autumn orchard irrigation festival schedules',
    source: 'evidence-corpus',
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
    checkType: 'zeitgeist.falsifiability',
    candidate: candidateOverride ?? JSON.stringify(payload),
  };
  return retrievalResults === undefined ? base : { ...base, retrievalResults };
}

describe('falsifiabilityCheck — predictions checkable against retrieval (pure)', () => {
  // spec(§7) — positive guard first (lesson 10): predictions grounded in retrieved evidence → passed.
  test('falsifiability_passes_checkable', () => {
    const result = falsifiabilityCheck(input(BASE, CHECKABLE));
    expect(CheckResult.safeParse(result).success).toBe(true);
    expect(result.status).toBe('passed');
  });

  // spec(§7) — predictions not grounded in any retrieved text → failed.
  test('falsifiability_fails_ungrounded', () => {
    expect(falsifiabilityCheck(input(BASE, UNGROUNDED)).status).toBe('failed');
  });

  // spec(§7) — no falsifiable predictions → failed (a thesis with nothing to falsify is not falsifiable).
  test('falsifiability_fails_no_predictions', () => {
    expect(
      falsifiabilityCheck(input({ ...BASE, falsifiablePredictions: [] }, CHECKABLE)).status,
    ).toBe('failed');
  });

  // spec(§7) — absent retrievalResults → skipped{retrieval_unavailable}.
  test('falsifiability_skips_no_results', () => {
    expect(falsifiabilityCheck(input(BASE, undefined)).status).toBe('skipped');
    expect(falsifiabilityCheck(input(BASE, undefined)).skipReason).toBe(
      RETRIEVAL_UNAVAILABLE_REASON,
    );
  });

  // spec(§9) rule #7 — retrieval outcome persisted (EvidenceKind signal) for replay.
  test('falsifiability_persists_retrieval_outcome', () => {
    const result = falsifiabilityCheck(input(BASE, CHECKABLE));
    expect(result.evidenceRefs.length).toBeGreaterThan(0);
    expect(result.evidenceRefs.every((r) => r.kind === 'signal')).toBe(true);
  });

  // spec(§7) rule #3 — unparseable candidate fails, never throws.
  test('falsifiability_invalid_payload_fails_not_throws', () => {
    expect(() => falsifiabilityCheck(input(null, CHECKABLE, 'xx'))).not.toThrow();
    expect(falsifiabilityCheck(input(null, CHECKABLE, 'xx')).status).toBe('failed');
  });

  // rule #7 — deterministic.
  test('falsifiability_is_deterministic', () => {
    expect(falsifiabilityCheck(input(BASE, CHECKABLE))).toEqual(
      falsifiabilityCheck(input(BASE, CHECKABLE)),
    );
  });

  test('falsifiability_adapter_id_is_stable', () => {
    expect(FALSIFIABILITY_ADAPTER_ID).toBe('zeitgeist.falsifiability');
  });
});
