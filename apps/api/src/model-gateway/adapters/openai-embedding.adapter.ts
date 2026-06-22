import OpenAI from 'openai';
import type { ModelGatewayRequest, ModelRole, ModelRoute, ProviderMeta } from '@doppl/contracts';
import type { ProviderCallFn, ProviderResult } from '../structured-output';
import { ProviderCallError } from '../gateway';
import type { ModelRegistry } from '../registry';
import { withRetry } from './retry';
import type { RetryDeps, RetryPolicy } from './retry';

/**
 * Direct-OpenAI embedding adapter (P2.6, ARCHITECTURE.md §6 / §14, KEY SAFETY RULES #9 + #8 + #4).
 *
 * Applies the lesson-28 provider-adapter pattern. The `embedding`-role `providerCall` calls
 * `text-embedding-3-small` (pinned to direct OpenAI, §6) and returns `{vector, embeddingModelId,
 * dimension}` so the caller (selection-scoring) persists the authoritative-once-computed vector + its
 * provenance in `novelty.scored` (rule #7 / lesson §13) — the adapter does NOT persist. The OpenAI SDK
 * is confined to {@link createOpenAIEmbeddingClient} (no vendor type in the exported surface — rule #9);
 * the call reuses {@link withRetry} (bounded retry + per-role timeout, no energy accounting — rule #8);
 * a terminal failure throws `ProviderCallError`, which `createGateway` maps to a rejected response. The
 * embedding role carries no output schema → the gateway's no-schema path returns the vector as-is. The
 * key loads from injected env only (rule #4).
 */

const DEFAULT_TIMEOUT_MS = 30_000;
const PROVIDER_CALL_FAILED_ID = 'provider_call_failed';
// Embeddings responses carry no body id; correlation falls back to this when the x-request-id header
// is absent (gatewayRequestId is a required, non-empty field).
const NO_REQUEST_ID = 'openai-embedding';

/** The embedding result the caller persists authoritatively (`novelty.scored`, frozen P0.8). */
export interface EmbeddingResult {
  vector: number[];
  embeddingModelId: string;
  dimension: number;
}

/** One embedding request shaped in CONTRACT terms (no vendor type) for the injected client seam. */
export interface EmbeddingParams {
  model: string;
  input: string;
}

/** The normalized raw embedding the client returns. */
export interface EmbeddingRawCompletion {
  requestId: string;
  model: string;
  vector: number[];
  tokensIn: number;
}

/**
 * The injected provider seam — OUR vendor-free interface. The real implementation
 * ({@link createOpenAIEmbeddingClient}) wraps the OpenAI SDK; tests inject a fake (rule #9).
 */
export interface OpenAIEmbeddingClient {
  embed(params: EmbeddingParams, opts: { timeoutMs: number }): Promise<EmbeddingRawCompletion>;
}

export interface OpenAIEmbeddingAdapterDeps {
  /** Role → route resolution (P2.2); the embedding route is pinned to OpenAI text-embedding-3-small. */
  registry: ModelRegistry;
  /** The provider seam (real {@link createOpenAIEmbeddingClient} in production; a fake in tests). */
  client: OpenAIEmbeddingClient;
  /** Retries after the first attempt; default 2 (passed through to {@link withRetry}). */
  maxRetries?: number;
  /** Per-role per-attempt timeout; default {@link DEFAULT_TIMEOUT_MS}. Not a contract field. */
  timeoutMsForRole?: (role: ModelRole) => number;
  /** Injected backoff + timeout seams for deterministic tests. */
  retry?: RetryDeps;
}

/**
 * Build the embedding `providerCall` the gateway injects. On terminal failure (bounded retries + any
 * fallback route all fail) it throws {@link ProviderCallError}; `createGateway` maps it to a rejected
 * `ModelGatewayResponse` (the port contract — domain code never sees the throw).
 */
export function createOpenAIEmbeddingProviderCall(
  deps: OpenAIEmbeddingAdapterDeps,
): ProviderCallFn {
  const timeoutFor = deps.timeoutMsForRole ?? (() => DEFAULT_TIMEOUT_MS);

  return async (request: ModelGatewayRequest): Promise<ProviderResult> => {
    const route = deps.registry.resolve(request.role);
    const timeoutMs = timeoutFor(request.role);
    const input = request.prompt ?? request.messages?.map((m) => m.content).join('\n') ?? '';

    const attemptOn =
      (target: ModelRoute) =>
      async (): Promise<{ raw: EmbeddingRawCompletion; provider: string }> => {
        const raw = await deps.client.embed({ model: target.modelId, input }, { timeoutMs });
        return { raw, provider: target.provider };
      };

    // Resolve any fallback route LAZILY inside its attempt (a resolution failure → bounded failed
    // attempt → ProviderCallError, never an escaping throw — lesson 28). Embeddings have no fallback in
    // MVP (empty fallbackRouteIds), so this is a no-op unless a route configures one.
    const fallbackId = route.fallbackRouteIds[0];
    const fallbackAttempt =
      fallbackId !== undefined
        ? (): Promise<{ raw: EmbeddingRawCompletion; provider: string }> =>
            attemptOn(deps.registry.resolve(fallbackId as ModelRole))()
        : undefined;

    const policy: RetryPolicy<{ raw: EmbeddingRawCompletion; provider: string }> = { timeoutMs };
    if (deps.maxRetries !== undefined) policy.maxRetries = deps.maxRetries;
    if (fallbackAttempt) policy.fallback = fallbackAttempt;
    if (deps.retry?.sleep) policy.sleep = deps.retry.sleep;
    if (deps.retry?.timeoutSignal) policy.timeoutSignal = deps.retry.timeoutSignal;

    const outcome = await withRetry(attemptOn(route), policy);

    if (outcome.ok) {
      const { raw, provider } = outcome.value;
      // dimension is the ACTUAL vector length (never a separate field) so a vector can't be
      // reinterpreted under a wrong dimension; embeddingModelId is the model that actually produced it.
      const result: EmbeddingResult = {
        vector: raw.vector,
        embeddingModelId: raw.model,
        dimension: raw.vector.length,
      };
      const providerMeta: ProviderMeta = {
        provider,
        modelId: raw.model,
        gatewayRequestId: raw.requestId,
        tokensIn: raw.tokensIn,
        tokensOut: 0, // embeddings have no completion tokens
      };
      return { output: result, providerMeta };
    }

    // Terminal failure: zero-token route-derived providerMeta (no productive spend → rule #8).
    const providerMeta: ProviderMeta = {
      provider: route.provider,
      modelId: route.modelId,
      gatewayRequestId: PROVIDER_CALL_FAILED_ID,
      tokensIn: 0,
      tokensOut: 0,
    };
    throw new ProviderCallError(outcome.failures, providerMeta);
  };
}

/** The minimal SDK embedding response shape this adapter reads — OUR interface, not the vendor type. */
export interface SdkEmbeddingResponseLike {
  data: { embedding: number[] }[];
  model: string;
  usage?: { prompt_tokens?: number; total_tokens?: number } | null;
}

/**
 * Map an SDK embeddings response to the contract-shaped raw completion: data[0].embedding → vector,
 * model → model, prompt_tokens → tokensIn. Resolves the request id from the SDK `x-request-id` header
 * value (`rawRequestId`), falling back to a non-empty sentinel when it is absent OR blank — so
 * `gatewayRequestId` always satisfies `ProviderMeta`'s `string.min(1)`. Pure + vendor-free (testable
 * without the SDK).
 */
export function mapEmbeddingResponse(
  response: SdkEmbeddingResponseLike,
  rawRequestId: string | null | undefined,
): EmbeddingRawCompletion {
  const requestId =
    rawRequestId !== null && rawRequestId !== undefined && rawRequestId.trim().length > 0
      ? rawRequestId
      : NO_REQUEST_ID;
  return {
    requestId,
    model: response.model,
    vector: response.data[0]?.embedding ?? [],
    tokensIn: response.usage?.prompt_tokens ?? 0,
  };
}

/**
 * The real OpenAI-backed embedding client — the ONLY place the vendor SDK is imported (rule #9, behind
 * the port). The key loads from injected env (rule #4 / §14, lesson §27): a missing key fails fast
 * naming the VAR not the value, and a present key is closed over inside the SDK client — never returned.
 */
export function createOpenAIEmbeddingClient(
  env: Record<string, string | undefined>,
): OpenAIEmbeddingClient {
  const apiKey = env.OPENAI_API_KEY;
  if (apiKey === undefined || apiKey.trim() === '') {
    throw new Error(
      'OPENAI_API_KEY is required for the OpenAI embedding adapter (env-only, rule #4)',
    );
  }
  const sdk = new OpenAI({ apiKey, maxRetries: 0 });
  return {
    async embed(params, opts) {
      const response = await sdk.embeddings.create(
        { model: params.model, input: params.input, encoding_format: 'float' },
        { timeout: opts.timeoutMs },
      );
      const rawRequestId = (response as { _request_id?: string | null })._request_id;
      return mapEmbeddingResponse(response, rawRequestId);
    },
  };
}
