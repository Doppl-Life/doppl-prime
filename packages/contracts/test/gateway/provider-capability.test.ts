// P0.11 — ProviderCapability: the MVP-lean capability matrix (ARCHITECTURE.md §6). spec(§6):
// structuredOutputs + embeddings are the REQUIRED day-one gate flags; toolCalling/streaming are
// OPTIONAL (added later). Strict booleans.
import { describe, it, expect } from 'vitest';
import { ProviderCapability } from '@doppl/contracts';

const validCapability = {
  structuredOutputs: true,
  embeddings: false,
  toolCalling: false,
  streaming: false,
};

describe('ProviderCapability — capability matrix (spec §6)', () => {
  it('provider_capability_strict', () => {
    // positive guard first (lesson §10): full capability round-trips; the 2 optionals omittable.
    expect(ProviderCapability.parse(validCapability)).toEqual(validCapability);
    const minimal = { structuredOutputs: true, embeddings: true };
    expect(ProviderCapability.parse(minimal)).toEqual(minimal);
    // structuredOutputs + embeddings are REQUIRED.
    for (const k of ['structuredOutputs', 'embeddings'] as const) {
      const clone: Record<string, unknown> = { ...validCapability };
      delete clone[k];
      expect(() => ProviderCapability.parse(clone), `missing ${k}`).toThrow();
    }
    // booleans only; unknown field rejected.
    expect(() =>
      ProviderCapability.parse({ ...validCapability, structuredOutputs: 'yes' }),
    ).toThrow();
    expect(() => ProviderCapability.parse({ ...validCapability, toolCalling: 1 })).toThrow();
    expect(() => ProviderCapability.parse({ ...validCapability, bogus: true })).toThrow();
  });
});
