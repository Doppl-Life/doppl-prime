import { describe, expect, test } from 'vitest';
import { ModelGatewayResponse, ProviderMeta } from '@doppl/contracts';
import type { ModelRole } from '@doppl/contracts';
import { createFakeGateway, selectGateway } from '../../../../src/model-gateway/stub/fake-gateway';
import {
  STUB_EMBEDDING_DIMENSION,
  STUB_EMBEDDING_MODEL_ID,
} from '../../../../src/model-gateway/stub/fixtures';

/**
 * P2.9 recorded/fake gateway stub. Deterministic per-role responses produced by feeding a fake
 * providerCall into the REAL createGateway (P2.4), so the stub exercises the genuine accept/repair/
 * reject discipline without live providers. Completes the gateway chain (P2.1 -> P2.4 -> P2.9).
 */

const ALL_ROLES: ModelRole[] = [
  'population_generator',
  'critic',
  'subtype_check',
  'embedding',
  'final_judge',
  'fusion_synthesis',
  'retrieval',
];

describe('createFakeGateway — deterministic fake of the ModelGateway seam', () => {
  // spec(§6) — a deterministic, schema-valid fake of the port for every role.
  test('test_stub_implements_port_valid_per_role', async () => {
    const gateway = createFakeGateway();
    for (const role of ALL_ROLES) {
      const res = await gateway.call({ role, prompt: 'stub request' });
      expect(ModelGatewayResponse.safeParse(res).success, role).toBe(true);
      expect(res.accepted, role).toBe(true);
      expect(res.validationResult, role).toBe('accepted');
      expect(res.output, role).toBeDefined();
    }
  });

  // spec(§6) — deterministic embedding vector (+ embeddingModelId + dimension, length === dimension).
  test('test_embedding_role_returns_deterministic_vector', async () => {
    const gateway = createFakeGateway();
    const res1 = await gateway.call({ role: 'embedding', prompt: 'x' });
    const res2 = await gateway.call({ role: 'embedding', prompt: 'x' });
    const out = res1.output as { vector: number[]; embeddingModelId: string; dimension: number };
    expect(out.embeddingModelId).toBe(STUB_EMBEDDING_MODEL_ID);
    expect(out.dimension).toBe(STUB_EMBEDDING_DIMENSION);
    expect(out.vector.length).toBe(out.dimension);
    expect(res2.output).toEqual(res1.output);
  });

  // spec(§6) — curated retrieval result tagged fallback-sourced.
  test('test_retrieval_role_returns_curated_result', async () => {
    const gateway = createFakeGateway();
    const res = await gateway.call({ role: 'retrieval', prompt: 'x' });
    const out = res.output as {
      results: Array<{ text: string; source: string; fallbackSourced: boolean }>;
    };
    expect(out.results.length).toBeGreaterThan(0);
    expect(out.results[0]?.fallbackSourced).toBe(true);
  });

  // spec(§6) — configured repairable → the REAL discipline runs one repair on the stub's first-invalid.
  test('test_repairable_config_drives_one_repair', async () => {
    const gateway = createFakeGateway({ mode: 'repairable' });
    const res = await gateway.call({ role: 'critic', prompt: 'x' });
    expect(res.validationResult).toBe('repaired');
    expect(res.accepted).toBe(true);
  });

  // spec(§6) — configured reject → the discipline rejects (output stays invalid).
  test('test_reject_config_drives_rejection', async () => {
    const gateway = createFakeGateway({ mode: 'reject' });
    const res = await gateway.call({ role: 'critic', prompt: 'x' });
    expect(res.accepted).toBe(false);
    expect(res.validationResult).toBe('rejected');
    expect(res.rejection?.reason.length ?? 0).toBeGreaterThan(0);
  });

  // replay — same config + same request → deep-equal response (no nondeterminism).
  test('test_deterministic_same_config_same_response', async () => {
    const r1 = await createFakeGateway().call({ role: 'population_generator', prompt: 'same' });
    const r2 = await createFakeGateway().call({ role: 'population_generator', prompt: 'same' });
    expect(r2).toEqual(r1);
  });

  // rule #8 (no energy representation) + rule #9 (no vendor SDK, structural) — providerMeta on every
  // response; no energy-bearing field. (The no-SDK import purity is grep-verified at Step 8.)
  test('test_no_vendor_sdk_no_energy_field', async () => {
    const accepted = await createFakeGateway().call({ role: 'critic', prompt: 'x' });
    const rejected = await createFakeGateway({ mode: 'reject' }).call({
      role: 'critic',
      prompt: 'x',
    });
    for (const res of [accepted, rejected]) {
      expect(ProviderMeta.safeParse(res.providerMeta).success).toBe(true);
      expect('energy' in res).toBe(false);
      expect('energySpent' in res).toBe(false);
    }
  });

  // acceptance — selectable via config (env/file -> config resolution is the boot caller's job).
  test('test_select_gateway_returns_stub_when_configured', async () => {
    const gateway = selectGateway({ useStub: true });
    const res = await gateway.call({ role: 'critic', prompt: 'x' });
    expect(res.accepted).toBe(true);
    expect(() => selectGateway({ useStub: false })).toThrow();
  });
});
