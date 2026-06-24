import type { ModelGatewayRequest, ModelRole, ProviderMeta } from '@doppl/contracts';
import type { ModelGateway } from './port';
import { createGateway, ProviderCallError } from './gateway';
import {
  createOpenRouterProviderCall,
  type OpenRouterAdapterDeps,
  type OpenRouterClient,
} from './adapters/openrouter.adapter';
import {
  createOpenAIEmbeddingProviderCall,
  type OpenAIEmbeddingAdapterDeps,
  type OpenAIEmbeddingClient,
} from './adapters/openai-embedding.adapter';
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
 * The real counterpart of `createFakeGateway`: it composes the already-shipped §6 pieces behind the P2.4
 * gateway shell (`createGateway`). The validate / repair (≤1) / reject discipline is INHERITED from
 * `createGateway`, never re-implemented; a terminal `ProviderCallError` (any adapter) is mapped to a
 * rejected `ModelGatewayResponse` by the shell (no energy on failure — rule #8).
 *
 * Two dispatch layers compose (the merge of cody's embedding fix `d287675` + frontend-v2 FB.1):
 *  - **Embedding-role short-circuit (PD.9 / d287675):** the `embedding` role ALWAYS hits the P2.6
 *    direct-OpenAI embedding adapter (§6 pins embedding to OpenAI `text-embedding-3-small`, a different
 *    provider + endpoint than OpenRouter chat-completions). Without it every `role:'embedding'` call was
 *    misrouted to the OpenRouter chat endpoint with an embedding model → always failed → novelty always
 *    degraded. The short-circuit runs BEFORE the provider-dispatch so it holds regardless of the route's
 *    provider; absent an embedding client it falls through (the legacy back-compat path).
 *  - **Provider-dispatch (FB.1):** the chat-completion roles dispatch by `route.provider` through a map
 *    that IS the runtime provider allowlist — `openrouter` → the P2.5 adapter; `ollama` → the FB.1 adapter
 *    (when a keyless ollama client is supplied); `web-search` (retrieval) keeps its pre-FB.1 OpenRouter
 *    path as an explicit legacy entry; a provider absent from the map → an honest 0-token
 *    `ProviderCallError` (the shell rejects it; NEVER a silent fallback to another provider).
 *
 * Rule #9: every vendor SDK / HTTP transport is confined to its adapter's client factory behind a seam —
 * this module imports no SDK and exposes no transport type. Rule #4: each key lives only inside its
 * injected client (env-only / keyless); it never reaches a request/response/persisted payload. Rule #7:
 * replay never reaches here (the recorded gateway is the replay path — `selectGateway` stub branch).
 */
export interface LiveGatewayDeps {
  /** Role → route + capability resolution (P2.2). */
  registry: ModelRegistry;
  /** The OpenRouter (chat-completion) provider seam — real {@link createOpenRouterClient} in prod boot; a fake in tests. */
  client: OpenRouterClient;
  /**
   * The embedding provider seam (P2.6) — real {@link createOpenAIEmbeddingClient} in prod boot; a fake in
   * tests. Drives the `embedding`-role short-circuit (direct OpenAI, §6). OPTIONAL for back-compat: when
   * absent, an `embedding` call falls through to the provider-dispatch (the legacy misroute) — so the prod
   * boot root MUST supply it.
   */
  embeddingClient?: OpenAIEmbeddingClient;
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
  // Build the OpenRouter (chat-completion) adapter deps with only-defined optional props
  // (exactOptionalPropertyTypes — never pass an explicit `undefined`; the adapter/withRetry supply their
  // own defaults for the omitted ones).
  const openRouterDeps: OpenRouterAdapterDeps = { registry: deps.registry, client: deps.client };
  if (deps.maxRetries !== undefined) openRouterDeps.maxRetries = deps.maxRetries;
  if (deps.timeoutMsForRole !== undefined) openRouterDeps.timeoutMsForRole = deps.timeoutMsForRole;
  if (deps.retry !== undefined) openRouterDeps.retry = deps.retry;
  const openRouterCall = createOpenRouterProviderCall(openRouterDeps);

  // Build the embedding (direct-OpenAI) adapter when a client is supplied — same retry/timeout seams as
  // the OpenRouter call (shared {@link withRetry} policy). Absent → no embedding dispatch (back-compat).
  let embeddingCall: ProviderCallFn | undefined;
  if (deps.embeddingClient !== undefined) {
    const embedDeps: OpenAIEmbeddingAdapterDeps = {
      registry: deps.registry,
      client: deps.embeddingClient,
    };
    if (deps.maxRetries !== undefined) embedDeps.maxRetries = deps.maxRetries;
    if (deps.timeoutMsForRole !== undefined) embedDeps.timeoutMsForRole = deps.timeoutMsForRole;
    if (deps.retry !== undefined) embedDeps.retry = deps.retry;
    embeddingCall = createOpenAIEmbeddingProviderCall(embedDeps);
  }

  // provider → providerCall dispatch map = the runtime provider allowlist (FB.1). `web-search` is an
  // EXPLICIT legacy entry (its retrieval adapter is not yet composed live — documented Future TODO), NOT
  // a silent fallback. `openai` routes to the embedding adapter when present (the d287675 fix — the
  // embedding provider is the direct-OpenAI adapter, never the chat path), else the legacy OpenRouter path
  // for back-compat. A provider absent from this map honest-rejects below.
  const dispatch: Record<string, ProviderCallFn> = {
    openrouter: openRouterCall,
    openai: embeddingCall ?? openRouterCall,
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
    // cody (d287675) embedding fix — PRESERVED across the FB.1 provider-dispatch merge: the `embedding`
    // role ALWAYS hits the direct-OpenAI embedding adapter (§6), never the chat path. Short-circuits
    // before the provider-dispatch so it holds regardless of what the embedding route's provider is.
    if (request.role === 'embedding' && embeddingCall !== undefined) return embeddingCall(request);
    // FB.1 provider-dispatch for every other role: route.provider → adapter.
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
