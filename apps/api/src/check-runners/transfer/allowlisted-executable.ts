import type { CheckResult } from '@doppl/contracts';
import type { CheckRunner, CheckRunnerInput } from '../registry';
import { decided, normalize, parseTransferCandidate, skipped } from '../shared';

/**
 * P4.9 allowlisted-executable check (ARCHITECTURE.md §7/§14, KEY SAFETY RULE #3 — no arbitrary code
 * execution). Runs ONLY when the transfer carries an `executableCheckIdea` AND the (normalized)
 * `targetProblem` is in the fixed {@link PREPARED_PROBLEM_ALLOWLIST}; otherwise `skipped` with a reason.
 *
 * CRITICAL: this adapter NEVER executes the candidate's `executableCheckIdea` — it is read as DATA only.
 * For a prepared, allowlisted problem the adapter returns a deterministic prepared-check result (the MVP
 * placeholder for a real prepared verification harness; the live re-run lands in P4.11). There is no
 * `eval`/`Function`/exec path: candidate-supplied code is inert by construction.
 */
export const ALLOWLISTED_EXECUTABLE_ADAPTER_ID = 'transfer.allowlisted_executable';

/** Skip reasons (fixed constants — the untrusted candidate id/text is never reflected into them). */
export const NO_EXECUTABLE_IDEA_REASON = 'no_executable_check_idea';
export const PROBLEM_NOT_PREPARED_REASON = 'problem_not_prepared';

/**
 * The fixed prepared-problem allowlist (normalized `targetProblem` strings). Closed at module load — an
 * agent/candidate cannot add a problem; an unprepared transfer is always skipped. MVP set; extended only
 * by source edits as real prepared problems are curated.
 */
export const PREPARED_PROBLEM_ALLOWLIST: ReadonlySet<string> = new Set([
  'toy sorting problem',
  'toy routing problem',
]);

export const allowlistedExecutableCheck: CheckRunner = (input: CheckRunnerInput): CheckResult => {
  const payload = parseTransferCandidate(input.candidate);
  if (payload === null) {
    return decided(input, false, 'unparseable cross_domain_transfer payload');
  }
  if (payload.executableCheckIdea === undefined) {
    return skipped(input, NO_EXECUTABLE_IDEA_REASON);
  }
  if (!PREPARED_PROBLEM_ALLOWLIST.has(normalize(payload.targetProblem))) {
    return skipped(input, PROBLEM_NOT_PREPARED_REASON);
  }
  // Prepared + allowlisted: the deterministic prepared check runs. The executableCheckIdea is NOT
  // executed — only its presence + the prepared-problem membership are checked (rule #3).
  return decided(
    input,
    true,
    'prepared allowlisted check ran deterministically (candidate code never executed)',
  );
};
