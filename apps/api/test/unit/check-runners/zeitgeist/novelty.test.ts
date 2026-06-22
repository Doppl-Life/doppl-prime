import { describe, expect, test } from 'vitest';
import { CheckResult } from '@doppl/contracts';
import type { ZeitgeistSynthesisPayload } from '@doppl/contracts';
import type { CheckRunnerInput } from '../../../../src/check-runners/registry';
import {
  ZEITGEIST_NOVELTY_ADAPTER_ID,
  zeitgeistNoveltyCheck,
} from '../../../../src/check-runners/zeitgeist/novelty';

/**
 * P4.10 zeitgeist check adapter — novelty SELF-CONSISTENCY (ARCHITECTURE.md §7, rule #3 pure adapter).
 * Deterministic: passes iff the `thesis` is distinct from its self-declared `comparablePriorArt[]` (token
 * overlap with every prior-art entry below a fixed threshold — a thesis that restates its own cited prior
 * art fails). NOT the §8 P5 embedding-based novelty SCORE — this is a structural self-consistency check.
 */

const BASE: ZeitgeistSynthesisPayload = {
  thesis: 'on-device small language models will replace cloud inference for privacy consumer apps',
  audience: 'mobile product teams',
  currentSignals: ['neural processing units shipping in phones'],
  whyNow: 'efficient quantization makes local inference viable now',
  falsifiablePredictions: ['flagship phones run a local assistant by 2027'],
  comparablePriorArt: ['blockchain consensus mechanisms', 'photosynthesis efficiency research'],
};

function input(payload: unknown, candidateOverride?: string): CheckRunnerInput {
  return {
    resultId: 'chk_1',
    candidateId: 'cand_1',
    checkType: 'zeitgeist.novelty',
    candidate: candidateOverride ?? JSON.stringify(payload),
  };
}

describe('zeitgeistNoveltyCheck — thesis distinct from cited prior art (rule #3 pure adapter)', () => {
  // spec(§7) — positive guard first (lesson 10): a thesis distinct from its cited prior art passes.
  test('novelty_passes_distinct_thesis', () => {
    const result = zeitgeistNoveltyCheck(input(BASE));
    expect(CheckResult.safeParse(result).success).toBe(true);
    expect(result.status).toBe('passed');
  });

  // spec(§7) — a thesis that restates one of its own comparablePriorArt entries fails (not novel).
  test('novelty_fails_restates_prior_art', () => {
    const result = zeitgeistNoveltyCheck(
      input({ ...BASE, comparablePriorArt: [BASE.thesis, 'an unrelated prior work'] }),
    );
    expect(result.status).toBe('failed');
  });

  // spec(§7) — no cited prior art → vacuously distinct → passes (it restates nothing).
  test('novelty_passes_with_empty_prior_art', () => {
    expect(zeitgeistNoveltyCheck(input({ ...BASE, comparablePriorArt: [] })).status).toBe('passed');
  });

  // spec(§7) rule #3 — an unparseable candidate fails, never throws, never executes.
  test('novelty_invalid_payload_fails_not_throws', () => {
    expect(() => zeitgeistNoveltyCheck(input(null, 'not-json{'))).not.toThrow();
    expect(zeitgeistNoveltyCheck(input(null, 'not-json{')).status).toBe('failed');
  });

  // lesson 32 — deterministic.
  test('novelty_is_deterministic', () => {
    expect(zeitgeistNoveltyCheck(input(BASE))).toEqual(zeitgeistNoveltyCheck(input(BASE)));
  });

  test('novelty_adapter_id_is_stable', () => {
    expect(ZEITGEIST_NOVELTY_ADAPTER_ID).toBe('zeitgeist.novelty');
  });
});
