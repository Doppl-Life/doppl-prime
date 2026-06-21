import type { CheckResult } from '@doppl/contracts';
import type { CheckRunner, CheckRunnerInput } from '../registry';
import { decided, normalize, parseTransferCandidate, unparseable } from './shared';

/**
 * P4.9 source-domain-validity check (ARCHITECTURE.md §7, KEY SAFETY RULE #3 — pure non-executing
 * CheckRunner). A cross-domain transfer must actually cross domains: passes iff the normalized
 * `sourceDomain` differs from the normalized `targetDomain`. A same-domain "transfer" fails. The
 * candidate is parsed as DATA; an unparseable candidate fails (never throws, never executes).
 */
export const SOURCE_VALIDITY_ADAPTER_ID = 'transfer.source_validity';

export const sourceValidityCheck: CheckRunner = (input: CheckRunnerInput): CheckResult => {
  const payload = parseTransferCandidate(input.candidate);
  if (payload === null) {
    return unparseable(input);
  }
  const crossesDomains = normalize(payload.sourceDomain) !== normalize(payload.targetDomain);
  return decided(
    input,
    crossesDomains,
    crossesDomains
      ? 'source domain differs from target domain (genuine cross-domain transfer)'
      : 'source and target domains are the same (not a cross-domain transfer)',
  );
};
