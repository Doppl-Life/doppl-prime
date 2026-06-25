import { z } from 'zod';
import type { ZodType } from 'zod';
import type { ModelGatewayRequest, ModelRole, ModelRoute, ProviderMeta } from '@doppl/contracts';
import type { ProviderCallFn, ProviderResult } from '../structured-output';
import { ProviderCallError } from '../gateway';
import type { ModelRegistry } from '../registry';
import { toProviderMessages, type ProviderChatMessage } from './message-mapping';
import { withRetry } from './retry';
import type { RetryDeps, RetryPolicy } from './retry';

/**
 * Local-provider (ollama) generation adapter (FB.1, ARCHITECTURE.md §6 / §5, KEY SAFETY RULES #9 + #8 +
 * #4 + #5). The first LOCAL provider behind the gateway — the runtime honoring of FB.0's contract.
 *
 * Mirrors the OpenRouter adapter exactly: it produces the `providerCall` (`ProviderCallFn`) the gateway
 * injects, reaches the provider ONLY behind the {@link OllamaClient} seam (rule #9 — the HTTP transport
 * is confined to {@link createOllamaClient}; this module exposes no transport/vendor type and imports no
 * SDK), is bounded by {@link withRetry} (default 2 retries + per-role timeout + one fallback), returns
 * the RAW output for the gateway's validate/repair/reject (it does NOT validate), and throws a 0-token
 * `ProviderCallError` on terminal failure (rule #8 — no energy on a failed call).
 *
 * ollama is KEYLESS: {@link createOllamaClient} reads only `OLLAMA_BASE_URL` (config, default
 * localhost:11434) — never an API key. Rule #4 (secrets never leave the server) therefore holds by
 * construction: there is no credential to leak into output / providerMeta / events.
 */

const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434';
const DEFAULT_TIMEOUT_MS = 30_000;
const PROVIDER_CALL_FAILED_ID = 'provider_call_failed';

/** A single provider request shaped in CONTRACT terms (no transport type) for the injected client seam. */
export interface OllamaCompletionParams {
  model: string;
  messages: ProviderChatMessage[];
  maxTokens?: number;
  /** Relaxed structured mode marker (ollama `format:'json'`); the schema is conveyed in-message. */
  responseFormat?: { type: 'json_object' };
}

/** The normalized raw completion the client returns — `output` is unvalidated (the gateway validates). */
export interface OllamaRawCompletion {
  id: string;
  model: string;
  output: unknown;
  tokensIn: number;
  tokensOut: number;
}

/**
 * The injected provider seam — OUR transport-free interface. The real implementation
 * ({@link createOllamaClient}) wraps a raw `fetch` to the ollama REST API; tests inject a fake. Rule #9:
 * this interface (not a transport/vendor type) is what the adapter's surface exposes.
 */
export interface OllamaClient {
  complete(
    params: OllamaCompletionParams,
    opts: { timeoutMs: number },
  ): Promise<OllamaRawCompletion>;
}

export interface OllamaAdapterDeps {
  /** Role → route + capability resolution (P2.2). */
  registry: ModelRegistry;
  /** The provider seam (real {@link createOllamaClient} in production; a fake in tests). */
  client: OllamaClient;
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

/**
 * The trusted, candidate-INDEPENDENT instruction conveying the target JSON shape under ollama's relaxed
 * `format:'json'` mode (which carries no schema): derived ONLY from the request `schema` (never from
 * candidate text) → byte-identical per role (§38 isolation). The gateway still validates the output
 * against this same schema (rule #5 — the gateway is the authoritative check; json-mode is an optimization).
 */
function structuredSchemaInstruction(schema: ZodType): string {
  return (
    'Respond with ONLY a single JSON object and no other text. The JSON object MUST conform to this ' +
    `JSON Schema:\n${JSON.stringify(z.toJSONSchema(schema))}`
  );
}

/** Build the contract-shaped request; request relaxed JSON mode only when supported + schema'd. */
function buildParams(
  modelId: string,
  request: ModelGatewayRequest,
  structured: boolean,
): OllamaCompletionParams {
  const baseMessages: ProviderChatMessage[] = request.messages
    ? toProviderMessages(request.messages)
    : [{ role: 'user', content: request.prompt ?? '' }];
  const params: OllamaCompletionParams = { model: modelId, messages: baseMessages };
  if (request.maxTokens !== undefined) {
    params.maxTokens = request.maxTokens;
  }
  if (structured && isZodSchema(request.schema)) {
    // Relaxed structured mode: ollama `format:'json'`. The schema is conveyed to the model as a TRUSTED,
    // candidate-INDEPENDENT system instruction (text) PREPENDED to the messages — preserving §38
    // isolation (the candidate stays DATA in its user message; the instruction is byte-identical
    // regardless of candidate). The gateway's Zod validate/repair(≤1)/reject is AUTHORITATIVE (rule #5).
    params.responseFormat = { type: 'json_object' };
    params.messages = [
      { role: 'system', content: structuredSchemaInstruction(request.schema) },
      ...baseMessages,
    ];
  }
  return params;
}

/**
 * Build the `providerCall` the gateway injects. On terminal failure (primary retries + one fallback all
 * fail) it throws {@link ProviderCallError}; `createGateway` catches it and maps it to a rejected
 * `ModelGatewayResponse` (the port contract — domain code never sees the throw).
 */
export function createOllamaProviderCall(deps: OllamaAdapterDeps): ProviderCallFn {
  const timeoutFor = deps.timeoutMsForRole ?? (() => DEFAULT_TIMEOUT_MS);

  return async (request: ModelGatewayRequest): Promise<ProviderResult> => {
    const route = deps.registry.resolve(request.role);
    const capability = deps.registry.capabilityFor(request.role);
    const timeoutMs = timeoutFor(request.role);
    const structured = capability.structuredOutputs && isZodSchema(request.schema);

    const attemptOn =
      (target: ModelRoute) => async (): Promise<{ raw: OllamaRawCompletion; provider: string }> => {
        const raw = await deps.client.complete(buildParams(target.modelId, request, structured), {
          timeoutMs,
        });
        return { raw, provider: target.provider };
      };

    const fallbackId = route.fallbackRouteIds[0];
    // Resolve the fallback route LAZILY inside its attempt (a misconfigured fallbackRouteId is captured
    // by `withRetry` as a bounded failed attempt → `ProviderCallError`, never a raw throw escaping the
    // no-throw contract). The PRIMARY role is a typed `ModelRole` the registry must carry (eager resolve).
    const fallbackAttempt =
      fallbackId !== undefined
        ? (): Promise<{ raw: OllamaRawCompletion; provider: string }> =>
            attemptOn(deps.registry.resolve(fallbackId as ModelRole))()
        : undefined;

    const policy: RetryPolicy<{ raw: OllamaRawCompletion; provider: string }> = { timeoutMs };
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

    // Terminal failure: a route-derived providerMeta with ZERO tokens (no productive spend → rule #8 no
    // energy debit). gatewayRequestId is a sentinel — there was no successful provider call.
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

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text; // malformed structured output → the gateway's discipline rejects it; client never throws
  }
}

/** The minimal ollama `/api/chat` response shape this client reads — OUR interface, not a transport type. */
interface OllamaChatResponseLike {
  model?: string;
  created_at?: string;
  message?: { role?: string; content?: string | null };
  prompt_eval_count?: number;
  eval_count?: number;
}

/**
 * The real ollama-backed client — the ONLY place the HTTP transport lives (rule #9, behind the seam). It
 * is KEYLESS: it reads `OLLAMA_BASE_URL` (config, default localhost:11434) and NEVER an API key — so
 * there is no credential to load, close over, or leak (rule #4 holds by construction). The per-attempt
 * timeout aborts the request (belt-and-suspenders with `withRetry`'s timeout race). The response content
 * is JSON-parsed when structured output was requested, else returned as the raw string.
 */
export function createOllamaClient(env: Record<string, string | undefined>): OllamaClient {
  const configured = env.OLLAMA_BASE_URL;
  const baseUrl = (
    configured && configured.trim() !== '' ? configured : DEFAULT_OLLAMA_BASE_URL
  ).replace(/\/+$/, '');
  return {
    async complete(params, opts) {
      const body = {
        model: params.model,
        messages: params.messages.map((m) => ({ role: m.role, content: m.content })),
        stream: false,
        ...(params.responseFormat ? { format: 'json' as const } : {}),
        ...(params.maxTokens !== undefined ? { options: { num_predict: params.maxTokens } } : {}),
      };
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
      try {
        const httpResponse = await fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (!httpResponse.ok) {
          throw new Error(`ollama /api/chat returned HTTP ${httpResponse.status}`);
        }
        const json = (await httpResponse.json()) as OllamaChatResponseLike;
        const content = json.message?.content ?? '';
        return {
          id: json.created_at && json.created_at.length > 0 ? json.created_at : 'ollama-local',
          model: json.model ?? params.model,
          output: params.responseFormat ? safeJsonParse(content) : content,
          tokensIn: json.prompt_eval_count ?? 0,
          tokensOut: json.eval_count ?? 0,
        };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
