import type { CheckResult } from '@doppl/contracts';
import type { CheckRunner, CheckRunnerInput } from '../registry';
import { decided, parseZeitgeistCandidate, tokenOverlap, unparseable } from '../shared';

/**
 * P4.10 zeitgeist timing check (ARCHITECTURE.md §7, KEY SAFETY RULE #3 — pure non-executing CheckRunner).
 * The "why now" must be grounded in the cited current signals: passes iff `whyNow` shares at least
 * {@link TIMING_MIN_SIGNAL_OVERLAP} token(s) with the joined `currentSignals[]`. An empty
 * `currentSignals[]` fails — there are no signals to justify "now". Deterministic, tunable MVP signal
 * (real quality is critics/judge). Candidate parsed as DATA.
 */
export const ZEITGEIST_TIMING_ADAPTER_ID = 'zeitgeist.timing';

/** Min shared-token count between whyNow and the cited signals for the "why now" to count as grounded. */
export const TIMING_MIN_SIGNAL_OVERLAP = 1;

export const zeitgeistTimingCheck: CheckRunner = (input: CheckRunnerInput): CheckResult => {
  const payload = parseZeitgeistCandidate(input.candidate);
  if (payload === null) {
    return unparseable(input);
  }
  const signals = payload.currentSignals.join(' ');
  const overlap = tokenOverlap(payload.whyNow, signals);
  const grounded = overlap >= TIMING_MIN_SIGNAL_OVERLAP;
  return decided(
    input,
    grounded,
    grounded
      ? `whyNow is grounded in the cited current signals (${overlap} shared token(s))`
      : 'whyNow is not grounded in any cited current signal (no shared tokens / no signals)',
  );
};
