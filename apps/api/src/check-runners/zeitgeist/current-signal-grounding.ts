import type { CheckResult } from '@doppl/contracts';
import type { CheckRunner, CheckRunnerInput } from '../registry';
import {
  RETRIEVAL_UNAVAILABLE_REASON,
  groundedResult,
  groundingRefs,
  parseZeitgeistCandidate,
  retrievedCorpus,
  skipped,
  tokenOverlap,
  unparseable,
} from '../shared';

/**
 * P4.10b current-signal-grounding check (ARCHITECTURE.md §7/§9, KEY SAFETY RULE #3 + #7). A PURE
 * non-executing CheckRunner scoring the candidate against the CALLER-fetched `retrievalResults` (DATA) —
 * it makes NO provider call itself (rule #3 non-executing; rule #7 replay-safe by construction).
 *
 * Passes iff the candidate's `currentSignals[]` are corroborated by the retrieved texts (token overlap ≥
 * {@link GROUNDING_MIN_OVERLAP}). Absent/empty retrievalResults → `skipped{retrieval_unavailable}` (no
 * false grounding, no re-fetch). Records the grounded sources in `evidenceRefs` (EvidenceKind signal); the
 * FULL retrievalResults persistence + replay re-thread is the P3 caller's job.
 */
export const CURRENT_SIGNAL_GROUNDING_ADAPTER_ID = 'zeitgeist.current_signal_grounding';

/** Min token-overlap between the candidate's cited signals and the retrieved corpus to count as grounded. */
export const GROUNDING_MIN_OVERLAP = 1;

export const currentSignalGroundingCheck: CheckRunner = (input: CheckRunnerInput): CheckResult => {
  const payload = parseZeitgeistCandidate(input.candidate);
  if (payload === null) {
    return unparseable(input);
  }
  const results = input.retrievalResults;
  if (results === undefined || results.length === 0) {
    return skipped(input, RETRIEVAL_UNAVAILABLE_REASON);
  }
  const signals = payload.currentSignals.join(' ');
  const overlap = tokenOverlap(signals, retrievedCorpus(results));
  const grounded = overlap >= GROUNDING_MIN_OVERLAP;
  return groundedResult(
    input,
    grounded,
    grounded
      ? `current signals corroborated by retrieval (${overlap} shared token(s) across ${results.length} source(s))`
      : 'current signals not corroborated by any retrieved source (no shared tokens)',
    groundingRefs(results, 'signal'),
  );
};
