// P0.11+P0.12 — §2.5 cross-track schema-snapshot gate for the gateway seam (§6). spec(§6) spec(§2.5):
// ModelRole(7) + ProviderCapability + ModelRoute + ModelGatewayRequest + ModelGatewayResponse field
// sets + ValidationResult(3) + ChatRole(3) each equal a frozen snapshot — a drift fails HERE before
// the model-gateway/runtime tracks consume the seam.
import { describe, it, expect } from 'vitest';
import {
  ModelRole,
  ProviderCapability,
  ModelRoute,
  ModelGatewayRequest,
  ModelGatewayResponse,
  ValidationResult,
  ChatRole,
  ProviderMeta,
} from '@doppl/contracts';

const MODEL_ROLE_SNAPSHOT = [
  'population_generator',
  'critic',
  'subtype_check',
  'embedding',
  'final_judge',
  'fusion_synthesis',
  'retrieval',
];

const PROVIDER_CAPABILITY_FIELD_SNAPSHOT = [
  'structuredOutputs',
  'embeddings',
  'toolCalling',
  'streaming',
];

const MODEL_ROUTE_FIELD_SNAPSHOT = [
  'role',
  'provider',
  'modelId',
  'capability',
  'fallbackRouteIds',
];

// frontend-v2 FB.4 (sv7→8): +samplingParams{temperature?} — the generation dial's executed sampling.
const GATEWAY_REQUEST_FIELD_SNAPSHOT = [
  'role',
  'prompt',
  'messages',
  'schema',
  'maxTokens',
  'samplingParams',
];

const GATEWAY_RESPONSE_FIELD_SNAPSHOT = [
  'accepted',
  'output',
  'validationResult',
  'providerMeta',
  'langfuseTraceId',
  'rejection',
];

const VALIDATION_RESULT_SNAPSHOT = ['accepted', 'repaired', 'rejected'];
const CHAT_ROLE_SNAPSHOT = ['system', 'user', 'assistant'];

const sorted = (a: readonly string[]): string[] => [...a].sort();

describe('schema snapshot — gateway seam (spec §6 / §2.5)', () => {
  it('barrel_exports_gateway_contracts', () => {
    // spec(§2.5): the 5 seam schemas + the validationResult enum re-export from one barrel; the
    // shared ProviderMeta (P0.9) still resolves from the barrel (reused, not redefined).
    expect(typeof ModelRole.parse).toBe('function');
    expect(typeof ProviderCapability.parse).toBe('function');
    expect(typeof ModelRoute.parse).toBe('function');
    expect(typeof ModelGatewayRequest.parse).toBe('function');
    expect(typeof ModelGatewayResponse.parse).toBe('function');
    expect(typeof ValidationResult.parse).toBe('function');
    expect(typeof ProviderMeta.parse).toBe('function');
  });

  it('schema_snapshot_gateway', () => {
    expect(sorted(ModelRole.options)).toEqual(sorted(MODEL_ROLE_SNAPSHOT));
    expect(sorted(Object.keys(ProviderCapability.shape))).toEqual(
      sorted(PROVIDER_CAPABILITY_FIELD_SNAPSHOT),
    );
    expect(sorted(Object.keys(ModelRoute.shape))).toEqual(sorted(MODEL_ROUTE_FIELD_SNAPSHOT));
    // Request + Response are strictObject+superRefine; zod v4 preserves `.shape`.
    expect(sorted(Object.keys(ModelGatewayRequest.shape))).toEqual(
      sorted(GATEWAY_REQUEST_FIELD_SNAPSHOT),
    );
    expect(sorted(Object.keys(ModelGatewayResponse.shape))).toEqual(
      sorted(GATEWAY_RESPONSE_FIELD_SNAPSHOT),
    );
    expect(sorted(ValidationResult.options)).toEqual(sorted(VALIDATION_RESULT_SNAPSHOT));
    expect(sorted(ChatRole.options)).toEqual(sorted(CHAT_ROLE_SNAPSHOT));

    expect(MODEL_ROLE_SNAPSHOT).toHaveLength(7);
    expect(PROVIDER_CAPABILITY_FIELD_SNAPSHOT).toHaveLength(4);
    expect(MODEL_ROUTE_FIELD_SNAPSHOT).toHaveLength(5);
    expect(GATEWAY_REQUEST_FIELD_SNAPSHOT).toHaveLength(6);
    expect(GATEWAY_RESPONSE_FIELD_SNAPSHOT).toHaveLength(6);
    expect(VALIDATION_RESULT_SNAPSHOT).toHaveLength(3);
    expect(CHAT_ROLE_SNAPSHOT).toHaveLength(3);
  });
});
