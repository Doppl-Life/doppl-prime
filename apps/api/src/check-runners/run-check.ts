import { CheckResult, CURRENT_SCHEMA_VERSION, resolveCheckAdapter } from '@doppl/contracts';
import type { CheckRunnerRegistry } from '@doppl/contracts';
import type { AppendInput, EventStore } from '../event-store';
import { CHECK_RUNNER_IMPLS } from './registry';

/**
 * P4.5 runCheck harness (KEY SAFETY RULE #3 — no arbitrary code execution; ARCHITECTURE.md §4 marker
 * semantics; §7 allowlist). Per invocation:
 *
 *   resolve (frozen gate) → emit `check.started` operation-start marker → run-or-skip → emit exactly one
 *   `check.completed` carrying the VALIDATED CheckResult.
 *
 * The `check.started` marker is actor `check_runner`, generic payload, and debits NO energy (rule #8 —
 * markers never narrow to EnergyEvent). Depends ONLY on the {@link EventStore} port (never a raw
 * run_events write — forbidden #4); `runContext` is injected (no P3 dependency — the P3 verifying phase
 * and P4.9/P4.10 adapters are the real callers).
 */

/** A registered descriptor with no non-executing impl is recorded `skipped` with this FIXED reason. */
export const EXECUTION_REQUIRED_REASON = 'execution_required';

/** Identifies a single check invocation. `resultId` is the CheckResult id; `candidate` is opaque data. */
export interface CheckRequest {
  adapterId: string;
  checkType: string;
  resultId: string;
  candidate: string;
}

/** Run / generation / candidate correlation injected by the caller. */
export interface CheckRunContext {
  runId: string;
  generationId?: string;
  candidateId: string;
}

export interface RunCheckParams {
  store: EventStore;
  registry: CheckRunnerRegistry;
  request: CheckRequest;
  runContext: CheckRunContext;
}

/** Own-property lookup (lesson 11) — a prototype-chain key never borrows an `Object.prototype` member. */
function ownLookup<T>(map: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined;
}

function buildAppendInput(
  eventId: string,
  type: 'check.started' | 'check.completed',
  runContext: CheckRunContext,
  payload: Record<string, unknown>,
): AppendInput {
  const input: AppendInput = {
    id: eventId,
    runId: runContext.runId,
    candidateId: runContext.candidateId,
    type,
    actor: 'check_runner',
    payload,
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
  if (runContext.generationId !== undefined) {
    input.generationId = runContext.generationId;
  }
  return input;
}

export async function runCheck({
  store,
  registry,
  request,
  runContext,
}: RunCheckParams): Promise<CheckResult> {
  const { adapterId, checkType, resultId, candidate } = request;
  const { candidateId } = runContext;

  // 1. Emit the check.started operation-start marker (ALWAYS, even on skip — a skip is never silent).
  //    actor check_runner, generic correlation payload, NO energy debit (rule #8). IDs are opaque.
  await store.append(
    buildAppendInput(`${resultId}:started`, 'check.started', runContext, {
      adapterId,
      checkType,
      candidateId,
    }),
  );

  // 2. Resolve through the frozen allowlist gate (pure: own-property select/reject, NEVER executes,
  //    NEVER throws). An unregistered id returns a skipped CheckResult with a fixed reason.
  const resolved = resolveCheckAdapter(registry, { adapterId, resultId, candidateId, checkType });

  // 3. Run-or-skip → a CheckResult.
  let result: CheckResult;
  if ('status' in resolved) {
    // Unregistered → the frozen gate's skipped CheckResult (reason 'unregistered_adapter').
    result = resolved;
  } else {
    const impl = ownLookup(CHECK_RUNNER_IMPLS, adapterId);
    if (impl === undefined) {
      // Registered descriptor with NO non-executing impl → skipped (no exec path exists, rule #3).
      result = {
        id: resultId,
        candidateId,
        checkType: resolved.checkType,
        status: 'skipped',
        skipReason: EXECUTION_REQUIRED_REASON,
        evidenceRefs: [],
      };
    } else {
      result = impl({ resultId, candidateId, checkType: resolved.checkType, candidate });
    }
  }

  // 4. Validate the produced result (producer-agreement, lesson 20) then emit exactly one
  //    check.completed whose payload IS the validated CheckResult (the payload map narrows it on append).
  const validated = CheckResult.parse(result);
  await store.append(
    buildAppendInput(`${resultId}:completed`, 'check.completed', runContext, validated),
  );

  return validated;
}
