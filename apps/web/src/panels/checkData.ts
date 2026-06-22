import { CheckResult } from '../data/contracts';
import type { RunEventEnvelope } from '../data/contracts';

/**
 * checkData — the PURE subtype-check selector (same §6 events-derived pattern as the critic gauntlet).
 * Collects `CheckResult` per `candidateId` from `check.completed` events (validated via the frozen
 * `CheckResult`), ordered by first-seen `sequence` (replay-equivalent).
 *
 * EMIT-ONLY DISPLAY (rule #3/#6): the selector returns each result VERBATIM — it never re-derives a
 * pass/fail/verdict from `output`/`score`. The allowlisted non-executing check-runner + the kernel are
 * authoritative; a `skipped` result is the allowlist fail-safe working (unregistered/execution-requiring
 * → skipped + reason, never executed). A malformed payload is skipped defensively.
 */

export type CheckResultValue = ReturnType<typeof CheckResult.parse>;

/** Group `check.completed` results by candidateId; per-candidate + key order both follow first-seen sequence. */
export function deriveChecksByCandidate(
  events: readonly RunEventEnvelope[],
): Map<string, CheckResultValue[]> {
  const ordered = [...events].sort((a, b) => a.sequence - b.sequence);
  const byCandidate = new Map<string, CheckResultValue[]>();
  for (const e of ordered) {
    if (e.type !== 'check.completed') continue;
    const parsed = CheckResult.safeParse(e.payload);
    if (!parsed.success) continue; // skip a malformed payload defensively
    const list = byCandidate.get(parsed.data.candidateId) ?? [];
    list.push(parsed.data);
    byCandidate.set(parsed.data.candidateId, list);
  }
  return byCandidate;
}
