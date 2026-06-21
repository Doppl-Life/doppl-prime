import { CrossDomainTransferPayload, ZeitgeistSynthesisPayload } from '@doppl/contracts';
import type { CheckResult, EvidenceKind, EvidenceRef } from '@doppl/contracts';
import type { CheckRunnerInput, RetrievalResult } from './registry';

/**
 * Shared, SUBTYPE-AGNOSTIC check-adapter helpers (ARCHITECTURE.md §7, KEY SAFETY RULE #3). Pure,
 * deterministic, no IO, no code execution. A candidate is parsed as DATA (a frozen subtype payload) —
 * never `eval`/`Function`/executed. An unparseable candidate yields `null` (the adapter records a
 * `failed` CheckResult, never a throw — rule #3 untrusted-data discipline). Used by both the P4.9
 * cross-domain-transfer and the P4.10 zeitgeist-synthesis adapters (lesson 32).
 */

/** Minimum token length counted toward an overlap (drops trivial 1–2 char tokens). Named const = tunable. */
export const MIN_TOKEN_LEN = 3;

/**
 * Parse the untrusted `candidate` string as a {@link CrossDomainTransferPayload} (data only). Returns the
 * validated payload or `null` — JSON.parse is wrapped so malformed JSON fails to null (never throws), and
 * a structurally-invalid object fails the frozen schema to null. NEVER executes the candidate.
 */
export function parseTransferCandidate(candidate: string): CrossDomainTransferPayload | null {
  let json: unknown;
  try {
    json = JSON.parse(candidate);
  } catch {
    return null;
  }
  const parsed = CrossDomainTransferPayload.safeParse(json);
  return parsed.success ? parsed.data : null;
}

/**
 * Parse the untrusted `candidate` string as a {@link ZeitgeistSynthesisPayload} (data only). Same
 * fail-not-throw discipline as {@link parseTransferCandidate}; NEVER executes the candidate.
 */
export function parseZeitgeistCandidate(candidate: string): ZeitgeistSynthesisPayload | null {
  let json: unknown;
  try {
    json = JSON.parse(candidate);
  } catch {
    return null;
  }
  const parsed = ZeitgeistSynthesisPayload.safeParse(json);
  return parsed.success ? parsed.data : null;
}

/** Normalize a free-text field for deterministic comparison: lowercase, trim, collapse inner whitespace. */
export function normalize(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, ' ');
}

/** Deterministic word count (non-empty whitespace-delimited tokens). */
export function wordCount(text: string): number {
  return text.trim().length === 0 ? 0 : text.trim().split(/\s+/).length;
}

/** Tokenize to a Set of lowercase alphanumeric tokens of length ≥ {@link MIN_TOKEN_LEN} (deterministic). */
export function tokenSet(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= MIN_TOKEN_LEN),
  );
}

/** Count of shared tokens between two texts (deterministic; the relational overlap signal). */
export function tokenOverlap(a: string, b: string): number {
  const setB = tokenSet(b);
  let shared = 0;
  for (const t of tokenSet(a)) {
    if (setB.has(t)) shared += 1;
  }
  return shared;
}

/** Build a `passed`/`failed` CheckResult (deterministic; score 1/0 for explainability; no evidenceRefs). */
export function decided(input: CheckRunnerInput, passed: boolean, output: string): CheckResult {
  return {
    id: input.resultId,
    candidateId: input.candidateId,
    checkType: input.checkType,
    status: passed ? 'passed' : 'failed',
    score: passed ? 1 : 0,
    output,
    evidenceRefs: [],
  };
}

/** Build a `passed`/`failed` CheckResult carrying the grounding `evidenceRefs` it used (rule #7 record). */
export function groundedResult(
  input: CheckRunnerInput,
  passed: boolean,
  output: string,
  evidenceRefs: EvidenceRef[],
): CheckResult {
  return {
    id: input.resultId,
    candidateId: input.candidateId,
    checkType: input.checkType,
    status: passed ? 'passed' : 'failed',
    score: passed ? 1 : 0,
    output,
    evidenceRefs,
  };
}

/** Build a `skipped` CheckResult with a fixed reason (the adapter is not applicable — never the untrusted id). */
export function skipped(input: CheckRunnerInput, reason: string): CheckResult {
  return {
    id: input.resultId,
    candidateId: input.candidateId,
    checkType: input.checkType,
    status: 'skipped',
    skipReason: reason,
    evidenceRefs: [],
  };
}

/** Build the `failed` CheckResult for an unparseable candidate (rule #3 fail-not-throw). */
export function unparseable(input: CheckRunnerInput): CheckResult {
  return decided(input, false, 'unparseable candidate payload');
}

/* --- Grounding helpers (P4.9b/P4.10b — retrieval-grounded checks; the CALLER fetches, the adapter is pure) --- */

/**
 * Fixed skip reason for a grounding adapter with no retrievalResults — the check COULDN'T ground (not the
 * candidate's fault), so it `skipped`s (never a false grounding, never a re-fetch). A literal constant.
 */
export const RETRIEVAL_UNAVAILABLE_REASON = 'retrieval_unavailable';

/** The joined corpus of retrieved texts (deterministic; the grounding overlap is computed against this). */
export function retrievedCorpus(results: readonly RetrievalResult[]): string {
  return results.map((r) => r.text).join(' ');
}

/**
 * Record WHICH retrieved sources the adapter grounded against, as `EvidenceRef`s (label = source, within
 * the Postgres tier — no external deref). NOTE: this records the adapter's grounding EVIDENCE; the FULL
 * `retrievalResults` persistence + replay re-thread is the P3 caller's job (§9 rule #7), not the adapter's.
 *
 * `RetrievalResult` is caller-threaded DATA with NO runtime validation, so a degraded/fallback fetch could
 * supply an empty/whitespace `source`. `EvidenceRef.label` is `.min(1)`, so an empty source would produce
 * an INVALID `EvidenceRef` and make the downstream `CheckResult.parse` THROW — breaking the family's
 * fail-not-throw discipline. Drop empty-source results here so the produced `EvidenceRef[]` is always
 * schema-valid; the grounding verdict (computed from the texts) is unaffected.
 */
export function groundingRefs(
  results: readonly RetrievalResult[],
  kind: EvidenceKind,
): EvidenceRef[] {
  return results.filter((r) => r.source.trim().length > 0).map((r) => ({ kind, label: r.source }));
}
