import type { ModelGatewayRequest, ModelRole, ProviderMeta } from '@doppl/contracts';
import type { ModelGateway } from './port';
import { createGateway, ProviderCallError } from './gateway';
import {
  createOpenRouterProviderCall,
  type OpenRouterAdapterDeps,
  type OpenRouterClient,
} from './adapters/openrouter.adapter';
import {
  createOllamaProviderCall,
  type OllamaAdapterDeps,
  type OllamaClient,
} from './adapters/ollama.adapter';
import type { ProviderCallFn, ProviderResult } from './structured-output';
import type { RetryDeps } from './adapters/retry';
import type { ModelRegistry } from './registry';

/**
 * Live provider-dispatching ModelGateway (PD.9 + FB.1, ARCHITECTURE.md §6/§17, KEY SAFETY RULES
 * #4/#7/#8/#9).
 *
 * Composes the §6 pieces — the per-provider adapters' `providerCall`s fed into the P2.4 gateway shell
 * (`createGateway`). The validate / repair (≤1) / reject discipline is INHERITED from `createGateway`,
 * never re-implemented; a terminal `ProviderCallError` is mapped to a rejected `ModelGatewayResponse`
 * by the shell (no energy on failure — rule #8).
 *
 * FB.1 makes the injected providerCall PROVIDER-DISPATCHING: it resolves `route.provider` per request
 * and dispatches to the matching adapter. The dispatch map IS the runtime provider allowlist — a
 * provider with no registered adapter → an honest `ProviderCallError` (the shell rejects it; never a
 * silent fallback). `openrouter` → the P2.5 adapter; `ollama` → the FB.1 adapter (when a keyless ollama
 * client is supplied). The non-generation roles `openai` (embedding) + `web-search` (retrieval) keep
 * their pre-FB.1 OpenRouter-call path EXACTLY (their real adapters — OpenAI embedding P2.6, retrieval
 * P2.7 — are not yet composed live; documented Future TODO), as explicit legacy entries.
 *
 * Rule #9: every vendor SDK / HTTP transport is confined to its adapter's client factory behind a seam —
 * this module imports no SDK and exposes no transport type. Rule #4: keys live only inside the injected
 * clients (env-only / keyless); they never reach a request/response/persisted payload. Rule #7: replay
 * never reaches here (the recorded gateway is the replay path — `selectGateway` stub branch).
 */
export interface LiveGatewayDeps {
  /** Role → route + capability resolution (P2.2). */
  registry: ModelRegistry;
  /** The OpenRouter provider seam — real {@link createOpenRouterClient} in prod boot; a fake in tests. */
  client: OpenRouterClient;
  /** The keyless ollama provider seam (FB.1) — supplied at live boot; an ollama route honest-rejects without it. */
  ollamaClient?: OllamaClient;
  /** Retries after the first primary attempt; default 2 (passed through to the adapters). */
  maxRetries?: number;
  /** Per-role per-attempt timeout (passed through to the adapters). */
  timeoutMsForRole?: (role: ModelRole) => number;
  /** Injected backoff + timeout seams for deterministic tests (passed through to the adapters). */
  retry?: RetryDeps;
}

export function createLiveGateway(deps: LiveGatewayDeps): ModelGateway {
  // Build the OpenRouter adapter deps with only-defined optional props (exactOptionalPropertyTypes —
  // never pass an explicit `undefined`; the adapter/withRetry supply their own defaults).
  const openRouterDeps: OpenRouterAdapterDeps = { registry: deps.registry, client: deps.client };
  if (deps.maxRetries !== undefined) openRouterDeps.maxRetries = deps.maxRetries;
  if (deps.timeoutMsForRole !== undefined) openRouterDeps.timeoutMsForRole = deps.timeoutMsForRole;
  if (deps.retry !== undefined) openRouterDeps.retry = deps.retry;
  const openRouterCall = createOpenRouterProviderCall(openRouterDeps);

  // provider → providerCall dispatch map = the runtime provider allowlist. `openai`/`web-search` are
  // EXPLICIT legacy entries (the non-generation roles' pre-FB.1 path), NOT a silent fallback — a provider
  // absent from this map honest-rejects below.
  const dispatch: Record<string, ProviderCallFn> = {
    openrouter: openRouterCall,
    openai: openRouterCall,
    'web-search': openRouterCall,
  };
  if (deps.ollamaClient !== undefined) {
    const ollamaDeps: OllamaAdapterDeps = { registry: deps.registry, client: deps.ollamaClient };
    if (deps.maxRetries !== undefined) ollamaDeps.maxRetries = deps.maxRetries;
    if (deps.timeoutMsForRole !== undefined) ollamaDeps.timeoutMsForRole = deps.timeoutMsForRole;
    if (deps.retry !== undefined) ollamaDeps.retry = deps.retry;
    dispatch.ollama = createOllamaProviderCall(ollamaDeps);
  }

  const providerCall: ProviderCallFn = (request: ModelGatewayRequest): Promise<ProviderResult> => {
    const route = deps.registry.resolve(request.role);
    const call = dispatch[route.provider];
    if (call === undefined) {
      // The dispatch map IS the runtime provider allowlist — an unregistered provider honest-rejects with
      // a 0-token ProviderCallError (no productive spend → rule #8). The gateway shell maps it to a
      // rejected response; we NEVER silently fall back to another provider.
      const providerMeta: ProviderMeta = {
        provider: route.provider,
        modelId: route.modelId,
        gatewayRequestId: 'provider_not_registered',
        tokensIn: 0,
        tokensOut: 0,
      };
      return Promise.reject(
        new ProviderCallError(
          [
            {
              attempt: 1,
              reason: `no adapter registered for provider '${route.provider}' (role '${request.role}')`,
            },
          ],
          providerMeta,
        ),
      );
    }
    return call(request);
  };

  return createGateway({
    providerCall,
    // Arrow-wrapped so the binding never depends on the registry's `this` (defensive).
    capabilityFor: (role) => deps.registry.capabilityFor(role),
  });
}
