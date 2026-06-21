import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { ModelGatewayResponse, ProviderMeta } from '@doppl/contracts';
import type { ModelRole, ModelRoute, ProviderCapability } from '@doppl/contracts';
import type { ModelRegistry } from '../../../../src/model-gateway/registry';
import { ProviderCallError, createGateway } from '../../../../src/model-gateway/gateway';
import {
  createOpenAIEmbeddingClient,
  createOpenAIEmbeddingProviderCall,
  mapEmbeddingResponse,
} from '../../../../src/model-gateway/adapters/openai-embedding.adapter';
import type {
  EmbeddingResult,
  OpenAIEmbeddingClient,
} from '../../../../src/model-gateway/adapters/openai-embedding.adapter';
import type { RetryDeps } from '../../../../src/model-gateway/adapters/retry';

/**
 * P2.6 direct-OpenAI embedding adapter (ARCHITECTURE.md §6 / §14, KEY SAFETY RULES #9 + #8 + #4).
 *
 * The `embedding`-role `providerCall` for `text-embedding-3-small`: returns the raw float vector +
 * embeddingModelId + dimension (= vector length) for authoritative persistence by selection
 * (`novelty.scored`, frozen P0.8 — the adapter does NOT persist). Applies the lesson-28 adapter pattern:
 * SDK behind one client factory (no vendor type past the adapter, rule #9), reuses `retry.ts` (bounded
 * retry + per-role timeout, no energy on failure — rule #8), throws `ProviderCallError` on terminal
 * failure (the gateway maps it to rejected). SDK mocked via the injected `OpenAIEmbeddingClient` seam.
 */

const EMBED_ROLE: ModelRole = 'embedding';

const NO_WAIT: RetryDeps = {
  sleep: () => Promise.resolve(),
  timeoutSignal: () => new Promise<never>(() => {}),
};

function makeRegistry(opts?: { modelId?: string }): ModelRegistry {
  const capability: ProviderCapability = { structuredOutputs: false, embeddings: true };
  const route: ModelRoute = {
    role: EMBED_ROLE,
    provider: 'openai',
    modelId: opts?.modelId ?? 'text-embedding-3-small',
    capability,
    fallbackRouteIds: [],
  };
  return {
    resolve(role: ModelRole): ModelRoute {
      if (role !== EMBED_ROLE) throw new Error(`test registry has no route for ${role}`);
      return route;
    },
    capabilityFor(): ProviderCapability {
      return capability;
    },
  };
}

type Behavior =
  | { kind: 'success'; vector: number[]; model?: string; requestId?: string; tokensIn?: number }
  | { kind: 'error'; message: string };

interface RecordedCall {
  model: string;
  input: string;
  timeoutMs: number;
}

function makeClient(behaviors: Behavior[]): {
  client: OpenAIEmbeddingClient;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  let index = 0;
  const client: OpenAIEmbeddingClient = {
    embed(params, opts) {
      calls.push({ model: params.model, input: params.input, timeoutMs: opts.timeoutMs });
      const behavior = behaviors[Math.min(index, behaviors.length - 1)];
      index += 1;
      if (!behavior) throw new Error('test fake: no behavior configured');
      if (behavior.kind === 'success') {
        return Promise.resolve({
          requestId: behavior.requestId ?? 'emb-req-1',
          model: behavior.model ?? params.model,
          vector: behavior.vector,
          tokensIn: behavior.tokensIn ?? 8,
        });
      }
      return Promise.reject(new Error(behavior.message));
    },
  };
  return { client, calls };
}

const embedRequest = { role: EMBED_ROLE, prompt: 'candidate summary to embed' } as const;

describe('openai embedding adapter — vector + provenance (spec §6/§13)', () => {
  // spec(§6) — a successful embedding returns the float vector + embeddingModelId + dimension so the
  // caller persists the authoritative-once-computed value + its provenance (rule #7 / lesson §13).
  test('test_returns_vector_model_dimension', async () => {
    const vector = [0.1, -0.2, 0.3, 0.4];
    const { client } = makeClient([{ kind: 'success', vector, model: 'text-embedding-3-small' }]);
    const providerCall = createOpenAIEmbeddingProviderCall({
      registry: makeRegistry(),
      client,
      retry: NO_WAIT,
    });
    const result = await providerCall(embedRequest);
    const output = result.output as EmbeddingResult;
    expect(output.vector).toEqual(vector);
    expect(output.embeddingModelId).toBe('text-embedding-3-small');
    expect(output.dimension).toBe(4);
  });

  // spec(§9) — dimension is derived from the ACTUAL vector length, never a separate field, so a vector
  // can't be reinterpreted under a wrong dimension.
  test('test_dimension_equals_vector_length', async () => {
    const vector = [1, 2, 3, 4, 5, 6, 7];
    const { client } = makeClient([{ kind: 'success', vector }]);
    const providerCall = createOpenAIEmbeddingProviderCall({
      registry: makeRegistry(),
      client,
      retry: NO_WAIT,
    });
    const output = (await providerCall(embedRequest)).output as EmbeddingResult;
    expect(output.dimension).toBe(output.vector.length);
    expect(output.dimension).toBe(7);
  });

  // spec(§6) — providerMeta (provider/modelId/gatewayRequestId + tokens) is carried on success for the
  // kernel's reconcile; embeddings have no completion tokens → tokensOut 0.
  test('test_provider_meta_carried', async () => {
    const { client } = makeClient([
      { kind: 'success', vector: [0.5, 0.6], requestId: 'emb-req-42', tokensIn: 12 },
    ]);
    const providerCall = createOpenAIEmbeddingProviderCall({
      registry: makeRegistry(),
      client,
      retry: NO_WAIT,
    });
    const result = await providerCall(embedRequest);
    expect(ProviderMeta.safeParse(result.providerMeta).success).toBe(true);
    expect(result.providerMeta).toEqual({
      provider: 'openai',
      modelId: 'text-embedding-3-small',
      gatewayRequestId: 'emb-req-42',
      tokensIn: 12,
      tokensOut: 0,
    });
  });
});

describe('openai embedding adapter — bounded retry + terminal failure (lesson 28 / §6/§8)', () => {
  // spec(§6) — reuses retry.ts: a transient failure is retried and the next attempt succeeds, within
  // the default bound (1 + 2 retries).
  test('test_bounded_retry_then_success', async () => {
    const { client, calls } = makeClient([
      { kind: 'error', message: 'transient 503' },
      { kind: 'success', vector: [0.1, 0.2] },
    ]);
    const providerCall = createOpenAIEmbeddingProviderCall({
      registry: makeRegistry(),
      client,
      retry: NO_WAIT,
    });
    const output = (await providerCall(embedRequest)).output as EmbeddingResult;
    expect(output.vector).toEqual([0.1, 0.2]);
    expect(calls.length).toBe(2); // initial + one retry
    expect(calls.every((c) => c.input === 'candidate summary to embed')).toBe(true);
  });

  // spec(§8) lesson 28 — all attempts fail → the adapter throws ProviderCallError (no energy field on
  // the failures); through the gateway it becomes a rejected response with NO throw escaping.
  test('test_terminal_failure_throws_provider_call_error', async () => {
    const { client } = makeClient([{ kind: 'error', message: 'embeddings down' }]);
    const registry = makeRegistry();
    const providerCall = createOpenAIEmbeddingProviderCall({ registry, client, retry: NO_WAIT });

    const error = (await providerCall(embedRequest).catch((e: unknown) => e)) as ProviderCallError;
    expect(error).toBeInstanceOf(ProviderCallError);
    expect(error.failures.length).toBe(3); // 1 + 2 retries, no fallback route for embeddings
    const serialized = JSON.stringify({
      failures: error.failures,
      providerMeta: error.providerMeta,
    });
    expect(serialized.toLowerCase()).not.toContain('energy');

    const gateway = createGateway({
      providerCall,
      capabilityFor: (role) => registry.capabilityFor(role),
    });
    const response = await gateway.call(embedRequest);
    expect(response.accepted).toBe(false);
    expect(response.validationResult).toBe('rejected');
    expect(ProviderMeta.safeParse(response.providerMeta).success).toBe(true);
    expect(ModelGatewayResponse.safeParse(response).success).toBe(true);
  });

  // spec(§6) — the no-schema embedding path through createGateway returns the EmbeddingResult as the
  // response output (no validate/repair); the degrade is selection's concern, not blocked here.
  test('test_gateway_no_schema_path_returns_vector', async () => {
    const registry = makeRegistry();
    const { client } = makeClient([{ kind: 'success', vector: [0.9, 0.8, 0.7] }]);
    const providerCall = createOpenAIEmbeddingProviderCall({ registry, client, retry: NO_WAIT });
    const gateway = createGateway({
      providerCall,
      capabilityFor: (role) => registry.capabilityFor(role),
    });
    const response = await gateway.call(embedRequest);
    expect(response.accepted).toBe(true);
    expect(response.validationResult).toBe('accepted');
    const output = response.output as EmbeddingResult;
    expect(output.vector).toEqual([0.9, 0.8, 0.7]);
    expect(output.dimension).toBe(3);
  });
});

describe('openai embedding adapter — rule #9 (SDK boundary) + rule #4 (creds env-only)', () => {
  // spec(§14) rule #9 — the vendor SDK type never appears in the adapter's EXPORTED surface; the SDK is
  // imported exactly once (in the client factory). Grep-style source assertion.
  test('test_no_vendor_type_in_adapter_surface', () => {
    const adapterPath = fileURLToPath(
      new URL(
        '../../../../src/model-gateway/adapters/openai-embedding.adapter.ts',
        import.meta.url,
      ),
    );
    const source = readFileSync(adapterPath, 'utf8');
    const exportLines = source.split('\n').filter((line) => /^\s*export\b/.test(line));
    expect(exportLines.some((line) => /\bOpenAI\b/.test(line))).toBe(false);
    expect((source.match(/from ['"]openai['"]/g) ?? []).length).toBe(1);
  });

  // spec(§14) rule #4 — the OpenAI key loads ONLY from injected env (OPENAI_API_KEY); missing → fail
  // fast naming the VAR not the value; a present key is closed over, never exposed on the returned
  // client surface (no credential field).
  test('test_credentials_env_only', () => {
    expect(() => createOpenAIEmbeddingClient({})).toThrow(/OPENAI_API_KEY/);
    let captured: Error | undefined;
    try {
      createOpenAIEmbeddingClient({ OPENAI_API_KEY: '   ' });
    } catch (e) {
      captured = e as Error;
    }
    expect(captured?.message).toMatch(/OPENAI_API_KEY/);
    expect(captured?.message ?? '').not.toContain('   ');

    const client = createOpenAIEmbeddingClient({ OPENAI_API_KEY: 'sk-secret-embed-999' });
    expect(Object.keys(client)).toEqual(['embed']);
    expect(JSON.stringify(client)).not.toContain('sk-secret-embed-999');
  });
});

describe('openai embedding adapter — vendor response mapping (spec §6)', () => {
  // spec(§6) — mapEmbeddingResponse extracts data[0].embedding → vector, model → model, prompt_tokens →
  // tokensIn, and carries the provided requestId. Pure + vendor-free (testable without the SDK).
  test('test_map_embedding_response_extracts_vector_and_tokens', () => {
    const raw = mapEmbeddingResponse(
      {
        data: [{ embedding: [0.11, 0.22, 0.33] }],
        model: 'text-embedding-3-small',
        usage: { prompt_tokens: 9, total_tokens: 9 },
      },
      'req-from-header',
    );
    expect(raw).toEqual({
      requestId: 'req-from-header',
      model: 'text-embedding-3-small',
      vector: [0.11, 0.22, 0.33],
      tokensIn: 9,
    });
  });

  // spec(§6) — an absent OR blank x-request-id falls back to a non-empty sentinel so gatewayRequestId
  // always satisfies ProviderMeta's string.min(1) (nullish coalescing alone would let '' through).
  test('test_map_embedding_response_request_id_sentinel', () => {
    const response = {
      data: [{ embedding: [0.1] }],
      model: 'text-embedding-3-small',
      usage: { prompt_tokens: 1, total_tokens: 1 },
    };
    for (const rawId of [undefined, null, '', '   '] as const) {
      const raw = mapEmbeddingResponse(response, rawId);
      expect(raw.requestId.length).toBeGreaterThan(0);
      expect(raw.requestId).toBe('openai-embedding');
    }
    expect(mapEmbeddingResponse(response, 'real-id').requestId).toBe('real-id');
  });
});
