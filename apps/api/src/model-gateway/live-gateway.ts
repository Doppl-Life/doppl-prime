import type { ModelRole } from '@doppl/contracts';
import type { ModelGateway } from './port';
import { createGateway } from './gateway';
import {
  createOpenRouterProviderCall,
  type OpenRouterAdapterDeps,
  type OpenRouterClient,
} from './adapters/openrouter.adapter';
import type { RetryDeps } from './adapters/retry';
import type { ModelRegistry } from './registry';

/**
 * Live OpenRouter-backed ModelGateway (PD.9, ARCHITECTURE.md §6/§17, KEY SAFETY RULES #4/#8/#9).
 *
 * The real counterpart of `createFakeGateway`: it composes the already-shipped §6 pieces — the P2.5
 * OpenRouter `providerCall` (`createOpenRouterProviderCall`) fed into the P2.4 gateway shell
 * (`createGateway`). The validate / repair (≤1) / reject discipline is therefore INHERITED from
 * `createGateway`, never re-implemented here; a terminal `ProviderCallError` is mapped to a rejected
 * `ModelGatewayResponse` by the shell (no energy on failure — rule #8).
 *
 * Rule #9: the vendor SDK is confined to `createOpenRouterClient` behind the `OpenRouterClient` seam —
 * this module imports NO SDK and exposes no vendor type. Rule #4: the API key lives only inside the
 * injected client (env-only, closed over); it never reaches a request/response/persisted payload.
 */
export interface LiveGatewayDeps {
  /** Role → route + capability resolution (P2.2). */
  registry: ModelRegistry;
  /** The provider seam — real {@link createOpenRouterClient} in prod boot; a fake in tests (no SDK type). */
  client: OpenRouterClient;
  /** Retries after the first primary attempt; default 2 (passed through to the adapter). */
  maxRetries?: number;
  /** Per-role per-attempt timeout (passed through to the adapter). */
  timeoutMsForRole?: (role: ModelRole) => number;
  /** Injected backoff + timeout seams for deterministic tests (passed through to the adapter). */
  retry?: RetryDeps;
}

export function createLiveGateway(deps: LiveGatewayDeps): ModelGateway {
  // Build the adapter deps with only-defined optional props (exactOptionalPropertyTypes — never pass an
  // explicit `undefined`; the adapter/withRetry supply their own defaults for the omitted ones).
  const adapterDeps: OpenRouterAdapterDeps = { registry: deps.registry, client: deps.client };
  if (deps.maxRetries !== undefined) adapterDeps.maxRetries = deps.maxRetries;
  if (deps.timeoutMsForRole !== undefined) adapterDeps.timeoutMsForRole = deps.timeoutMsForRole;
  if (deps.retry !== undefined) adapterDeps.retry = deps.retry;

  const providerCall = createOpenRouterProviderCall(adapterDeps);
  return createGateway({
    providerCall,
    // Arrow-wrapped so the binding never depends on the registry's `this` (defensive).
    capabilityFor: (role) => deps.registry.capabilityFor(role),
  });
}
