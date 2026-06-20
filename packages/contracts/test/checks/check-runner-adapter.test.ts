// P0.7 — CheckRunnerAdapter + the allowlist gate (ARCHITECTURE.md §7 line 270, REQ-S-003).
// SAFETY slice, key rule #3: NO arbitrary code execution. Two structural pins: (1) the adapter is
// NON-EXECUTING BY SHAPE — z.strictObject makes any code-carrying field unrepresentable (lesson §9);
// (2) resolveCheckAdapter is a pure allowlist gate that fails SAFE to `skipped` on an unregistered
// id (never executes, never throws — the rule-#3 fail-safe, lesson §8 single-source primitive).
import { describe, it, expect } from 'vitest';
import { CheckRunnerAdapter, resolveCheckAdapter, CheckResult } from '@doppl/contracts';

// typed so the closed `subtype` literal isn't widened to `string` when built into a registry below.
const validAdapter: CheckRunnerAdapter = {
  id: 'adp_citation',
  checkType: 'citation_resolves',
  subtype: 'cross_domain_transfer',
  label: 'Citation resolver',
};

const ADAPTER_REQUIRED = ['id', 'checkType'] as const;

describe('CheckRunnerAdapter — non-executing allowlist descriptor (spec §7, rule #3)', () => {
  it('check_runner_adapter_rejects_code_field', () => {
    // spec(§7/§14, rule #3 / REQ-S-003): non-executing BY SHAPE — a code-carrying field is
    // unrepresentable. Positive guard first (lesson §10): the valid descriptor parses, so the
    // rejections below fire because strictObject rejects the extra field, not a missing export.
    expect(CheckRunnerAdapter.parse(validAdapter)).toEqual(validAdapter);
    for (const codeField of ['exec', 'command', 'handler', 'fn', 'script', 'code']) {
      expect(
        () => CheckRunnerAdapter.parse({ ...validAdapter, [codeField]: 'rm -rf /' }),
        `code field ${codeField}`,
      ).toThrow();
    }
  });

  it('check_runner_adapter_fields_strict', () => {
    // spec(§7): the exact descriptor field set; subtype?/label? omittable; required mandatory;
    // unknown rejected; subtype is the closed P0.3 Subtype union.
    const minimal = { id: 'adp_2', checkType: 'feasible' };
    expect(CheckRunnerAdapter.parse(minimal)).toEqual(minimal);
    expect(() => CheckRunnerAdapter.parse({ ...validAdapter, subtype: 'not_a_subtype' })).toThrow();
    for (const k of ADAPTER_REQUIRED) {
      const clone: Record<string, unknown> = { ...validAdapter };
      delete clone[k];
      expect(() => CheckRunnerAdapter.parse(clone), `missing ${k}`).toThrow();
    }
    expect(() => CheckRunnerAdapter.parse({ ...validAdapter, id: '' })).toThrow();
    expect(ADAPTER_REQUIRED).toHaveLength(2);
  });

  it('resolve_check_adapter_allowlist_gate', () => {
    // spec(§7, rule #3): the allowlist fail-safe. A registered id resolves to its adapter; an
    // unregistered id returns a `skipped` CheckResult with a non-empty skipReason — NEVER executes,
    // NEVER throws. The gate selects/rejects by id only.
    const registry = { [validAdapter.id]: validAdapter };
    const reqBase = { resultId: 'chk_9', candidateId: 'cand_9', checkType: 'citation_resolves' };

    const hit = resolveCheckAdapter(registry, { ...reqBase, adapterId: validAdapter.id });
    expect(hit).toEqual(validAdapter);
    expect('status' in hit).toBe(false); // an adapter, not a CheckResult

    const miss = resolveCheckAdapter(registry, { ...reqBase, adapterId: 'unregistered_xyz' });
    expect('status' in miss).toBe(true);
    // the fail-safe ALWAYS emits a SCHEMA-VALID skipped CheckResult (regression pin — if a future
    // change makes the gate emit a malformed skip, e.g. drops evidenceRefs, every consumer's
    // allowlist rejection silently breaks). Parse it through the real schema, don't just field-poke.
    const parsedMiss = CheckResult.parse(miss);
    expect(parsedMiss.status).toBe('skipped');
    expect(parsedMiss.skipReason && parsedMiss.skipReason.length).toBeGreaterThan(0);

    // never throws on an unknown id.
    expect(() => resolveCheckAdapter(registry, { ...reqBase, adapterId: 'nope' })).not.toThrow();

    // ADVERSARIAL (rule #3 fail-safe): a prototype-chain id must NOT resolve to Object.prototype —
    // it is treated as unregistered → skipped (own-property lookup, not the prototype chain).
    for (const evil of ['__proto__', 'constructor', 'toString']) {
      const r = resolveCheckAdapter(registry, { ...reqBase, adapterId: evil });
      expect('status' in r, `evil id ${evil} must skip`).toBe(true);
      if ('status' in r) expect(r.status).toBe('skipped');
    }
  });
});
