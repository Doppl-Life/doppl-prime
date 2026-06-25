import { z } from 'zod';
import type { ZodType } from 'zod';
import OpenAI from 'openai';
import {
  ToolName,
  type ChatRole,
  type ModelGatewayRequest,
  type ModelRole,
  type ModelRoute,
  type ProviderMeta,
  type ToolCallRequest,
} from '@doppl/contracts';
import type { ProviderCallFn, ProviderResult } from '../structured-output';
import { ProviderCallError } from '../gateway';
import type { ModelRegistry } from '../registry';
import { TOOL_REGISTRY } from '../tools/registry';
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

/** A provider-shaped function tool (TU.4) — OUR vendor-free shape; the SDK accepts it structurally. */
export interface OpenRouterFunctionTool {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

/** A single provider request shaped in CONTRACT terms (no vendor type) for the injected client seam. */
export interface OpenRouterCompletionParams {
  model: string;
  messages: { role: ChatRole; content: string }[];
  maxTokens?: number;
  /** FB.4 — the generation call's sampling temperature (the diverge/converge dial's clamped nudge). */
  temperature?: number;
  /** PD.13 — relaxed structured mode marker (provider `json_object`); the schema is conveyed in-message. */
  responseFormat?: { type: 'json_object' };
  /** TU.4 — the offered function tools (population_generator only). Absent → no tool-use (byte-identical). */
  tools?: OpenRouterFunctionTool[];
}

/** The normalized raw completion the client returns — `output` is unvalidated (P2.4 validates). */
export interface OpenRouterRawCompletion {
  id: string;
  model: string;
  output: unknown;
  tokensIn: number;
  tokensOut: number;
  /** TU.4 — the model's requested tool calls (allowlist-filtered) when `finish_reason==='tool_calls'`. */
  toolCallRequests?: readonly ToolCallRequest[];
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
  const baseMessages = request.messages
    ? request.messages.map((message) => ({ role: message.role, content: message.content }))
    : [{ role: 'user' as ChatRole, content: request.prompt ?? '' }];
  const params: OpenRouterCompletionParams = { model: modelId, messages: baseMessages };
  if (request.maxTokens !== undefined) {
    params.maxTokens = request.maxTokens;
  }
  // FB.4 — thread the request's sampling temperature (the diverge/converge dial's clamped nudge) to the
  // provider call, the same way maxTokens is threaded. Absent samplingParams → provider default (unchanged).
  if (request.samplingParams?.temperature !== undefined) {
    params.temperature = request.samplingParams.temperature;
  }
  if (structured && isZodSchema(request.schema)) {
    // PD.13 — RELAXED structured-output mode: provider `json_object`. OpenAI's strict json_schema subset
    // 400s a root-`anyOf` discriminated-union / optional-field schema (the PD.8c live finding;
    // curl-confirmed strict:true AND strict:false both require a root object). The schema is conveyed to
    // the model as a TRUSTED, candidate-INDEPENDENT system instruction (text) PREPENDED to the messages —
    // preserving §38 isolation (the candidate stays DATA in its user message; the instruction is
    // byte-identical regardless of candidate). The gateway's Zod validate/repair(≤1)/reject remains the
    // AUTHORITATIVE check (rule #5); provider strict-mode was only an optimization.
    params.responseFormat = { type: 'json_object' };
    params.messages = [
      { role: 'system' as ChatRole, content: structuredSchemaInstruction(request.schema) },
      ...baseMessages,
    ];
  }
  // TU.4 — offer the request's tools as provider function tools, the parameter JSON-schema sourced from the
  // tool registry (the contract `ToolDescriptor` carries only name+description). A descriptor not in the
  // registry is dropped (only allowlisted tools are ever offered — rule #3). Tools + json_object can coexist:
  // the model either calls a tool (finish_reason 'tool_calls') or returns the final structured candidate.
  if (request.tools && request.tools.length > 0) {
    const tools = request.tools.flatMap((descriptor): OpenRouterFunctionTool[] => {
      const spec = TOOL_REGISTRY[descriptor.name];
      return spec === undefined
        ? []
        : [
            {
              type: 'function',
              function: {
                name: descriptor.name,
                description: descriptor.description,
                parameters: spec.parameters,
              },
            },
          ];
    });
    if (tools.length > 0) params.tools = tools;
  }
  return params;
}

/** Parse one provider tool_call into a contract `ToolCallRequest`, FILTERING non-allowlisted names (rule #3). */
function parseToolCall(raw: unknown): ToolCallRequest | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const tc = raw as { id?: unknown; function?: { name?: unknown; arguments?: unknown } };
  const id = tc.id;
  const name = tc.function?.name;
  const args = tc.function?.arguments;
  if (typeof id !== 'string' || id === '') return null;
  if (!ToolName.safeParse(name).success) return null; // a hallucinated/unlisted tool is dropped (allowlist)
  return {
    id,
    name: name as ToolCallRequest['name'],
    arguments: typeof args === 'string' ? args : '',
  };
}

/**
 * The trusted, candidate-INDEPENDENT instruction conveying the target JSON shape under `json_object` mode
 * (which carries no schema): it gives the model the exact shape AND satisfies json_object's required "JSON"
 * mention. Derived only from the request `schema` (never from candidate text) → byte-identical per role
 * (§38). The gateway still validates the output against this same schema (rule #5).
 */
function structuredSchemaInstruction(schema: ZodType): string {
  return (
    'Respond with ONLY a single JSON object and no other text. The JSON object MUST conform to this ' +
    `JSON Schema:\n${JSON.stringify(z.toJSONSchema(schema))}`
  );
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
      // TU.4 — surface tool-call requests alongside the output (only-defined prop, exactOptionalPropertyTypes).
      const result: ProviderResult = { output: raw.output, providerMeta };
      if (raw.toolCallRequests !== undefined) result.toolCallRequests = raw.toolCallRequests;
      return result;
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
  choices: {
    // TU.4 — `tool_calls` + `finish_reason` are present when the model requests tools (else absent/'stop').
    message: { content: string | null; tool_calls?: unknown };
    finish_reason?: string;
  }[];
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
  const choice = response.choices[0];
  const content = choice?.message?.content ?? '';
  const completion: OpenRouterRawCompletion = {
    id: response.id,
    model: response.model,
    output: structured ? safeJsonParse(content) : content,
    tokensIn: response.usage?.prompt_tokens ?? 0,
    tokensOut: response.usage?.completion_tokens ?? 0,
  };
  // TU.4 — surface the model's requested tool calls when it asked for tools (`finish_reason==='tool_calls'`).
  // Each is allowlist-filtered to a closed `ToolName` (a hallucinated tool is dropped — rule #3). Set only
  // when ≥1 allowlisted call survives; a normal (finish_reason 'stop') turn leaves `toolCallRequests` absent.
  const toolCalls = choice?.message?.tool_calls;
  if (choice?.finish_reason === 'tool_calls' && Array.isArray(toolCalls)) {
    const requests = toolCalls
      .map(parseToolCall)
      .filter((request): request is ToolCallRequest => request !== null);
    if (requests.length > 0) completion.toolCallRequests = requests;
  }
  return completion;
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
          // FB.4 — the diverge/converge dial's sampling temperature (the OpenAI-compatible SDK accepts it).
          ...(params.temperature !== undefined ? { temperature: params.temperature } : {}),
          // PD.13 — relaxed structured mode: provider `json_object` (the schema rides in-message, not here).
          ...(params.responseFormat ? { response_format: { type: 'json_object' as const } } : {}),
          // TU.4 — the offered function tools (population_generator only); the OpenAI-compatible SDK accepts them.
          ...(params.tools ? { tools: params.tools } : {}),
        },
        { timeout: opts.timeoutMs },
      );
      return mapSdkResponse(response, params.responseFormat !== undefined);
    },
  };
}
