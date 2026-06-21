import { z } from 'zod';
import type { ZodType } from 'zod';
import OpenAI from 'openai';
import type {
  ChatRole,
  ModelGatewayRequest,
  ModelRole,
  ModelRoute,
  ProviderMeta,
} from '@doppl/contracts';
import type { ProviderCallFn, ProviderResult } from '../structured-output';
import { ProviderCallError } from '../gateway';
import type { ModelRegistry } from '../registry';
import { withRetry } from './retry';
import type { RetryDeps, RetryPolicy } from './retry';

/**
 * OpenRouter generation adapter (P2.5, ARCHITECTURE.md §6 / §14, KEY SAFETY RULES #9 + #8 + #4).
 *
 * The first vendor-SDK slice. Produces the `providerCall` (`ProviderCallFn`) that `createGateway`
 * injects: it reaches the OpenAI-compatible SDK ONLY behind the port — the vendor type never appears in
 * this module's EXPORTED surface (rule #9), confined to {@link createOpenRouterClient}. The call is
 * bounded by {@link withRetry} (default 2 retries + a per-role per-attempt timeout) with one
 * fallback-route attempt before a terminal `ProviderCallError`; failed attempts surface
 * `provider_call_failed{attempt,reason}` info and the adapter does NO energy accounting (rule #8). A
 * success returns `providerMeta` reflecting the ACTUAL provider/modelId/gatewayRequestId + token usage
 * for the kernel's post-call reconcile. Strict structured-output is requested where supported and the
 * RAW output is returned for P2.4's validate/repair/reject — the adapter does not validate.
 *
 * Credentials are env-only (rule #4): the OpenRouter key loads from injected env in
 * {@link createOpenRouterClient} and is closed over — never in code, logs, or any returned object.
 */

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_TIMEOUT_MS = 30_000;
const PROVIDER_CALL_FAILED_ID = 'provider_call_failed';

/** A single provider request shaped in CONTRACT terms (no vendor type) for the injected client seam. */
export interface OpenRouterCompletionParams {
  model: string;
  messages: { role: ChatRole; content: string }[];
  maxTokens?: number;
  responseFormat?: { name: string; strict: true; schema: unknown };
}

/** The normalized raw completion the client returns — `output` is unvalidated (P2.4 validates). */
export interface OpenRouterRawCompletion {
  id: string;
  model: string;
  output: unknown;
  tokensIn: number;
  tokensOut: number;
}

/**
 * The injected provider seam — OUR vendor-free interface. The real implementation
 * ({@link createOpenRouterClient}) wraps the OpenAI SDK; tests inject a fake. Rule #9: this interface
 * (not the SDK type) is what the adapter's surface exposes.
 */
export interface OpenRouterClient {
  complete(
    params: OpenRouterCompletionParams,
    opts: { timeoutMs: number },
  ): Promise<OpenRouterRawCompletion>;
}

export interface OpenRouterAdapterDeps {
  /** Role → route + capability resolution (P2.2). */
  registry: ModelRegistry;
  /** The provider seam (real {@link createOpenRouterClient} in production; a fake in tests). */
  client: OpenRouterClient;
  /** Retries after the first primary attempt; default 2 (passed through to {@link withRetry}). */
  maxRetries?: number;
  /** Per-role per-attempt timeout; default {@link DEFAULT_TIMEOUT_MS}. Not a contract field. */
  timeoutMsForRole?: (role: ModelRole) => number;
  /** Injected backoff + timeout seams for deterministic tests. */
  retry?: RetryDeps;
}

function isZodSchema(value: unknown): value is ZodType {
  return (
    typeof value === 'object' &&
    value !== null &&
    'safeParse' in value &&
    typeof (value as { safeParse: unknown }).safeParse === 'function'
  );
}

/** Build the contract-shaped request; request strict structured-output only when supported + schema'd. */
function buildParams(
  modelId: string,
  request: ModelGatewayRequest,
  structured: boolean,
): OpenRouterCompletionParams {
  const messages = request.messages
    ? request.messages.map((message) => ({ role: message.role, content: message.content }))
    : [{ role: 'user' as ChatRole, content: request.prompt ?? '' }];
  const params: OpenRouterCompletionParams = { model: modelId, messages };
  if (request.maxTokens !== undefined) {
    params.maxTokens = request.maxTokens;
  }
  if (structured && isZodSchema(request.schema)) {
    params.responseFormat = {
      name: `${request.role}_output`,
      strict: true,
      schema: z.toJSONSchema(request.schema),
    };
  }
  return params;
}

/**
 * Build the `providerCall` the gateway injects. On terminal failure (primary retries + one fallback all
 * fail) it throws {@link ProviderCallError}; `createGateway` catches it and maps it to a rejected
 * `ModelGatewayResponse` (the port contract — domain code never sees the throw).
 */
export function createOpenRouterProviderCall(deps: OpenRouterAdapterDeps): ProviderCallFn {
  const timeoutFor = deps.timeoutMsForRole ?? (() => DEFAULT_TIMEOUT_MS);

  return async (request: ModelGatewayRequest): Promise<ProviderResult> => {
    const route = deps.registry.resolve(request.role);
    const capability = deps.registry.capabilityFor(request.role);
    const timeoutMs = timeoutFor(request.role);
    const structured = capability.structuredOutputs && isZodSchema(request.schema);

    const attemptOn =
      (target: ModelRoute) =>
      async (): Promise<{ raw: OpenRouterRawCompletion; provider: string }> => {
        const raw = await deps.client.complete(buildParams(target.modelId, request, structured), {
          timeoutMs,
        });
        return { raw, provider: target.provider };
      };

    const fallbackId = route.fallbackRouteIds[0];
    // Resolve the fallback route LAZILY inside its attempt, so a resolution failure (e.g. a
    // misconfigured fallbackRouteId) is captured by `withRetry` as a bounded failed attempt →
    // `ProviderCallError`, never a raw throw escaping the provider-call's no-throw contract. (The
    // PRIMARY role is a typed `ModelRole` the registry must carry — its resolve is a precondition, not a
    // provider failure, so it stays eager + fails loud.)
    const fallbackAttempt =
      fallbackId !== undefined
        ? (): Promise<{ raw: OpenRouterRawCompletion; provider: string }> =>
            attemptOn(deps.registry.resolve(fallbackId as ModelRole))()
        : undefined;

    // Build the policy with only-defined props (exactOptionalPropertyTypes — never pass explicit
    // `undefined`); `withRetry` supplies its own defaults for the omitted ones.
    const policy: RetryPolicy<{ raw: OpenRouterRawCompletion; provider: string }> = { timeoutMs };
    if (deps.maxRetries !== undefined) policy.maxRetries = deps.maxRetries;
    if (fallbackAttempt) policy.fallback = fallbackAttempt;
    if (deps.retry?.sleep) policy.sleep = deps.retry.sleep;
    if (deps.retry?.timeoutSignal) policy.timeoutSignal = deps.retry.timeoutSignal;

    const outcome = await withRetry(attemptOn(route), policy);

    if (outcome.ok) {
      const { raw, provider } = outcome.value;
      const providerMeta: ProviderMeta = {
        provider,
        modelId: raw.model,
        gatewayRequestId: raw.id,
        tokensIn: raw.tokensIn,
        tokensOut: raw.tokensOut,
      };
      return { output: raw.output, providerMeta };
    }

    // Terminal failure: carry a route-derived providerMeta with ZERO tokens (no productive spend →
    // rule #8 no energy debit). gatewayRequestId is a sentinel — there was no successful provider call.
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

/** The minimal SDK chat-completion shape this adapter reads — OUR interface, not the vendor type. */
export interface SdkChatCompletionLike {
  id: string;
  model: string;
  choices: { message: { content: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text; // malformed structured output → P2.4's discipline rejects it; the adapter never throws
  }
}

/**
 * Map an SDK chat-completion to the contract-shaped raw completion: content → output (JSON-parsed when
 * structured output was requested, otherwise the raw string), provider id → gatewayRequestId source,
 * and prompt/completion tokens → tokensIn/tokensOut. Pure + vendor-free (testable without the SDK).
 */
export function mapSdkResponse(
  response: SdkChatCompletionLike,
  structured: boolean,
): OpenRouterRawCompletion {
  const content = response.choices[0]?.message?.content ?? '';
  return {
    id: response.id,
    model: response.model,
    output: structured ? safeJsonParse(content) : content,
    tokensIn: response.usage?.prompt_tokens ?? 0,
    tokensOut: response.usage?.completion_tokens ?? 0,
  };
}

/**
 * The real OpenRouter-backed client — the ONLY place the vendor SDK is imported (rule #9, behind the
 * port). The key loads from injected env (rule #4 / §14, lesson §27): a missing key fails fast naming
 * the VAR not the value, and a present key is closed over inside the SDK client — never returned.
 */
export function createOpenRouterClient(env: Record<string, string | undefined>): OpenRouterClient {
  const apiKey = env.OPENROUTER_API_KEY;
  if (apiKey === undefined || apiKey.trim() === '') {
    throw new Error(
      'OPENROUTER_API_KEY is required for the OpenRouter adapter (env-only, rule #4)',
    );
  }
  const sdk = new OpenAI({ apiKey, baseURL: OPENROUTER_BASE_URL, maxRetries: 0 });
  return {
    async complete(params, opts) {
      const response = await sdk.chat.completions.create(
        {
          model: params.model,
          messages: params.messages,
          ...(params.maxTokens !== undefined ? { max_tokens: params.maxTokens } : {}),
          ...(params.responseFormat
            ? {
                response_format: {
                  type: 'json_schema' as const,
                  json_schema: {
                    name: params.responseFormat.name,
                    strict: true,
                    schema: params.responseFormat.schema as Record<string, unknown>,
                  },
                },
              }
            : {}),
        },
        { timeout: opts.timeoutMs },
      );
      return mapSdkResponse(response, params.responseFormat !== undefined);
    },
  };
}
