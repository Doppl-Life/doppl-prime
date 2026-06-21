import { describe, expect, test } from 'vitest';
import {
  CANONICAL_FIXTURES,
  validModelGatewayRequest,
  validModelGatewayResponse,
  validProviderCapability,
} from '@doppl/contracts';
// The seam is consumed through the apps/api barrel (the one internal import surface), exercising
// its re-exports — runtime/verifier will import the port + wire contracts from exactly here.
import {
  ModelGatewayRequest,
  ModelGatewayResponse,
  ProviderCapability,
} from '../../../src/model-gateway';
import type { ModelGateway, ModelRole } from '../../../src/model-gateway';

/**
 * P2.1 ModelGateway port-conformance. A minimal in-test fake implements the port; parsing its I/O
 * with the frozen §6 schemas pins the seam's request/response/capability types to the contracts, and
 * binding each fixture to the P0.14 CANONICAL_FIXTURES registry makes a frozen-shape drift break loudly.
 * The `implements ModelGateway` clause is the compile-time pin that the port shape is the contracts.
 */
class FakeGateway implements ModelGateway {
  async call(request: ModelGatewayRequest): Promise<ModelGatewayResponse> {
    void request; // role-in-request routing; the fake ignores it and echoes the canonical response
    return validModelGatewayResponse;
  }

  capabilityFor(role: ModelRole): ProviderCapability {
    void role; // registry-backed lookup lands in P2.2; the fake returns the canonical capability
    return validProviderCapability;
  }
}

describe('ModelGateway port conforms to the frozen §6 wire contracts', () => {
  const fake: ModelGateway = new FakeGateway();

  // The value P0.14 registers under a fixture name — binds these tests to the CANONICAL_FIXTURES surface.
  const canonicalValue = (name: string): unknown => {
    const entry = CANONICAL_FIXTURES.find((f) => f.name === name);
    expect(entry, `CANONICAL_FIXTURES missing ${name}`).toBeDefined();
    return entry?.value;
  };

  // spec(§6) — the port's return type IS the frozen ModelGatewayResponse.
  test('test_port_call_returns_contract_response', async () => {
    const response = await fake.call(validModelGatewayRequest);
    expect(ModelGatewayResponse.safeParse(response).success).toBe(true);
    expect(response).toBe(canonicalValue('ModelGatewayResponse'));
  });

  // spec(§6) — the port's call signature accepts the frozen ModelGatewayRequest (compile-time: passed
  // without a cast) and that request validates against the frozen schema.
  test('test_port_accepts_contract_request', async () => {
    expect(ModelGatewayRequest.safeParse(validModelGatewayRequest).success).toBe(true);
    expect(validModelGatewayRequest).toBe(canonicalValue('ModelGatewayRequest'));
    await expect(fake.call(validModelGatewayRequest)).resolves.toBeDefined();
  });

  // spec(§6) — per-role capability is exposed through the port as a frozen ProviderCapability, so
  // domain code branches on capability flags, never on a provider.
  test('test_capability_lookup_returns_provider_capability', () => {
    const capability = fake.capabilityFor('embedding');
    expect(ProviderCapability.safeParse(capability).success).toBe(true);
    expect(capability).toBe(canonicalValue('ProviderCapability'));
  });
});
