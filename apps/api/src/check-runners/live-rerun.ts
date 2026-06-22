import { CheckResult } from '@doppl/contracts';
import type { EventStore } from '../event-store';
import {
  runCheck,
  type CheckRequest,
  type CheckRunContext,
  type RunCheckParams,
} from './run-check';

/**
 * P4.11 live allowlisted-check re-run + replay-backed fallback (ARCHITECTURE.md §7/§9/§17, KEY SAFETY
 * RULE #7, REQ-E-003). The demo "execute the transfer live" moment: re-run the winning idea's allowlisted
 * check LIVE through the SAME {@link runCheck} registry path (no new execution surface — the allowlist gate
 * already restricts to registered adapters), and if the live attempt stalls/fails, serve a REPLAY-BACKED
 * fallback — the most-recent recorded `check.completed` result read from the authoritative event store —
 * never re-sampling a provider, never appending, never fabricating a verdict.
 *
 * Mechanism only: the operator trigger, the demo UI, and the "winning idea" selection (which candidate's
 * check to re-run) are named-deferral to the demo / P3 / P5 tracks; this builds + tests `liveRerun` over
 * injected inputs.
 */

/** The live re-run attempt — defaults to {@link runCheck} (the same gated registry path). Injectable for tests. */
export type LiveAttempt = (params: RunCheckParams) => Promise<CheckResult>;

/** Non-fabricated skip reason when the live attempt fails AND there is no recorded result to fall back to. */
export const LIVE_NO_FALLBACK_REASON = 'live_failed_no_recorded_fallback';

export interface LiveRerunParams {
  store: EventStore;
  registry: RunCheckParams['registry'];
  request: CheckRequest;
  runContext: CheckRunContext;
  /** The live re-run attempt (default {@link runCheck}). Throwing or returning `skipped` triggers fallback. */
  liveAttempt?: LiveAttempt;
}

/** A live result is USABLE iff it produced a real verdict (passed/failed); `skipped` is not a usable verdict. */
function isUsableVerdict(result: CheckResult): boolean {
  return result.status === 'passed' || result.status === 'failed';
}

/**
 * Read the most-recent recorded USABLE (passed/failed) `check.completed` result for this candidate +
 * checkType from the authoritative log. READ-ONLY (rule #7 — no provider call, no append). `readByRun`
 * is sequence-ordered ascending, so the LAST match is the highest-sequence (latest authoritative) one.
 *
 * The status filter EXCLUDES `skipped` results: if the live attempt was the real `runCheck` returning
 * `skipped`, it already appended its OWN skip (now highest-sequence) before this read — that triggering
 * skip must never be served back as the fallback; and a recorded skip is not a usable verdict either.
 */
async function findRecordedFallback(
  store: EventStore,
  runContext: CheckRunContext,
  request: CheckRequest,
): Promise<CheckResult | null> {
  const rows = await store.readByRun(runContext.runId);
  let latest: CheckResult | null = null;
  for (const row of rows) {
    if (row.type !== 'check.completed') continue;
    const parsed = CheckResult.safeParse(row.payload);
    if (!parsed.success) continue;
    const result = parsed.data;
    if (
      result.candidateId === runContext.candidateId &&
      result.checkType === request.checkType &&
      isUsableVerdict(result)
    ) {
      latest = result; // ascending order → the last match wins (highest sequence)
    }
  }
  return latest;
}

export async function liveRerun(params: LiveRerunParams): Promise<CheckResult> {
  const { store, registry, request, runContext, liveAttempt = runCheck } = params;

  // 1. Try the live re-run through the SAME gated runCheck path (no new execution surface). A throw (a
  //    stall / provider error) OR a `skipped` result (couldn't produce a verdict) → fall back.
  let live: CheckResult | undefined;
  try {
    live = await liveAttempt({ store, registry, request, runContext });
  } catch {
    live = undefined;
  }
  if (live !== undefined && isUsableVerdict(live)) {
    return live;
  }

  // 2. Replay-backed fallback — serve the most-recent recorded usable verdict (READ-ONLY; no re-sample,
  //    no append; rule #7). The recorded result IS authoritative; it is served verbatim.
  const recorded = await findRecordedFallback(store, runContext, request);
  if (recorded !== null) {
    return recorded;
  }

  // 3. No usable recorded result → a non-fabricated skip signal (never an invented pass; no append).
  return {
    id: request.resultId,
    candidateId: runContext.candidateId,
    checkType: request.checkType,
    status: 'skipped',
    skipReason: LIVE_NO_FALLBACK_REASON,
    evidenceRefs: [],
  };
}
