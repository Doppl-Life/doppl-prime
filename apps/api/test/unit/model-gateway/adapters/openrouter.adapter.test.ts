import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { ModelGatewayResponse, ProviderMeta } from '@doppl/contracts';
import type {
  ChatRole,
  ModelGatewayRequest,
  ModelRole,
  ModelRoute,
  ProviderCapability,
} from '@doppl/contracts';
import type { ModelRegistry } from '../../../../src/model-gateway/registry';
import { ProviderCallError, createGateway } from '../../../../src/model-gateway/gateway';
import {
  createOpenRouterClient,
  createOpenRouterProviderCall,
  mapSdkResponse,
} from '../../../../src/model-gateway/adapters/openrouter.adapter';
import type { OpenRouterClient } from '../../../../src/model-gateway/adapters/openrouter.adapter';
import { ProviderTimeoutError } from '../../../../src/model-gateway/adapters/retry';
import type { RetryDeps } from '../../../../src/model-gateway/adapters/retry';

/**
 * P2.5 OpenRouter generation adapter (ARCHITECTURE.md §6 / §14, KEY SAFETY RULES #9 + #8 + #4).
 *
 * The first vendor-SDK slice: a `providerCall`-shaped fn that imports the OpenAI-compatible SDK ONLY
 * behind the port (rule #9), with bounded retry + per-role timeout + one fallback route before a
 * terminal reject; failed attempts surface `provider_call_failed{attempt,reason}` info and do NO energy
 * accounting (rule #8); a success returns real providerMeta for the kernel's post-call reconcile.
 *
 * The vendor SDK is mocked via the injected `OpenRouterClient` seam (the one allowed double) — no live
 * providers, no Postgres. Determinism: backoff + per-attempt timeout are injected (no real timers, no
 * Date.now/Math.random).
 */

const TEST_ROLE: ModelRole = 'population_generator';
const FALLBACK_ROLE: ModelRole = 'fusion_synthesis';

// Deterministic retry deps: backoff resolves instantly; the per-attempt timeout never fires (so the
// injected client outcome always wins the race) unless a test overrides `timeoutSignal`.
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
      provider: 'openrouter',
      modelId: 'primary-model',
      capability,
      fallbackRouteIds: opts?.fallbackRouteIds ?? [],
    },
    [FALLBACK_ROLE]: {
      role: FALLBACK_ROLE,
      provider: 'openai',
      modelId: 'fallback-model',
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
    capabilityFor(role: ModelRole): ProviderCapability {
      void role;
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

function makeClient(behaviors: Behavior[]): { client: OpenRouterClient; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  let index = 0;
  const client: OpenRouterClient = {
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
          id: behavior.id ?? 'gw-req-1',
          model: behavior.model ?? params.model,
          output: behavior.output,
          tokensIn: behavior.tokensIn ?? 11,
          tokensOut: behavior.tokensOut ?? 7,
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

describe('openrouter adapter — success path + providerMeta (spec §6)', () => {
  // spec(§6) — a successful provider call returns the raw output + a ProviderMeta reflecting the
  // ACTUAL provider/modelId/gatewayRequestId + token usage for the kernel's energy reconcile.
  test('test_success_returns_provider_meta', async () => {
    const { client } = makeClient([
      {
        kind: 'success',
        output: { idea: 'x' },
        id: 'gw-req-42',
        model: 'primary-model',
        tokensIn: 31,
        tokensOut: 19,
      },
    ]);
    const providerCall = createOpenRouterProviderCall({
      registry: makeRegistry(),
      client,
      retry: NO_WAIT,
    });
    const result = await providerCall(promptRequest);
    expect(result.output).toEqual({ idea: 'x' });
    expect(ProviderMeta.safeParse(result.providerMeta).success).toBe(true);
    expect(result.providerMeta).toEqual({
      provider: 'openrouter',
      modelId: 'primary-model',
      gatewayRequestId: 'gw-req-42',
      tokensIn: 31,
      tokensOut: 19,
    });
  });
});

describe('openrouter adapter — bounded retry + fallback (spec §6)', () => {
  // spec(§6) — one transient failure is retried; the second attempt succeeds. Total attempts stay
  // within the default bound (1 + 2 retries).
  test('test_bounded_retry_then_success', async () => {
    const { client, calls } = makeClient([
      { kind: 'error', message: 'transient 503' },
      { kind: 'success', output: { idea: 'y' } },
    ]);
    const providerCall = createOpenRouterProviderCall({
      registry: makeRegistry(),
      client,
      retry: NO_WAIT,
    });
    const result = await providerCall(promptRequest);
    expect(result.output).toEqual({ idea: 'y' });
    expect(calls.length).toBe(2); // initial + one retry, both on the primary route
    expect(calls.every((c) => c.model === 'primary-model')).toBe(true);
  });

  // spec(§6) — when the primary route exhausts its retries, ONE fallback-route attempt is made; here
  // the fallback succeeds. 3 primary attempts (1 + 2) then 1 fallback.
  test('test_retry_exhaust_then_fallback_then_success', async () => {
    const { client, calls } = makeClient([
      { kind: 'error', message: 'fail 1' },
      { kind: 'error', message: 'fail 2' },
      { kind: 'error', message: 'fail 3' },
      { kind: 'success', output: { idea: 'z' }, model: 'fallback-model' },
    ]);
    const providerCall = createOpenRouterProviderCall({
      registry: makeRegistry({ fallbackRouteIds: [FALLBACK_ROLE] }),
      client,
      retry: NO_WAIT,
    });
    const result = await providerCall(promptRequest);
    expect(result.output).toEqual({ idea: 'z' });
    expect(calls.length).toBe(4); // 3 primary + 1 fallback
    expect(calls.slice(0, 3).every((c) => c.model === 'primary-model')).toBe(true);
    expect(calls[3]?.model).toBe('fallback-model');
    // providerMeta reflects the route that actually succeeded (the fallback / direct-OpenAI route).
    expect(result.providerMeta.provider).toBe('openai');
  });
});

describe('openrouter adapter — terminal failure (spec §6)', () => {
  // spec(§6) — all attempts (primary retries + the one fallback) fail → the providerCall throws a
  // ProviderCallError carrying per-attempt {attempt,reason} info + a ProviderMeta-valid providerMeta.
  test('test_terminal_failure_throws_provider_call_error', async () => {
    const { client } = makeClient([{ kind: 'error', message: 'down' }]);
    const providerCall = createOpenRouterProviderCall({
      registry: makeRegistry({ fallbackRouteIds: [FALLBACK_ROLE] }),
      client,
      retry: NO_WAIT,
    });
    await expect(providerCall(promptRequest)).rejects.toBeInstanceOf(ProviderCallError);
    const error = await providerCall(promptRequest).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProviderCallError);
    const callError = error as ProviderCallError;
    expect(callError.failures.length).toBe(4); // 3 primary + 1 fallback, all failed
    expect(
      callError.failures.every((f) => typeof f.attempt === 'number' && f.reason.length > 0),
    ).toBe(true);
    expect(ProviderMeta.safeParse(callError.providerMeta).success).toBe(true);
  });

  // spec(§6) — the no-throw contract is SELF-CONTAINED: a fallback route that fails to RESOLVE (e.g. a
  // misconfigured fallbackRouteId) is captured as a bounded failed attempt → ProviderCallError, never a
  // raw Error escaping the provider-call (which would surface to domain code as a non-rejection throw).
  test('test_fallback_resolution_failure_is_bounded_not_escaping', async () => {
    const { client } = makeClient([{ kind: 'error', message: 'primary down' }]);
    const providerCall = createOpenRouterProviderCall({
      registry: makeRegistry({ fallbackRouteIds: ['unregistered_role'] }),
      client,
      retry: NO_WAIT,
    });
    const error = (await providerCall(promptRequest).catch((e: unknown) => e)) as ProviderCallError;
    expect(error).toBeInstanceOf(ProviderCallError);
    expect(error.failures.length).toBe(4); // 3 primary failures + 1 fallback resolution failure
  });

  // spec(§6) — createGateway (the port implementation) maps a thrown terminal ProviderCallError to
  // accepted=false with rejection populated + providerMeta carried — domain code calling
  // ModelGateway.call() never receives a throw (it FAILS THE CALL, not the run). The adapter throws;
  // the gateway honors the §6 port contract.
  test('test_gateway_maps_terminal_failure_to_rejected_response', async () => {
    const { client } = makeClient([{ kind: 'error', message: 'down' }]);
    const registry = makeRegistry({ fallbackRouteIds: [FALLBACK_ROLE] });
    const providerCall = createOpenRouterProviderCall({ registry, client, retry: NO_WAIT });
    const gateway = createGateway({
      providerCall,
      capabilityFor: (role) => registry.capabilityFor(role),
    });
    const response = await gateway.call(promptRequest);
    expect(response.accepted).toBe(false);
    expect(response.validationResult).toBe('rejected');
    expect((response.rejection?.reason.length ?? 0) > 0).toBe(true);
    expect(ProviderMeta.safeParse(response.providerMeta).success).toBe(true);
    expect(ModelGatewayResponse.safeParse(response).success).toBe(true);
  });
});

describe('openrouter adapter — per-role timeout + finiteness (spec §6)', () => {
  // spec(§6) — a per-attempt timeout makes a hung call a FAILED attempt with reason "timeout"; the
  // policy stays finite (bounded retries + one fallback) and terminates.
  test('test_per_role_timeout_counts_as_failed_attempt', async () => {
    const { client } = makeClient([{ kind: 'hang' }]);
    const providerCall = createOpenRouterProviderCall({
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
    expect(error.failures.length).toBe(4); // every attempt timed out → bounded + terminated
    expect(error.failures.every((f) => f.reason === 'timeout')).toBe(true);
  });
});

describe('openrouter adapter — rule #8 (no energy accounting) + rule #9 (SDK behind the port)', () => {
  // spec(§8) rule #8 — failed/retried/fallback attempts produce NO energy representation: neither the
  // thrown error nor any failure entry carries an energy field, and the adapter emits no energy.spent.
  test('test_failed_attempts_never_energy_bearing', async () => {
    const { client } = makeClient([{ kind: 'error', message: 'boom' }]);
    const providerCall = createOpenRouterProviderCall({
      registry: makeRegistry({ fallbackRouteIds: [FALLBACK_ROLE] }),
      client,
      retry: NO_WAIT,
    });
    const error = (await providerCall(promptRequest).catch((e: unknown) => e)) as ProviderCallError;
    const serialized = JSON.stringify({
      failures: error.failures,
      providerMeta: error.providerMeta,
    });
    expect(serialized.toLowerCase()).not.toContain('energy');
    for (const failure of error.failures) {
      expect(Object.keys(failure).sort()).toEqual(['attempt', 'reason']);
    }
  });

  // spec(§14) rule #4 — the OpenRouter key loads ONLY from injected env; a missing key fails fast with
  // an error naming the VAR not the value, and a present key is closed over, never exposed on the
  // returned client surface (no credential field — lesson §27).
  test('test_credentials_env_only_never_in_surface', () => {
    expect(() => createOpenRouterClient({})).toThrow(/OPENROUTER_API_KEY/);
    let captured: Error | undefined;
    try {
      createOpenRouterClient({ OPENROUTER_API_KEY: '   ' });
    } catch (e) {
      captured = e as Error;
    }
    expect(captured?.message).toMatch(/OPENROUTER_API_KEY/);
    expect(captured?.message ?? '').not.toContain('   ');

    const client = createOpenRouterClient({ OPENROUTER_API_KEY: 'sk-secret-value-123' });
    expect(Object.keys(client)).toEqual(['complete']);
    expect(JSON.stringify(client)).not.toContain('sk-secret-value-123');
  });

  // spec(§14) rule #9 — the vendor SDK type never appears in the adapter's EXPORTED surface, and the
  // SDK is imported exactly once (behind the port). Grep-style source assertion.
  test('test_no_vendor_type_in_adapter_surface', () => {
    const adapterPath = fileURLToPath(
      new URL('../../../../src/model-gateway/adapters/openrouter.adapter.ts', import.meta.url),
    );
    const source = readFileSync(adapterPath, 'utf8');
    const exportLines = source.split('\n').filter((line) => /^\s*export\b/.test(line));
    expect(exportLines.some((line) => /\bOpenAI\b/.test(line))).toBe(false);
    expect((source.match(/from ['"]openai['"]/g) ?? []).length).toBe(1);
  });
});

describe('openrouter adapter — relaxed structured output (json_object); gateway is authoritative (spec §6/§14)', () => {
  // spec(§6, PD.13) — a structured request uses provider json_object mode, NOT a strict json_schema:
  // OpenAI's strict structured-output subset 400s a root-`anyOf` discriminated-union schema (the PD.8c
  // live finding; curl-confirmed strict:true AND strict:false both 400 on a root anyOf). The schema is
  // conveyed to the model as a TRUSTED system instruction (text); the raw output is returned UNVALIDATED
  // (the gateway owns validate/repair/reject — rule #5).
  test('adapter_structured_request_uses_relaxed_mode', async () => {
    const schema = z.strictObject({ idea: z.string() });
    const raw = { idea: 'kept-raw' };
    const { client, calls } = makeClient([{ kind: 'success', output: raw }]);
    const providerCall = createOpenRouterProviderCall({
      registry: makeRegistry({ structuredOutputs: true }),
      client,
      retry: NO_WAIT,
    });
    const result = await providerCall({ role: TEST_ROLE, prompt: 'generate', schema });
    expect(calls[0]?.responseFormat).toEqual({ type: 'json_object' }); // relaxed, never strict json_schema
    // the schema is given to the model as a trusted system instruction (text) — incl. a JSON mention
    // (json_object mode requires it) + the schema's shape; candidate stays DATA (§38 isolation intact).
    const systemText = calls[0]!.messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n');
    expect(systemText).toMatch(/json/i);
    expect(systemText).toContain('idea');
    expect(result.output).toBe(raw); // returned as-is — the adapter does not validate
  });

  // spec(§6, PD.13) — the relaxed mode is capability-driven (adapter-level), uniform across structured roles.
  test('relaxed_mode_applies_to_all_structured_roles', async () => {
    const schema = z.strictObject({ idea: z.string() });
    for (const role of [TEST_ROLE, FALLBACK_ROLE] as const) {
      const { client, calls } = makeClient([{ kind: 'success', output: { idea: 'x' } }]);
      const providerCall = createOpenRouterProviderCall({
        registry: makeRegistry({ structuredOutputs: true }),
        client,
        retry: NO_WAIT,
      });
      await providerCall({ role, prompt: 'generate', schema });
      expect(calls[0]?.responseFormat).toEqual({ type: 'json_object' });
    }
  });

  // spec(§14 / §38 — rule #5 isolation) — the schema-as-system-text is candidate-INDEPENDENT: for a given
  // structured role, the SYSTEM message (instruction + schema text) is BYTE-IDENTICAL across two different
  // candidate inputs; only the user-message DATA differs. The added system-text must never become
  // candidate-derived (the §38 byte-identical-instruction property the user's guardrail requires).
  test('test_structured_system_message_candidate_independent', async () => {
    const schema = z.strictObject({ idea: z.string() });
    const { client, calls } = makeClient([
      { kind: 'success', output: { idea: 'a' } },
      { kind: 'success', output: { idea: 'b' } },
    ]);
    const providerCall = createOpenRouterProviderCall({
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
    await providerCall(base('candidate ALPHA'));
    await providerCall(base('candidate BETA'));
    const systemOf = (call: RecordedCall): string =>
      call.messages
        .filter((m) => m.role === 'system')
        .map((m) => m.content)
        .join('\n');
    expect(systemOf(calls[0]!)).toBe(systemOf(calls[1]!)); // instruction + schema-text byte-identical
    const userOf = (call: RecordedCall): string =>
      call.messages.find((m) => m.role === 'user')!.content;
    expect(userOf(calls[0]!)).not.toBe(userOf(calls[1]!)); // only the candidate DATA differs
  });

  // spec(§14 rule #5 — LOAD-BEARING) — relaxing the provider mode does NOT weaken validation: the gateway
  // STILL validates against the request schema → a malformed output (initial + the ≤1 repair) is REJECTED,
  // never accepted-and-appended. Provider strict-mode was only an optimization; the gateway is the
  // authoritative check (LESSONS §23/§91).
  test('gateway_still_rejects_invalid_output_under_relaxed_mode', async () => {
    const schema = z.strictObject({ idea: z.string() });
    const { client } = makeClient([
      { kind: 'success', output: { wrong: 'shape' } }, // initial — invalid
      { kind: 'success', output: { still: 'wrong' } }, // the ≤1 repair — also invalid
    ]);
    const providerCall = createOpenRouterProviderCall({
      registry: makeRegistry({ structuredOutputs: true }),
      client,
      retry: NO_WAIT,
    });
    const gateway = createGateway({
      providerCall,
      capabilityFor: () => ({ structuredOutputs: true, embeddings: false }),
    });
    const res = await gateway.call({ role: TEST_ROLE, prompt: 'generate', schema });
    expect(res.accepted).toBe(false);
    expect(res.validationResult).toBe('rejected');
  });

  // spec(§6) — when the role does NOT support structured outputs, no responseFormat is requested even
  // if a schema is present (the "where supported" clause).
  test('test_no_structured_output_when_capability_absent', async () => {
    const schema = z.strictObject({ idea: z.string() });
    const { client, calls } = makeClient([{ kind: 'success', output: 'plain text' }]);
    const providerCall = createOpenRouterProviderCall({
      registry: makeRegistry({ structuredOutputs: false }),
      client,
      retry: NO_WAIT,
    });
    await providerCall({ role: TEST_ROLE, prompt: 'generate', schema });
    expect(calls[0]?.responseFormat).toBeUndefined();
  });
});

describe('openrouter adapter — vendor response mapping (spec §6)', () => {
  // spec(§6) — mapSdkResponse extracts message content → output, the provider id → gatewayRequestId
  // source, and prompt/completion tokens → tokensIn/tokensOut. A structured response's JSON content is
  // parsed; a non-structured response is returned as the raw string; malformed JSON falls back to raw.
  test('test_map_sdk_response_extracts_output_and_tokens', () => {
    const base = {
      id: 'sdk-id-9',
      model: 'primary-model',
      choices: [{ message: { content: '{"idea":"parsed"}' } }],
      usage: { prompt_tokens: 12, completion_tokens: 8 },
    };
    const structured = mapSdkResponse(base, true);
    expect(structured).toEqual({
      id: 'sdk-id-9',
      model: 'primary-model',
      output: { idea: 'parsed' },
      tokensIn: 12,
      tokensOut: 8,
    });

    const text = mapSdkResponse({ ...base, choices: [{ message: { content: 'hello' } }] }, false);
    expect(text.output).toBe('hello');

    const malformed = mapSdkResponse(
      { ...base, choices: [{ message: { content: 'not json' } }] },
      true,
    );
    expect(malformed.output).toBe('not json'); // discipline (P2.4) rejects it; adapter does not throw
  });
});
