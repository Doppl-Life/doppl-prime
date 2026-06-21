import type { CheckResult, CheckRunnerRegistry } from '@doppl/contracts';

/**
 * P4.5 check-runner allowlist registry (KEY SAFETY RULE #3 — no arbitrary code execution; ARCHITECTURE.md
 * §7 / §14). Two CLOSED, boot-fixed (frozen) surfaces:
 *
 *  - {@link CHECK_RUNNER_REGISTRY}: the allowlist of NON-EXECUTING descriptors (frozen `CheckRunnerAdapter`,
 *    no code-carrying field representable — rule #3 by shape, lesson 11).
 *  - {@link CHECK_RUNNER_IMPLS}: the PARALLEL pure-function impl map. The descriptor carries no code, so
 *    the non-executing check fn lives here keyed by the same adapter id. A registered descriptor with NO
 *    entry here is recorded `skipped` by the harness (no exec path exists).
 *
 * The gate is the frozen `resolveCheckAdapter` (own-property lookup, fail-safe skip) — re-exported here
 * for consumers; never reimplemented (lesson 8/11). The real transfer/zeitgeist adapters land P4.9/P4.10.
 */

export { resolveCheckAdapter } from '@doppl/contracts';

/** The prepared deterministic toy adapter — a placeholder proving the registered-impl path. */
export const PREPARED_TOY_ADAPTER_ID = 'prepared.deterministic_toy';

/** placeholder — superseded by real transfer/zeitgeist adapters in P4.9/P4.10 */
export const EXECUTION_REQUIRING_ADAPTER_ID = 'prepared.execution_requiring';

/** The deterministic input a non-executing {@link CheckRunner} evaluates. `candidate` is opaque data. */
export interface CheckRunnerInput {
  resultId: string;
  candidateId: string;
  checkType: string;
  candidate: string;
}

/** A NON-EXECUTING check: a pure, deterministic function (input → CheckResult) — no IO, no code exec. */
export type CheckRunner = (input: CheckRunnerInput) => CheckResult;

/**
 * The prepared deterministic toy check — a placeholder that proves the registered-impl path. Pure +
 * deterministic (same input → same CheckResult). Superseded by real transfer/zeitgeist checks (P4.9/P4.10).
 */
const preparedToyCheck: CheckRunner = (input) => {
  const nonEmpty = input.candidate.trim().length > 0;
  return {
    id: input.resultId,
    candidateId: input.candidateId,
    checkType: input.checkType,
    status: nonEmpty ? 'passed' : 'failed',
    score: nonEmpty ? 1 : 0,
    output: nonEmpty
      ? 'prepared deterministic toy check: non-empty candidate'
      : 'prepared deterministic toy check: empty candidate',
    evidenceRefs: [],
  };
};

/**
 * The static, boot-fixed allowlist of NON-EXECUTING descriptors (rule #3). Frozen — no runtime register
 * path. `EXECUTION_REQUIRING_ADAPTER_ID` is a registered descriptor with NO impl in
 * {@link CHECK_RUNNER_IMPLS}: it demonstrates the "registered but would require executing code → skipped"
 * acceptance path (placeholder — P4.9/P4.10 supersede).
 */
export const CHECK_RUNNER_REGISTRY: CheckRunnerRegistry = Object.freeze({
  [PREPARED_TOY_ADAPTER_ID]: {
    id: PREPARED_TOY_ADAPTER_ID,
    checkType: 'prepared_deterministic_toy',
    label: 'Prepared deterministic toy check (placeholder — P4.9/P4.10 supersede)',
  },
  // placeholder — superseded by real transfer/zeitgeist adapters in P4.9/P4.10
  [EXECUTION_REQUIRING_ADAPTER_ID]: {
    id: EXECUTION_REQUIRING_ADAPTER_ID,
    checkType: 'prepared_execution_requiring',
    label: 'Prepared execution-requiring check (placeholder — non-executing impl absent → skipped)',
  },
});

/**
 * The PARALLEL closed pure-impl map (rule #3 — the non-executing check fn keyed by adapter id, since the
 * descriptor carries no code field). Frozen at boot. A registered descriptor with NO entry here is
 * recorded `skipped` (execution_required) by the harness — there is no exec path.
 */
export const CHECK_RUNNER_IMPLS: Readonly<Record<string, CheckRunner>> = Object.freeze({
  [PREPARED_TOY_ADAPTER_ID]: preparedToyCheck,
  // EXECUTION_REQUIRING_ADAPTER_ID intentionally has NO impl → execution_required skip.
});
