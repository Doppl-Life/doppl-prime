import type { CheckResult } from '@doppl/contracts';
import type { CheckRunner, CheckRunnerInput } from '../registry';
import { decided, parseZeitgeistCandidate, tokenOverlap, unparseable } from '../shared';

/**
 * P4.10 zeitgeist coherence check (ARCHITECTURE.md §7, KEY SAFETY RULE #3 — pure non-executing
 * CheckRunner). The thesis must be internally connected to its own timing + predictions: passes iff the
 * `thesis` shares at least {@link COHERENCE_MIN_OVERLAP} token(s) with the joined `whyNow` +
 * `falsifiablePredictions[]` (the timing/predictions actually relate to the thesis). Deterministic,
 * tunable MVP signal (real quality is critics/judge). Candidate parsed as DATA.
 */
export const ZEITGEIST_COHERENCE_ADAPTER_ID = 'zeitgeist.coherence';

/** Min shared-token count between the thesis and its whyNow+predictions for the synthesis to cohere. */
export const COHERENCE_MIN_OVERLAP = 1;

export const zeitgeistCoherenceCheck: CheckRunner = (input: CheckRunnerInput): CheckResult => {
  const payload = parseZeitgeistCandidate(input.candidate);
  if (payload === null) {
    return unparseable(input);
  }
  const support = `${payload.whyNow} ${payload.falsifiablePredictions.join(' ')}`;
  const overlap = tokenOverlap(payload.thesis, support);
  const coheres = overlap >= COHERENCE_MIN_OVERLAP;
  return decided(
    input,
    coheres,
    coheres
      ? `thesis is connected to its whyNow + predictions (${overlap} shared token(s))`
      : 'thesis is disconnected from its whyNow + predictions (no shared tokens)',
  );
};
