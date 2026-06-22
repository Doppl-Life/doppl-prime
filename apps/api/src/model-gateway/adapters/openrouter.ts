import type { ModelGatewayRequest, ModelRoute } from "@doppl/contracts";
import OpenAI from "openai";
import { GatewayConfigError } from "../errors.js";
import type { Adapter, AdapterResult } from "../gateway.js";

/**
 * OpenRouter generation adapter (P2.5). Uses the official `openai` SDK
 * with `baseURL` re-pointed at OpenRouter; OpenRouter is OpenAI-compatible
 * so the chat/completions surface stays identical.
 *
 * Bounded retry is handled by the shared `HttpClient` (U1) — passed via
 * the OpenAI SDK's `fetch` option in production. For test isolation,
 * `openaiFactory` accepts a fake client.
 *
 * Energy heuristic: `Math.ceil(total_tokens / 1000)` doppl_energy units.
 * Phase 3 (P3.5) tunes the ratio against the kernel's caps.
 */

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

// Minimal shape we use from the OpenAI SDK — keeps the test mock surface
// small and the production code easy to swap if the SDK changes.
interface OpenAILike {
  chat: {
    completions: {
      create: (params: {
        model: string;
        messages: { role: string; content: string }[];
        response_format?: unknown;
      }) => Promise<{
        id: string;
        choices: { message: { content: string | null } }[];
        usage?: { total_tokens?: number };
      }>;
    };
  };
}

export interface OpenRouterAdapterOptions {
  env: { OPENROUTER_API_KEY?: string | undefined };
  openaiFactory?: (opts: { apiKey: string; baseURL?: string }) => OpenAILike;
}

function messagesFromInput(input: unknown): { role: string; content: string }[] {
  if (typeof input === "object" && input !== null) {
    const obj = input as Record<string, unknown>;
    if (typeof obj.prompt === "string") {
      return [{ role: "user", content: obj.prompt }];
    }
    if (Array.isArray(obj.messages)) {
      return obj.messages as { role: string; content: string }[];
    }
  }
  throw new GatewayConfigError(
    "OpenRouter adapter: request.input must be { prompt: string } or { messages: [...] }",
  );
}

export function createOpenRouterAdapter(options: OpenRouterAdapterOptions): Adapter {
  const apiKey = options.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new GatewayConfigError(
      "OpenRouter adapter: OPENROUTER_API_KEY is not set (required for the openrouter provider)",
    );
  }
  // Per-request timeout for the OpenRouter call. OpenAI SDK's default
  // is 10 minutes, which means a single hung response stalls the whole
  // sequential generation loop. 60s is well above any normal
  // completion (gpt-4o-mini typically returns in 1-3s; sonnet 5-15s)
  // but short enough that a stuck call dies fast and the next agenome
  // can proceed.
  const REQUEST_TIMEOUT_MS = 60_000;
  const factory =
    options.openaiFactory ??
    (((opts) =>
      new OpenAI({
        apiKey: opts.apiKey,
        baseURL: opts.baseURL,
        timeout: REQUEST_TIMEOUT_MS,
        maxRetries: 1,
      })) as (opts: {
      apiKey: string;
      baseURL?: string;
    }) => OpenAILike);
  const client = factory({ apiKey, baseURL: OPENROUTER_BASE_URL });

  return {
    async invoke(route: ModelRoute, request: ModelGatewayRequest): Promise<AdapterResult> {
      const messages = messagesFromInput(request.input);
      const useStructuredOutput =
        route.capabilities.structuredOutputs === true && request.schemaForOutput !== undefined;
      const completion = await client.chat.completions.create({
        model: route.modelId,
        messages,
        ...(useStructuredOutput
          ? {
              response_format: {
                type: "json_schema",
                json_schema: { name: "response", schema: request.schemaForOutput, strict: true },
              },
            }
          : {}),
      });
      const content = completion.choices[0]?.message.content ?? "";
      const totalTokens = completion.usage?.total_tokens ?? 0;
      // Estimate equals actual at the adapter boundary — the gateway will
      // refine when a separate estimate token is available pre-call.
      const energy = Math.max(1, Math.ceil(totalTokens / 1000));
      return {
        rawOutput: content,
        providerTraceId: completion.id,
        energyEstimate: energy,
        energyActual: energy,
      };
    },
  };
}
