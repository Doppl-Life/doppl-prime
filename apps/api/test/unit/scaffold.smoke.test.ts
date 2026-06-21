import { describe, expect, test } from 'vitest';
import { CURRENT_SCHEMA_VERSION, RunEventEnvelope, validRunEventEnvelope } from '@doppl/contracts';

/**
 * P1.1 adopt smoke test — proves the frozen @doppl/contracts seam is consumable from apps/api.
 * This slice ADOPTS the contracts; it does not redefine any Appendix-A model.
 */
describe('apps/api adopts @doppl/contracts (scaffold smoke)', () => {
  // spec(§4) — workspace package seam + Vitest alias + tsconfig module resolution work end-to-end.
  // Version is NOT pinned to a literal: it is allowed to bump, so the smoke test asserts >= 1 only.
  test('test_contracts_workspace_seam_resolves', () => {
    expect(typeof CURRENT_SCHEMA_VERSION).toBe('number');
    expect(CURRENT_SCHEMA_VERSION).toBeGreaterThanOrEqual(1);
  });

  // spec(§4) — an adopted §4 event-model contract validates at runtime (not merely type-resolves)
  // from the consuming package, confirming the freeze is truly consumable downstream.
  test('test_adopted_contract_schema_parses', () => {
    const result = RunEventEnvelope.safeParse(validRunEventEnvelope);
    expect(result.success).toBe(true);
  });
});
