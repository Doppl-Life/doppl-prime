import type { CheckResult } from '@doppl/contracts';
import type { CheckRunner, CheckRunnerInput } from '../registry';
import { decided, parseZeitgeistCandidate, tokenOverlap, unparseable } from '../shared';

/**
 * P4.10 zeitgeist novelty SELF-CONSISTENCY check (ARCHITECTURE.md §7, KEY SAFETY RULE #3 — pure
 * non-executing CheckRunner).
 *
 * IMPORTANT — this is NOT the §8 P5 embedding-based novelty SCORE. This is a deterministic structural
 * SELF-CONSISTENCY check: passes iff the `thesis` is distinct from its OWN self-declared
 * `comparablePriorArt[]` (token overlap with every prior-art entry below {@link NOVELTY_MAX_PRIORART_OVERLAP}).
 * A thesis that merely restates one of its cited prior works fails. It checks the candidate against the
 * prior art the candidate DECLARES — not against the idea space (that is the P5 embedding score + the
 * deferred prior-art retrieval check). Consequently an empty `comparablePriorArt[]` passes vacuously
 * (nothing declared to clash with) — a known, deliberate limitation of self-consistency-only novelty.
 */
export const ZEITGEIST_NOVELTY_ADAPTER_ID = 'zeitgeist.novelty';

/** Max token-overlap of the thesis with ANY single cited prior-art entry to still count as distinct. */
export const NOVELTY_MAX_PRIORART_OVERLAP = 3;

export const zeitgeistNoveltyCheck: CheckRunner = (input: CheckRunnerInput): CheckResult => {
  const payload = parseZeitgeistCandidate(input.candidate);
  if (payload === null) {
    return unparseable(input);
  }
  let maxOverlap = 0;
  for (const priorArt of payload.comparablePriorArt) {
    const overlap = tokenOverlap(payload.thesis, priorArt);
    if (overlap > maxOverlap) maxOverlap = overlap;
  }
  const distinct = maxOverlap < NOVELTY_MAX_PRIORART_OVERLAP;
  return decided(
    input,
    distinct,
    distinct
      ? `thesis is distinct from its cited prior art (max ${maxOverlap} shared token(s))`
      : `thesis restates its cited prior art (${maxOverlap} shared tokens, threshold ${NOVELTY_MAX_PRIORART_OVERLAP})`,
  );
};
