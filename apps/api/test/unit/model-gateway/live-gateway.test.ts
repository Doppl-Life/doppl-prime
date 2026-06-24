import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import {
  createLiveGateway,
  createModelRegistry,
  createOpenRouterClient,
  type EmbeddingParams,
  type EmbeddingRawCompletion,
  type ModelRegistry,
  type OpenAIEmbeddingClient,
  type OpenRouterClient,
  type OpenRouterCompletionParams,
  type OpenRouterRawCompletion,
} from '../../../src/model-gateway';
import { DEFAULT_MODEL_REGISTRY } from '../../../src/config/model-registry.config';

/**
 * PD.9 — the live OpenRouter-backed ModelGateway (ARCHITECTURE.md §6, KEY SAFETY RULES #4/#8/#9).
 * `createLiveGateway({registry, client})` IS `createGateway` fed the P2.5 OpenRouter providerCall — the
 * validate/repair(≤1)/reject discipline is INHERITED, never re-implemented. All tests inject a fake
 * `OpenRouterClient` (no network, no real SDK call).
 */

const REGISTRY: ModelRegistry = createModelRegistry(DEFAULT_MODEL_REGISTRY);
const OK_SCHEMA = z.strictObject({ ok: z.boolean() });

/** A fake client that returns a fixed structured output + records the params it was called with. */
function clientReturning(
  output: unknown,
  opts: { spy?: (params: OpenRouterCompletionParams) => void } = {},
): OpenRouterClient {
  return {
    complete(params): Promise<OpenRouterRawCompletion> {
      opts.spy?.(params);
      return Promise.resolve({
        id: 'fake-req-1',
        model: params.model,
        output,
        tokensIn: 5,
        tokensOut: 7,
      });
    },
  };
}

/** A fake embedding client that returns a fixed vector + records the params it was called with. */
function embeddingClientReturning(
  vector: number[],
  opts: { spy?: (params: EmbeddingParams) => void } = {},
): OpenAIEmbeddingClient {
  return {
    embed(params): Promise<EmbeddingRawCompletion> {
      opts.spy?.(params);
      return Promise.resolve({
        requestId: 'fake-embed-req-1',
        model: params.model,
        vector,
        tokensIn: 3,
      });
    },
  };
}

describe('createLiveGateway — P2.5 adapter composed behind the port (spec §6, rules #4/#8/#9)', () => {
  // spec(§6) — happy path: a valid client response → accepted; the client was called with the route
  // resolved from registry.resolve(role) (the modelId for 'critic' = the registry's route).
  test('live_gateway_accepts_valid_structured_response', async () => {
    let seen: OpenRouterCompletionParams | undefined;
    const client = clientReturning({ ok: true }, { spy: (p) => (seen = p) });
    const gateway = createLiveGateway({ registry: REGISTRY, client });

    const res = await gateway.call({ role: 'critic', prompt: 'review this', schema: OK_SCHEMA });

    expect(res.accepted).toBe(true);
    expect(res.validationResult).toBe('accepted');
    expect(res.output).toEqual({ ok: true });
    expect(seen?.model).toBe(REGISTRY.resolve('critic').modelId); // route came from the registry
  });

  // spec(§6) + rule #8 — a terminal provider failure maps to a REJECTED response (not a throw); the
  // response carries ZERO-token providerMeta (no productive spend → no energy debit) and ModelGatewayResponse
  // has no energy field at all.
  test('live_gateway_maps_provider_error_to_rejected', async () => {
    const client: OpenRouterClient = { complete: () => Promise.reject(new Error('upstream 503')) };
    const gateway = createLiveGateway({
      registry: REGISTRY,
      client,
      maxRetries: 0,
      retry: { sleep: () => Promise.resolve() }, // deterministic + fast — no real backoff
    });

    const res = await gateway.call({ role: 'critic', prompt: 'x', schema: OK_SCHEMA });

    expect(res.accepted).toBe(false);
    expect(res.validationResult).toBe('rejected');
    expect(res.rejection).toBeDefined();
    expect(res.providerMeta.tokensIn).toBe(0); // rule #8 — no tokens on a failed call
    expect(res.providerMeta.tokensOut).toBe(0);
    expect('energy' in res).toBe(false); // structural: the response shape has no energy field
  });

  // spec(§6) — the validate/repair(≤1)/reject discipline is inherited: an invalid-then-valid client output
  // → exactly one repair → accepted as 'repaired'.
  test('live_gateway_runs_validate_repair_reject', async () => {
    let calls = 0;
    const client: OpenRouterClient = {
      complete(params): Promise<OpenRouterRawCompletion> {
        calls += 1;
        const output = calls === 1 ? { ok: 'not-a-boolean' } : { ok: true };
        return Promise.resolve({ id: 'r', model: params.model, output, tokensIn: 1, tokensOut: 1 });
      },
    };
    const gateway = createLiveGateway({ registry: REGISTRY, client });

    const res = await gateway.call({ role: 'critic', prompt: 'x', schema: OK_SCHEMA });

    expect(res.accepted).toBe(true);
    expect(res.validationResult).toBe('repaired');
    expect(calls).toBe(2); // exactly one repair (the hard ≤1 bound)
  });

  // rule #4 — the OpenRouter API key is env-only: createOpenRouterClient closes it over (no enumerable
  // surface property), and the live gateway's response carries no credential value anywhere.
  test('live_gateway_key_never_in_response', async () => {
    const SECRET = 'or-key-MUST-NOT-LEAK-7f3a';
    const realClient = createOpenRouterClient({ OPENROUTER_API_KEY: SECRET });
    expect(JSON.stringify(realClient)).not.toContain(SECRET); // key closed over, not exposed on the client

    const client = clientReturning({ ok: true });
    const res = await createLiveGateway({ registry: REGISTRY, client }).call({
      role: 'critic',
      prompt: 'x',
      schema: OK_SCHEMA,
    });
    expect(JSON.stringify(res)).not.toContain(SECRET); // no response/providerMeta field carries the key
  });

  // spec(§6) ROOT-CAUSE FIX — role dispatch: an `embedding`-role call routes to the OpenAI embedding
  // adapter (the injected `embeddingClient`), NOT to the OpenRouter chat-completions client. Before the
  // fix the live gateway built ONLY the OpenRouter providerCall, so every `role:'embedding'` call was
  // misrouted to OpenRouter's chat endpoint with an embedding model → always failed → novelty always
  // degraded. The adapter returns {vector, embeddingModelId, dimension}, which matches the embedding
  // role's no-schema path → accepted (never the silent degrade).
  test('live_gateway_dispatches_embedding_role_to_openai_adapter', async () => {
    let embedSeen: EmbeddingParams | undefined;
    let openRouterCalled = false;
    const embeddingClient = embeddingClientReturning([0.1, 0.2, 0.3], {
      spy: (p) => (embedSeen = p),
    });
    const client = clientReturning({ ok: true }, { spy: () => (openRouterCalled = true) });
    const gateway = createLiveGateway({ registry: REGISTRY, client, embeddingClient });

    const res = await gateway.call({ role: 'embedding', prompt: 'embed this summary' });

    expect(res.accepted).toBe(true);
    expect(res.output).toEqual({
      vector: [0.1, 0.2, 0.3],
      embeddingModelId: REGISTRY.resolve('embedding').modelId,
      dimension: 3,
    });
    // The EMBEDDING adapter was used (the OpenAI client saw the embedding route's model), and the
    // OpenRouter chat client was NOT touched on this call.
    expect(embedSeen?.model).toBe(REGISTRY.resolve('embedding').modelId);
    expect(embedSeen?.input).toBe('embed this summary');
    expect(openRouterCalled).toBe(false);
  });

  // spec(§6) ROOT-CAUSE FIX — a NON-embedding role still routes to OpenRouter (the dispatch must not
  // capture every role): a `critic` call hits the chat client, never the embedding client.
  test('live_gateway_non_embedding_role_still_routes_to_openrouter', async () => {
    let openRouterModel: string | undefined;
    let embeddingCalled = false;
    const client = clientReturning({ ok: true }, { spy: (p) => (openRouterModel = p.model) });
    const embeddingClient = embeddingClientReturning([0.9], {
      spy: () => (embeddingCalled = true),
    });
    const gateway = createLiveGateway({ registry: REGISTRY, client, embeddingClient });

    const res = await gateway.call({ role: 'critic', prompt: 'review', schema: OK_SCHEMA });

    expect(res.accepted).toBe(true);
    expect(openRouterModel).toBe(REGISTRY.resolve('critic').modelId);
    expect(embeddingCalled).toBe(false);
  });
});
