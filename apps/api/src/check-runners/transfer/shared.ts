import { CrossDomainTransferPayload } from '@doppl/contracts';
import type { CheckResult } from '@doppl/contracts';
import type { CheckRunnerInput } from '../registry';

/**
 * P4.9 transfer-check shared helpers (ARCHITECTURE.md §7, KEY SAFETY RULE #3). Pure, deterministic, no
 * IO, no code execution. The candidate is parsed as DATA (a `CrossDomainTransferPayload`) — never
 * `eval`/`Function`/executed. An unparseable candidate yields `null` (the adapter records a `failed`
 * CheckResult, never a throw — rule #3 untrusted-data discipline).
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

/** Count of shared tokens between two texts (deterministic; the target-fit overlap signal). */
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
  return decided(input, false, 'unparseable cross_domain_transfer payload');
}
