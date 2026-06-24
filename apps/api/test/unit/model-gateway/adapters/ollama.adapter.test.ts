import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { ProviderMeta } from '@doppl/contracts';
import type {
  ChatRole,
  ModelGatewayRequest,
  ModelRole,
  ModelRoute,
  ProviderCapability,
} from '@doppl/contracts';
import type { ModelRegistry } from '../../../../src/model-gateway/registry';
import { ProviderCallError } from '../../../../src/model-gateway/gateway';
import {
  createOllamaClient,
  createOllamaProviderCall,
} from '../../../../src/model-gateway/adapters/ollama.adapter';
import type { OllamaClient } from '../../../../src/model-gateway/adapters/ollama.adapter';
import { ProviderTimeoutError } from '../../../../src/model-gateway/adapters/retry';
import type { RetryDeps } from '../../../../src/model-gateway/adapters/retry';

/**
 * FB.1 — local-provider (ollama) generation adapter behind the ModelGateway (ARCHITECTURE.md §6/§5,
 * KEY SAFETY RULES #9 + #8 + #4 + #5). Mirrors the OpenRouter adapter: an injected vendor-free
 * `OllamaClient` seam (rule #9 — HTTP confined to `createOllamaClient`), raw output (the gateway shell
 * validates — adapter does not), `withRetry` bounded retries + per-role timeout + one fallback, a
 * candidate-INDEPENDENT structured-output instruction (rule #5 / lesson 98), and a 0-token
 * `ProviderCallError` on terminal failure (rule #8). ollama is KEYLESS (local `OLLAMA_BASE_URL`, no key
 * — rule #4 holds by construction). The client seam is faked here — no live provider, no network.
 */

const TEST_ROLE: ModelRole = 'population_generator';
const FALLBACK_ROLE: ModelRole = 'fusion_synthesis';

const NO_WAIT: RetryDeps = {
  sleep: () => Promise.resolve(),
  timeoutSignal: () => new Promise<never>(() => {}),
};

function makeRegistry(opts?: {
  fallbackRouteIds?: string[];
  structuredOutputs?: boolean;
}): ModelRegistry {
  const capability: ProviderCapability = {
    structuredOutputs: opts?.structuredOutputs ?? true,
    embeddings: false,
  };
  const routes: Partial<Record<ModelRole, ModelRoute>> = {
    [TEST_ROLE]: {
      role: TEST_ROLE,
      provider: 'ollama',
      modelId: 'llama3.1',
      capability,
      fallbackRouteIds: opts?.fallbackRouteIds ?? [],
    },
    [FALLBACK_ROLE]: {
      role: FALLBACK_ROLE,
      provider: 'ollama',
      modelId: 'llama3.1-fallback',
      capability,
      fallbackRouteIds: [],
    },
  };
  return {
    resolve(role: ModelRole): ModelRoute {
      const route = routes[role];
      if (!route) throw new Error(`test registry has no route for ${role}`);
      return route;
    },
    capabilityFor(): ProviderCapability {
      return capability;
    },
  };
}

type Behavior =
  | {
      kind: 'success';
      output: unknown;
      id?: string;
      model?: string;
      tokensIn?: number;
      tokensOut?: number;
    }
  | { kind: 'error'; message: string }
  | { kind: 'hang' };

interface RecordedCall {
  model: string;
  messages: { role: ChatRole; content: string }[];
  maxTokens?: number | undefined;
  responseFormat?: { type: 'json_object' } | undefined;
  timeoutMs: number;
}

function makeClient(behaviors: Behavior[]): { client: OllamaClient; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  let index = 0;
  const client: OllamaClient = {
    complete(params, opts) {
      calls.push({
        model: params.model,
        messages: params.messages,
        maxTokens: params.maxTokens,
        responseFormat: params.responseFormat,
        timeoutMs: opts.timeoutMs,
      });
      const behavior = behaviors[Math.min(index, behaviors.length - 1)];
      index += 1;
      if (!behavior) throw new Error('test fake: no behavior configured');
      if (behavior.kind === 'success') {
        return Promise.resolve({
          id: behavior.id ?? 'ollama-req-1',
          model: behavior.model ?? params.model,
          output: behavior.output,
          tokensIn: behavior.tokensIn ?? 9,
          tokensOut: behavior.tokensOut ?? 5,
        });
      }
      if (behavior.kind === 'error') {
        return Promise.reject(new Error(behavior.message));
      }
      return new Promise(() => {}); // hang — never settles (for the timeout test)
    },
  };
  return { client, calls };
}

const promptRequest: ModelGatewayRequest = { role: TEST_ROLE, prompt: 'generate an idea' };

describe('ollama adapter — success + providerMeta (spec §6)', () => {
  test('test_ollama_success_returns_raw_output_and_providermeta', async () => {
    // spec(§6) lesson 28: a successful ollama call returns the RAW output + a ProviderMeta reflecting
    // provider 'ollama' / modelId / gatewayRequestId / token usage. The adapter does NOT validate.
    const { client } = makeClient([
      {
        kind: 'success',
        output: { idea: 'x' },
        id: 'ollama-req-42',
        model: 'llama3.1',
        tokensIn: 21,
        tokensOut: 13,
      },
    ]);
    const providerCall = createOllamaProviderCall({
      registry: makeRegistry(),
      client,
      retry: NO_WAIT,
    });
    const result = await providerCall(promptRequest);
    expect(result.output).toEqual({ idea: 'x' });
    expect(ProviderMeta.safeParse(result.providerMeta).success).toBe(true);
    expect(result.providerMeta).toEqual({
      provider: 'ollama',
      modelId: 'llama3.1',
      gatewayRequestId: 'ollama-req-42',
      tokensIn: 21,
      tokensOut: 13,
    });
  });
});

describe('ollama adapter — structured output isolation (spec §6/§14, rule #5)', () => {
  test('test_ollama_structured_output_uses_json_mode_and_candidate_independent_instruction', async () => {
    // spec(§6, lesson 98) rule #5: a structured request sets ollama JSON mode + a system instruction
    // derived ONLY from z.toJSONSchema(request.schema) — byte-identical across two different candidate
    // inputs (the candidate stays DATA in its user message; §38 isolation). Output returned raw.
    const schema = z.strictObject({ idea: z.string() });
    const { client, calls } = makeClient([
      { kind: 'success', output: { idea: 'a' } },
      { kind: 'success', output: { idea: 'b' } },
    ]);
    const providerCall = createOllamaProviderCall({
      registry: makeRegistry({ structuredOutputs: true }),
      client,
      retry: NO_WAIT,
    });
    const base = (candidate: string): ModelGatewayRequest => ({
      role: TEST_ROLE,
      schema,
      messages: [
        { role: 'system', content: 'fixed role instruction' },
        { role: 'user', content: candidate },
      ],
    });
    const r = await providerCall(base('candidate ALPHA'));
    await providerCall(base('candidate BETA'));
    expect(calls[0]?.responseFormat).toEqual({ type: 'json_object' });
    const systemOf = (c: RecordedCall): string =>
      c.messages
        .filter((m) => m.role === 'system')
        .map((m) => m.content)
        .join('\n');
    expect(systemOf(calls[0]!)).toMatch(/json/i);
    expect(systemOf(calls[0]!)).toContain('idea'); // schema shape conveyed
    expect(systemOf(calls[0]!)).toBe(systemOf(calls[1]!)); // candidate-INDEPENDENT (byte-identical)
    const userOf = (c: RecordedCall): string => c.messages.find((m) => m.role === 'user')!.content;
    expect(userOf(calls[0]!)).not.toBe(userOf(calls[1]!)); // only the candidate DATA differs
    expect(r.output).toEqual({ idea: 'a' }); // raw, unvalidated by the adapter
  });

  test('test_ollama_no_structured_output_when_capability_absent', async () => {
    // spec(§6): no JSON mode requested when the role lacks structuredOutputs even if a schema is present.
    const schema = z.strictObject({ idea: z.string() });
    const { client, calls } = makeClient([{ kind: 'success', output: 'plain text' }]);
    const providerCall = createOllamaProviderCall({
      registry: makeRegistry({ structuredOutputs: false }),
      client,
      retry: NO_WAIT,
    });
    await providerCall({ role: TEST_ROLE, prompt: 'generate', schema });
    expect(calls[0]?.responseFormat).toBeUndefined();
  });
});

describe('ollama adapter — terminal failure (rule #8) + retry/timeout (§5)', () => {
  test('test_ollama_terminal_failure_throws_providercallerror_zero_tokens', async () => {
    // spec(§8) rule #8: exhausted attempts throw ProviderCallError with a route-derived providerMeta
    // carrying ZERO tokens (a failed call is no productive spend → no energy debit).
    const { client } = makeClient([{ kind: 'error', message: 'ollama down' }]);
    const providerCall = createOllamaProviderCall({
      registry: makeRegistry({ fallbackRouteIds: [FALLBACK_ROLE] }),
      client,
      retry: NO_WAIT,
    });
    const error = (await providerCall(promptRequest).catch((e: unknown) => e)) as ProviderCallError;
    expect(error).toBeInstanceOf(ProviderCallError);
    expect(error.failures.length).toBe(4); // 3 primary + 1 fallback, all failed
    expect(error.providerMeta.tokensIn).toBe(0);
    expect(error.providerMeta.tokensOut).toBe(0);
    expect(ProviderMeta.safeParse(error.providerMeta).success).toBe(true);
  });

  test('test_ollama_retry_and_timeout', async () => {
    // spec(§5) lesson 28: a hung call times out per-attempt (deterministic injected timeoutSignal); the
    // policy stays finite (bounded retries + one fallback) and terminates → ProviderCallError, reason 'timeout'.
    const { client } = makeClient([{ kind: 'hang' }]);
    const providerCall = createOllamaProviderCall({
      registry: makeRegistry({ fallbackRouteIds: [FALLBACK_ROLE] }),
      client,
      timeoutMsForRole: () => 5,
      retry: {
        sleep: () => Promise.resolve(),
        timeoutSignal: (ms) => Promise.reject(new ProviderTimeoutError(ms)),
      },
    });
    const error = (await providerCall(promptRequest).catch((e: unknown) => e)) as ProviderCallError;
    expect(error).toBeInstanceOf(ProviderCallError);
    expect(error.failures.length).toBe(4);
    expect(error.failures.every((f) => f.reason === 'timeout')).toBe(true);
  });
});

describe('ollama adapter — rule #4 (keyless, no-leak) + rule #9 (HTTP behind the seam)', () => {
  test('test_ollama_client_is_keyless', () => {
    // spec(§14) rule #4: ollama is KEYLESS — createOllamaClient builds with NO api key (only an optional
    // OLLAMA_BASE_URL, default localhost:11434) and does NOT throw for a missing key (unlike the OpenAI
    // embedding / OpenRouter clients). No credential field on the returned client surface.
    expect(() => createOllamaClient({})).not.toThrow();
    expect(() => createOllamaClient({ OLLAMA_BASE_URL: 'http://localhost:11434' })).not.toThrow();
    const client = createOllamaClient({});
    expect(Object.keys(client)).toEqual(['complete']);
  });

  test('test_ollama_no_secret_in_output_or_providermeta_or_error', async () => {
    // spec(§14) rule #4: no key/secret field anywhere in the success output, providerMeta, or the
    // terminal error (trivially true — ollama is keyless — but PINNED). A planted env "secret" never
    // surfaces in any returned object.
    const planted = 'sk-not-a-real-key-PLANTED';
    const okClient = makeClient([{ kind: 'success', output: { idea: 'x' } }]).client;
    const ok = await createOllamaProviderCall({
      registry: makeRegistry(),
      client: okClient,
      retry: NO_WAIT,
    })(promptRequest);
    expect(JSON.stringify(ok)).not.toContain(planted);
    expect(Object.keys(ok.providerMeta).sort()).toEqual(
      ['gatewayRequestId', 'modelId', 'provider', 'tokensIn', 'tokensOut'].sort(),
    );
    const { client } = makeClient([{ kind: 'error', message: 'boom' }]);
    const error = (await createOllamaProviderCall({
      registry: makeRegistry(),
      client,
      retry: NO_WAIT,
    })(promptRequest).catch((e: unknown) => e)) as ProviderCallError;
    const serialized = JSON.stringify({
      failures: error.failures,
      providerMeta: error.providerMeta,
      message: error.message,
    });
    expect(serialized).not.toContain(planted);
    expect(serialized.toLowerCase()).not.toContain('apikey');
    expect(serialized.toLowerCase()).not.toContain('api_key');
  });

  test('test_ollama_no_sdk_or_vendor_type_in_adapter_surface', () => {
    // spec(§14) rule #9: HTTP/transport is confined to createOllamaClient; the adapter's EXPORTED surface
    // exposes no vendor/transport type and the module imports no provider SDK (raw fetch behind the seam).
    const adapterPath = fileURLToPath(
      new URL('../../../../src/model-gateway/adapters/ollama.adapter.ts', import.meta.url),
    );
    const source = readFileSync(adapterPath, 'utf8');
    expect((source.match(/from ['"]ollama['"]/g) ?? []).length).toBe(0); // no ollama SDK dependency
    const exportLines = source.split('\n').filter((line) => /^\s*export\b/.test(line));
    expect(exportLines.some((line) => /\bfetch\b|\bRequestInit\b|\bResponse\b/.test(line))).toBe(
      false,
    );
  });
});
