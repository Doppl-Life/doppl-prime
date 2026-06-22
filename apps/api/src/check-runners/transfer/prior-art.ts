import type { CheckResult } from '@doppl/contracts';
import type { CheckRunner, CheckRunnerInput } from '../registry';
import {
  RETRIEVAL_UNAVAILABLE_REASON,
  groundedResult,
  groundingRefs,
  parseTransferCandidate,
  skipped,
  tokenOverlap,
  unparseable,
} from '../shared';

/**
 * P4.9b prior-art grounding check (ARCHITECTURE.md §7/§9, KEY SAFETY RULE #3 + #7). A PURE non-executing
 * CheckRunner: it scores the transfer candidate against the `retrievalResults` the CALLER (the P3
 * verifying phase) fetched + threaded in as DATA. It makes NO gateway/provider call itself — so the
 * allowlist stays non-executing (rule #3) and replay is trivial (a pure adapter never re-calls a provider;
 * the caller persists the retrieval outcome + re-threads it on replay — rule #7).
 *
 * Passes iff the candidate's mapping/mechanism does NOT substantially duplicate the retrieved prior art
 * (max token-overlap with any retrieved text < {@link PRIOR_ART_MAX_OVERLAP} = novel); high overlap → the
 * idea IS prior art → failed. Absent/empty retrievalResults → `skipped{retrieval_unavailable}` (the check
 * couldn't ground — NOT a false pass, and it never re-fetches). The adapter records WHICH sources it
 * grounded against in `evidenceRefs` (EvidenceKind prior_art); the FULL retrievalResults persistence +
 * replay re-thread is the P3 caller's job, not this adapter's.
 */
export const PRIOR_ART_ADAPTER_ID = 'transfer.prior_art';

/** Max token-overlap of the candidate mapping/mechanism with any retrieved text to still count as novel. */
export const PRIOR_ART_MAX_OVERLAP = 3;

export const priorArtCheck: CheckRunner = (input: CheckRunnerInput): CheckResult => {
  const payload = parseTransferCandidate(input.candidate);
  if (payload === null) {
    return unparseable(input);
  }
  const results = input.retrievalResults;
  if (results === undefined || results.length === 0) {
    return skipped(input, RETRIEVAL_UNAVAILABLE_REASON);
  }
  const mapping = `${payload.transferMapping} ${payload.expectedMechanism}`;
  let maxOverlap = 0;
  for (const r of results) {
    const overlap = tokenOverlap(mapping, r.text);
    if (overlap > maxOverlap) maxOverlap = overlap;
  }
  const novel = maxOverlap < PRIOR_ART_MAX_OVERLAP;
  return groundedResult(
    input,
    novel,
    novel
      ? `candidate is novel vs ${results.length} retrieved prior-art source(s) (max ${maxOverlap} shared token(s))`
      : `candidate duplicates retrieved prior art (${maxOverlap} shared tokens, threshold ${PRIOR_ART_MAX_OVERLAP})`,
    groundingRefs(results, 'prior_art'),
  );
};
