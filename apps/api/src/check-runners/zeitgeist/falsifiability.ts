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
 * P4.10b falsifiability check (ARCHITECTURE.md §7/§9, KEY SAFETY RULE #3 + #7). A PURE non-executing
 * CheckRunner scoring the candidate against the CALLER-fetched `retrievalResults` (DATA) — NO provider
 * call itself (rule #3 non-executing; rule #7 replay-safe by construction).
 *
 * Passes iff the candidate is falsifiable AND checkable: it carries at least one `falsifiablePrediction`
 * AND EVERY prediction shares at least {@link FALSIFIABILITY_MIN_PREDICTION_OVERLAP} grounding token with
 * the retrieved corpus (each prediction is checkable against the retrieved evidence). No predictions →
 * failed (nothing to falsify). Absent/empty retrievalResults → `skipped{retrieval_unavailable}` (no false
 * grounding, no re-fetch). Records the grounded sources in `evidenceRefs` (EvidenceKind signal); the FULL
 * retrievalResults persistence + replay re-thread is the P3 caller's job.
 */
export const FALSIFIABILITY_ADAPTER_ID = 'zeitgeist.falsifiability';

/** Min grounding-token overlap each prediction must share with the retrieved corpus to be checkable. */
export const FALSIFIABILITY_MIN_PREDICTION_OVERLAP = 1;

export const falsifiabilityCheck: CheckRunner = (input: CheckRunnerInput): CheckResult => {
  const payload = parseZeitgeistCandidate(input.candidate);
  if (payload === null) {
    return unparseable(input);
  }
  const results = input.retrievalResults;
  if (results === undefined || results.length === 0) {
    return skipped(input, RETRIEVAL_UNAVAILABLE_REASON);
  }
  const corpus = retrievedCorpus(results);
  const predictions = payload.falsifiablePredictions;
  const allCheckable =
    predictions.length > 0 &&
    predictions.every((p) => tokenOverlap(p, corpus) >= FALSIFIABILITY_MIN_PREDICTION_OVERLAP);
  return groundedResult(
    input,
    allCheckable,
    allCheckable
      ? `all ${predictions.length} prediction(s) checkable against retrieved evidence`
      : predictions.length === 0
        ? 'no falsifiable predictions to check (not falsifiable)'
        : 'at least one prediction is not checkable against any retrieved evidence',
    groundingRefs(results, 'signal'),
  );
};
