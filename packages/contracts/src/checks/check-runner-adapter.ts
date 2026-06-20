import { z } from 'zod';
import { Subtype } from '../domain/subtype';
import { CheckResult } from './check-result';

/**
 * CheckRunnerAdapter — a NON-EXECUTING descriptor in the static allowlist registry (ARCHITECTURE.md
 * §7 line 270, REQ-S-003). KEY SAFETY RULE #3 (no arbitrary code execution) is pinned BY SHAPE: this
 * is a `z.strictObject` of pure descriptor fields, so any code-carrying field (`exec` / `command` /
 * `handler` / `fn` / `script` / `code` …) is unrepresentable — rejected as unknown, and the field-set
 * snapshot freezes the surface so a future widening fails the §2.5 gate (lesson §9 applied to rule #3).
 *
 * `checkType` is an open string (the allowlist REGISTRY is the gate, not a closed enum); `subtype` is
 * the closed P0.3 `Subtype` it applies to (optional → applies to both).
 */
export const CheckRunnerAdapter = z.strictObject({
  id: z.string().min(1),
  checkType: z.string().min(1),
  subtype: Subtype.optional(),
  label: z.string().min(1).optional(),
});

export type CheckRunnerAdapter = z.infer<typeof CheckRunnerAdapter>;

/**
 * CheckRunnerRegistry — the allowlist keyed by adapter id (mirrors the model registry). Its CONTENTS
 * (which adapters exist) are populated by the check-runners track (P4); this freezes the shape.
 */
export const CheckRunnerRegistry = z.record(z.string(), CheckRunnerAdapter);

export type CheckRunnerRegistry = z.infer<typeof CheckRunnerRegistry>;

/** Input to {@link resolveCheckAdapter}: the requested adapter id + the context to build a skip. */
export interface ResolveCheckRequest {
  adapterId: string;
  resultId: string;
  candidateId: string;
  checkType: string;
}

/**
 * The allowlist gate (KEY SAFETY RULE #3 fail-safe). Pure: selects/rejects by id, NEVER executes and
 * NEVER throws. A registered adapter id resolves to its descriptor; an UNREGISTERED id returns a
 * `skipped` CheckResult with a fixed reason — so an unknown/unsupported check is recorded as skipped
 * rather than run. Single-source so every consumer rejects-unregistered identically (lesson §8).
 *
 * Lookup is an OWN-property check (`hasOwnProperty.call`), never `id in registry` or `registry[id]`
 * alone — an adversarial id like `__proto__` / `constructor` / `toString` must NOT resolve to an
 * `Object.prototype` member and be treated as a registered adapter (allowlist-bypass); it falls
 * through to `skipped`. The skip reason is a FIXED constant — the untrusted requested id is never
 * reflected into it (IDs are untrusted bytes).
 */
export function resolveCheckAdapter(
  registry: CheckRunnerRegistry,
  request: ResolveCheckRequest,
): CheckRunnerAdapter | CheckResult {
  if (Object.prototype.hasOwnProperty.call(registry, request.adapterId)) {
    const adapter = registry[request.adapterId];
    if (adapter !== undefined) {
      return adapter;
    }
  }
  const skipped: CheckResult = {
    id: request.resultId,
    candidateId: request.candidateId,
    checkType: request.checkType,
    status: 'skipped',
    skipReason: 'unregistered_adapter',
    evidenceRefs: [],
  };
  return skipped;
}
