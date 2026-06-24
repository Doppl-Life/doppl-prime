import type { ModelGatewayRequest, ModelRole } from '@doppl/contracts';
import type { ModelGateway } from './port';
import { createGateway } from './gateway';
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
import type { ProviderCallFn } from './structured-output';
import type { RetryDeps } from './adapters/retry';
import type { ModelRegistry } from './registry';

/**
 * Live ModelGateway (PD.9, ARCHITECTURE.md §6/§17, KEY SAFETY RULES #4/#8/#9).
 *
 * The real counterpart of `createFakeGateway`: it composes the already-shipped §6 pieces behind the P2.4
 * gateway shell (`createGateway`) and ROUTES by role — chat-completion roles (population/critic/judge/
 * synthesis) hit the P2.5 OpenRouter `providerCall`; the `embedding` role hits the P2.6 direct-OpenAI
 * `providerCall` (§6 pins embedding to OpenAI `text-embedding-3-small`, a different provider + endpoint
 * than OpenRouter chat-completions). Without this dispatch every `role:'embedding'` call was misrouted to
 * the OpenRouter chat endpoint with an embedding model → always failed → novelty always degraded. The
 * validate / repair (≤1) / reject discipline is INHERITED from `createGateway`, never re-implemented; a
 * terminal `ProviderCallError` (either adapter) is mapped to a rejected `ModelGatewayResponse` (no energy
 * on failure — rule #8).
 *
 * Rule #9: each vendor SDK is confined to its `create*Client` behind a vendor-free client seam — this
 * module imports NO SDK and exposes no vendor type. Rule #4: each API key lives only inside its injected
 * client (env-only, closed over); it never reaches a request/response/persisted payload.
 */
export interface LiveGatewayDeps {
  /** Role → route + capability resolution (P2.2). */
  registry: ModelRegistry;
  /** The chat-completion provider seam — real {@link createOpenRouterClient} in prod boot; a fake in tests. */
  client: OpenRouterClient;
  /**
   * The embedding provider seam (P2.6) — real {@link createOpenAIEmbeddingClient} in prod boot; a fake in
   * tests. Drives the `embedding`-role `providerCall` (direct OpenAI, §6). OPTIONAL for back-compat: when
   * absent, an `embedding` call falls through to the OpenRouter call (the legacy misroute) — so the prod
   * boot root MUST supply it. The dispatch below short-circuits to this adapter for the embedding role.
   */
  embeddingClient?: OpenAIEmbeddingClient;
  /** Retries after the first primary attempt; default 2 (passed through to the adapter). */
  maxRetries?: number;
  /** Per-role per-attempt timeout (passed through to the adapter). */
  timeoutMsForRole?: (role: ModelRole) => number;
  /** Injected backoff + timeout seams for deterministic tests (passed through to the adapter). */
  retry?: RetryDeps;
}

export function createLiveGateway(deps: LiveGatewayDeps): ModelGateway {
  // Build the OpenRouter (chat-completion) adapter deps with only-defined optional props
  // (exactOptionalPropertyTypes — never pass an explicit `undefined`; the adapter/withRetry supply their
  // own defaults for the omitted ones).
  const adapterDeps: OpenRouterAdapterDeps = { registry: deps.registry, client: deps.client };
  if (deps.maxRetries !== undefined) adapterDeps.maxRetries = deps.maxRetries;
  if (deps.timeoutMsForRole !== undefined) adapterDeps.timeoutMsForRole = deps.timeoutMsForRole;
  if (deps.retry !== undefined) adapterDeps.retry = deps.retry;
  const openRouterCall = createOpenRouterProviderCall(adapterDeps);

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

  // Role-dispatching providerCall: the `embedding` role goes to the OpenAI embedding adapter (§6),
  // everything else to OpenRouter chat-completions.
  const providerCall: ProviderCallFn = (request: ModelGatewayRequest) =>
    request.role === 'embedding' && embeddingCall !== undefined
      ? embeddingCall(request)
      : openRouterCall(request);

  return createGateway({
    providerCall,
    // Arrow-wrapped so the binding never depends on the registry's `this` (defensive).
    capabilityFor: (role) => deps.registry.capabilityFor(role),
  });
}
