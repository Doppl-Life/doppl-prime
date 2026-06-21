import type { CheckResult, CheckRunnerRegistry } from '@doppl/contracts';
// P4.9 deterministic cross-domain-transfer adapters (registered below). The adapters' only dependency on
// this module is TYPE-only (CheckRunner/CheckRunnerInput, erased at runtime) — no runtime import cycle.
// prior-art is DEFERRED (needs retrieval P2.6/P2.7 + an async harness — not buildable in the pure-sync path).
import { SOURCE_VALIDITY_ADAPTER_ID, sourceValidityCheck } from './transfer/source-validity';
import { TARGET_FIT_ADAPTER_ID, targetFitCheck } from './transfer/target-fit';
import { MAPPING_QUALITY_ADAPTER_ID, mappingQualityCheck } from './transfer/mapping-quality';
import {
  ALLOWLISTED_EXECUTABLE_ADAPTER_ID,
  allowlistedExecutableCheck,
} from './transfer/allowlisted-executable';
// P4.10 deterministic zeitgeist-synthesis adapters (registered below; same TYPE-only dependency, no
// runtime cycle). current-signal-grounding + falsifiability are DEFERRED (retrieval/async-harness gated).
import { ZEITGEIST_NOVELTY_ADAPTER_ID, zeitgeistNoveltyCheck } from './zeitgeist/novelty';
import { ZEITGEIST_TIMING_ADAPTER_ID, zeitgeistTimingCheck } from './zeitgeist/timing';
import { ZEITGEIST_COHERENCE_ADAPTER_ID, zeitgeistCoherenceCheck } from './zeitgeist/coherence';

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
 * for consumers; never reimplemented (lesson 8/11). P4.9 adds the 4 deterministic cross-domain-transfer
 * adapters; the prepared placeholders remain as the P4.5 test fixtures (they are still referenced).
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
    label:
      'Prepared deterministic toy check (placeholder — also the P4.5 registered-impl test fixture)',
  },
  // placeholder — also the P4.5 registered-but-no-impl skip-path test fixture (kept; still referenced)
  [EXECUTION_REQUIRING_ADAPTER_ID]: {
    id: EXECUTION_REQUIRING_ADAPTER_ID,
    checkType: 'prepared_execution_requiring',
    label: 'Prepared execution-requiring check (placeholder — non-executing impl absent → skipped)',
  },
  // P4.9 cross-domain-transfer deterministic adapters (cross_domain_transfer subtype).
  [SOURCE_VALIDITY_ADAPTER_ID]: {
    id: SOURCE_VALIDITY_ADAPTER_ID,
    checkType: 'transfer.source_validity',
    subtype: 'cross_domain_transfer',
    label: 'Source-domain-validity (transfer must cross domains)',
  },
  [TARGET_FIT_ADAPTER_ID]: {
    id: TARGET_FIT_ADAPTER_ID,
    checkType: 'transfer.target_fit',
    subtype: 'cross_domain_transfer',
    label: 'Target-fit (mapping references the target)',
  },
  [MAPPING_QUALITY_ADAPTER_ID]: {
    id: MAPPING_QUALITY_ADAPTER_ID,
    checkType: 'transfer.mapping_quality',
    subtype: 'cross_domain_transfer',
    label: 'Mapping-quality (mapping + mechanism are substantive)',
  },
  [ALLOWLISTED_EXECUTABLE_ADAPTER_ID]: {
    id: ALLOWLISTED_EXECUTABLE_ADAPTER_ID,
    checkType: 'transfer.allowlisted_executable',
    subtype: 'cross_domain_transfer',
    label: 'Allowlisted-executable (prepared problems only; never executes candidate code)',
  },
  // P4.10 zeitgeist-synthesis deterministic adapters (zeitgeist_synthesis subtype).
  [ZEITGEIST_NOVELTY_ADAPTER_ID]: {
    id: ZEITGEIST_NOVELTY_ADAPTER_ID,
    checkType: 'zeitgeist.novelty',
    subtype: 'zeitgeist_synthesis',
    label:
      'Novelty self-consistency (thesis distinct from cited prior art; NOT the P5 embedding score)',
  },
  [ZEITGEIST_TIMING_ADAPTER_ID]: {
    id: ZEITGEIST_TIMING_ADAPTER_ID,
    checkType: 'zeitgeist.timing',
    subtype: 'zeitgeist_synthesis',
    label: 'Timing (whyNow grounded in cited current signals)',
  },
  [ZEITGEIST_COHERENCE_ADAPTER_ID]: {
    id: ZEITGEIST_COHERENCE_ADAPTER_ID,
    checkType: 'zeitgeist.coherence',
    subtype: 'zeitgeist_synthesis',
    label: 'Coherence (thesis connected to its whyNow + predictions)',
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
  // P4.9 transfer adapter impls (pure, non-executing — parse candidate as DATA).
  [SOURCE_VALIDITY_ADAPTER_ID]: sourceValidityCheck,
  [TARGET_FIT_ADAPTER_ID]: targetFitCheck,
  [MAPPING_QUALITY_ADAPTER_ID]: mappingQualityCheck,
  [ALLOWLISTED_EXECUTABLE_ADAPTER_ID]: allowlistedExecutableCheck,
  // P4.10 zeitgeist adapter impls (pure, non-executing — parse candidate as DATA).
  [ZEITGEIST_NOVELTY_ADAPTER_ID]: zeitgeistNoveltyCheck,
  [ZEITGEIST_TIMING_ADAPTER_ID]: zeitgeistTimingCheck,
  [ZEITGEIST_COHERENCE_ADAPTER_ID]: zeitgeistCoherenceCheck,
});
