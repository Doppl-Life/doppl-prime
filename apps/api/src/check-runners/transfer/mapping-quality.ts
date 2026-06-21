import type { CheckResult } from '@doppl/contracts';
import type { CheckRunner, CheckRunnerInput } from '../registry';
import { decided, parseTransferCandidate, unparseable, wordCount } from '../shared';

/**
 * P4.9 mapping-quality check (ARCHITECTURE.md §7, KEY SAFETY RULE #3 — pure non-executing CheckRunner).
 * Both the `transferMapping` and the `expectedMechanism` must be substantive: passes iff each has at
 * least {@link MAPPING_QUALITY_MIN_WORDS} words. A degenerate one-word mapping fails. Deterministic,
 * tunable MVP signal (real quality is critics/judge). Candidate parsed as DATA.
 */
export const MAPPING_QUALITY_ADAPTER_ID = 'transfer.mapping_quality';

/** Minimum word count for each of mapping + mechanism to count as substantive. Named const = tunable. */
export const MAPPING_QUALITY_MIN_WORDS = 3;

export const mappingQualityCheck: CheckRunner = (input: CheckRunnerInput): CheckResult => {
  const payload = parseTransferCandidate(input.candidate);
  if (payload === null) {
    return unparseable(input);
  }
  const mappingWords = wordCount(payload.transferMapping);
  const mechanismWords = wordCount(payload.expectedMechanism);
  const substantive =
    mappingWords >= MAPPING_QUALITY_MIN_WORDS && mechanismWords >= MAPPING_QUALITY_MIN_WORDS;
  return decided(
    input,
    substantive,
    substantive
      ? `mapping and mechanism are substantive (${mappingWords}/${mechanismWords} words)`
      : `mapping or mechanism is too thin (${mappingWords}/${mechanismWords} words, need ${MAPPING_QUALITY_MIN_WORDS} each)`,
  );
};
