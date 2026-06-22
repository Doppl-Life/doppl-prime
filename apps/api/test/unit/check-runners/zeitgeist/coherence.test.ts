import { describe, expect, test } from 'vitest';
import { CheckResult } from '@doppl/contracts';
import type { ZeitgeistSynthesisPayload } from '@doppl/contracts';
import type { CheckRunnerInput } from '../../../../src/check-runners/registry';
import {
  ZEITGEIST_COHERENCE_ADAPTER_ID,
  zeitgeistCoherenceCheck,
} from '../../../../src/check-runners/zeitgeist/coherence';

/**
 * P4.10 zeitgeist check adapter — coherence (ARCHITECTURE.md §7, rule #3 pure adapter). Deterministic:
 * passes iff the `thesis` is internally connected to its `whyNow` + `falsifiablePredictions[]` (token
 * overlap ≥ a fixed threshold — the timing/predictions actually relate to the thesis).
 */

const BASE: ZeitgeistSynthesisPayload = {
  thesis: 'on-device language models replace cloud inference for privacy-sensitive consumer apps',
  audience: 'mobile product teams',
  currentSignals: ['neural processing units shipping in phones'],
  whyNow: 'on-device inference is now viable for consumer apps',
  falsifiablePredictions: [
    'flagship phones run a local language model assistant by 2027',
    'cloud inference cost exceeds on-device for interactive apps',
  ],
  comparablePriorArt: ['federated learning research'],
};

function input(payload: unknown, candidateOverride?: string): CheckRunnerInput {
  return {
    resultId: 'chk_1',
    candidateId: 'cand_1',
    checkType: 'zeitgeist.coherence',
    candidate: candidateOverride ?? JSON.stringify(payload),
  };
}

describe('zeitgeistCoherenceCheck — thesis connected to whyNow+predictions (rule #3 pure adapter)', () => {
  // spec(§7) — positive guard first (lesson 10): thesis shares tokens with whyNow+predictions → passed.
  test('coherence_passes_connected', () => {
    const result = zeitgeistCoherenceCheck(input(BASE));
    expect(CheckResult.safeParse(result).success).toBe(true);
    expect(result.status).toBe('passed');
  });

  // spec(§7) — a thesis disconnected from its whyNow + predictions fails (no overlap).
  test('coherence_fails_disconnected', () => {
    const result = zeitgeistCoherenceCheck(
      input({
        ...BASE,
        whyNow: 'the orchard requires seasonal irrigation adjustments',
        falsifiablePredictions: ['rainfall patterns shift the harvest window earlier'],
      }),
    );
    expect(result.status).toBe('failed');
  });

  // spec(§7) rule #3 — an unparseable candidate fails, never throws.
  test('coherence_invalid_payload_fails_not_throws', () => {
    expect(() => zeitgeistCoherenceCheck(input(null, 'xx'))).not.toThrow();
    expect(zeitgeistCoherenceCheck(input(null, 'xx')).status).toBe('failed');
  });

  // lesson 32 — deterministic.
  test('coherence_is_deterministic', () => {
    expect(zeitgeistCoherenceCheck(input(BASE))).toEqual(zeitgeistCoherenceCheck(input(BASE)));
  });

  test('coherence_adapter_id_is_stable', () => {
    expect(ZEITGEIST_COHERENCE_ADAPTER_ID).toBe('zeitgeist.coherence');
  });
});
