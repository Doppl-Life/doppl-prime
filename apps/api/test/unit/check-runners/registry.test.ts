import { describe, expect, test } from 'vitest';
import { CheckResult, resolveCheckAdapter } from '@doppl/contracts';
import {
  CHECK_RUNNER_IMPLS,
  CHECK_RUNNER_REGISTRY,
  PREPARED_TOY_ADAPTER_ID,
} from '../../../src/check-runners/registry';

/**
 * P4.5 check-runner allowlist registry (KEY SAFETY RULE #3 — no arbitrary code execution). The registry
 * is a static, boot-fixed allowlist of NON-EXECUTING descriptors; the gate is the frozen
 * `resolveCheckAdapter` (own-property lookup, fail-safe skip). The impls live in a parallel frozen
 * pure-function map — there is no code-carrying field on a descriptor (lesson 11).
 */

function req(adapterId: string) {
  return { adapterId, resultId: 'chk_1', candidateId: 'cand_1', checkType: 'some_check' };
}

describe('CHECK_RUNNER_REGISTRY — static allowlist gate (rule #3)', () => {
  // spec(§7) rule #3 — positive guard first (lesson 10): an unregistered id resolves to a skipped
  // CheckResult with the frozen fixed reason, never an error-free pass and never code execution.
  test('test_unregistered_adapter_resolves_to_skip', () => {
    const resolved = resolveCheckAdapter(CHECK_RUNNER_REGISTRY, req('no.such.adapter'));
    expect(CheckResult.safeParse(resolved).success).toBe(true);
    const skip = resolved as CheckResult;
    expect(skip.status).toBe('skipped');
    expect(skip.skipReason).toBe('unregistered_adapter');
  });

  // spec(§7) — the registry is closed/fixed at boot: both the descriptor registry and the impl map are
  // frozen, and there is no runtime register/add path (a mutation attempt throws in module strict mode).
  test('test_registry_is_closed_no_runtime_register', () => {
    expect(Object.isFrozen(CHECK_RUNNER_REGISTRY)).toBe(true);
    expect(Object.isFrozen(CHECK_RUNNER_IMPLS)).toBe(true);
    expect(() => {
      (CHECK_RUNNER_REGISTRY as Record<string, unknown>)['injected'] = { id: 'x', checkType: 'y' };
    }).toThrow();
  });

  // spec(§7) rule #3 — allowlist-bypass defense (lesson 11): an adversarial prototype-chain id falls
  // through to skip (own-property lookup inherited from the frozen gate), never borrowing a prototype member.
  test('test_proto_pollution_id_falls_through_to_skip', () => {
    for (const id of ['__proto__', 'constructor', 'toString']) {
      const resolved = resolveCheckAdapter(CHECK_RUNNER_REGISTRY, req(id));
      expect(CheckResult.safeParse(resolved).success).toBe(true);
      expect((resolved as CheckResult).status).toBe('skipped');
    }
    // sanity: the prepared toy adapter IS a registered descriptor (not a skip) with a registered impl.
    expect(
      'status' in resolveCheckAdapter(CHECK_RUNNER_REGISTRY, req(PREPARED_TOY_ADAPTER_ID)),
    ).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(CHECK_RUNNER_IMPLS, PREPARED_TOY_ADAPTER_ID)).toBe(
      true,
    );
  });
});
