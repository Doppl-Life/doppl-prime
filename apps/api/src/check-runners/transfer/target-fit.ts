import type { CheckResult } from '@doppl/contracts';
import type { CheckRunner, CheckRunnerInput } from '../registry';
import { decided, parseTransferCandidate, tokenOverlap, unparseable } from './shared';

/**
 * P4.9 target-fit check (ARCHITECTURE.md §7, KEY SAFETY RULE #3 — pure non-executing CheckRunner). The
 * proposed transfer must actually engage the target: passes iff the `transferMapping`+`expectedMechanism`
 * share at least {@link TARGET_FIT_MIN_OVERLAP} token(s) with the `targetDomain`+`targetProblem`. A
 * deterministic, tunable MVP signal (real quality is the critics'/judge's job). Candidate parsed as DATA.
 */
export const TARGET_FIT_ADAPTER_ID = 'transfer.target_fit';

/** Minimum shared-token count for a pass. Lenient by design (crude MVP signal); a named const = tunable. */
export const TARGET_FIT_MIN_OVERLAP = 1;

export const targetFitCheck: CheckRunner = (input: CheckRunnerInput): CheckResult => {
  const payload = parseTransferCandidate(input.candidate);
  if (payload === null) {
    return unparseable(input);
  }
  const mapping = `${payload.transferMapping} ${payload.expectedMechanism}`;
  const target = `${payload.targetDomain} ${payload.targetProblem}`;
  const overlap = tokenOverlap(mapping, target);
  const fits = overlap >= TARGET_FIT_MIN_OVERLAP;
  return decided(
    input,
    fits,
    fits
      ? `transfer mapping references the target (${overlap} shared token(s))`
      : 'transfer mapping does not reference the target (no shared tokens)',
  );
};
