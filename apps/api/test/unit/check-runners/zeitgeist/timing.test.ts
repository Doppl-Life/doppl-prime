import { describe, expect, test } from 'vitest';
import { CheckResult } from '@doppl/contracts';
import type { ZeitgeistSynthesisPayload } from '@doppl/contracts';
import type { CheckRunnerInput } from '../../../../src/check-runners/registry';
import {
  ZEITGEIST_TIMING_ADAPTER_ID,
  zeitgeistTimingCheck,
} from '../../../../src/check-runners/zeitgeist/timing';

/**
 * P4.10 zeitgeist check adapter — timing (ARCHITECTURE.md §7, rule #3 pure adapter). Deterministic:
 * passes iff `whyNow` is grounded in the cited `currentSignals[]` (token overlap ≥ a fixed threshold).
 * An empty `currentSignals[]` fails — there are no signals to justify "why now".
 */

const BASE: ZeitgeistSynthesisPayload = {
  thesis: 'on-device language models replace cloud inference for privacy apps',
  audience: 'mobile product teams',
  currentSignals: [
    'neural processing units now shipping in consumer phones',
    'efficient quantization techniques have matured',
  ],
  whyNow: 'efficient quantization and on-device neural hardware make local inference viable now',
  falsifiablePredictions: ['flagship phones run a local assistant by 2027'],
  comparablePriorArt: ['federated learning research'],
};

function input(payload: unknown, candidateOverride?: string): CheckRunnerInput {
  return {
    resultId: 'chk_1',
    candidateId: 'cand_1',
    checkType: 'zeitgeist.timing',
    candidate: candidateOverride ?? JSON.stringify(payload),
  };
}

describe('zeitgeistTimingCheck — whyNow grounded in currentSignals (rule #3 pure adapter)', () => {
  // spec(§7) — positive guard first (lesson 10): whyNow overlaps the cited signals → passed.
  test('timing_passes_grounded_whynow', () => {
    const result = zeitgeistTimingCheck(input(BASE));
    expect(CheckResult.safeParse(result).success).toBe(true);
    expect(result.status).toBe('passed');
  });

  // spec(§7) — an empty currentSignals[] fails (no signals to justify "now").
  test('timing_fails_empty_signals', () => {
    expect(zeitgeistTimingCheck(input({ ...BASE, currentSignals: [] })).status).toBe('failed');
  });

  // spec(§7) — a whyNow disconnected from the signals fails (no overlap).
  test('timing_fails_when_disconnected', () => {
    const result = zeitgeistTimingCheck(
      input({ ...BASE, whyNow: 'the autumn harvest festival approaches in the village' }),
    );
    expect(result.status).toBe('failed');
  });

  // spec(§7) rule #3 — an unparseable candidate fails, never throws.
  test('timing_invalid_payload_fails_not_throws', () => {
    expect(() => zeitgeistTimingCheck(input(null, '{bad'))).not.toThrow();
    expect(zeitgeistTimingCheck(input(null, '{bad')).status).toBe('failed');
  });

  // lesson 32 — deterministic.
  test('timing_is_deterministic', () => {
    expect(zeitgeistTimingCheck(input(BASE))).toEqual(zeitgeistTimingCheck(input(BASE)));
  });

  test('timing_adapter_id_is_stable', () => {
    expect(ZEITGEIST_TIMING_ADAPTER_ID).toBe('zeitgeist.timing');
  });
});
