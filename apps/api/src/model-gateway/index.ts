/**
 * model-gateway — the internal provider-seam surface for apps/api. Runtime/verifier import the
 * `ModelGateway` port + the frozen §6 wire contracts from HERE (one internal seam-import surface);
 * `@doppl/contracts` remains the sole definition source — nothing is redefined here (lesson §5).
 *
 * Backend-internal: deliberately NOT re-exported from the package public barrel (`src/index.ts`).
 */
export type { ModelGateway } from './port';
export {
  ModelGatewayRequest,
  ModelGatewayResponse,
  ModelRole,
  ProviderCapability,
  ModelRoute,
} from '@doppl/contracts';

// Structured-output discipline + gateway shell (P2.4) — the seam grows; @doppl/contracts stays the
// sole definition source for the wire contracts above. `ProviderCallError` (P2.5) is the terminal
// provider-failure the gateway maps to a rejected response (port contract).
export { createGateway, ProviderCallError } from './gateway';
export type { GatewayDeps } from './gateway';
export { applyStructuredOutputDiscipline } from './structured-output';
export type { ProviderCallFn, ProviderResult, StructuredOutputParams } from './structured-output';

// OpenRouter generation adapter (P2.5) — the real `providerCall` the gateway injects (SDK behind the
// port, rule #9) + its reusable bounded-retry/timeout/fallback policy (reused by P2.6/P2.7).
export {
  createOpenRouterProviderCall,
  createOpenRouterClient,
  mapSdkResponse,
} from './adapters/openrouter.adapter';
export type {
  OpenRouterClient,
  OpenRouterAdapterDeps,
  OpenRouterCompletionParams,
  OpenRouterRawCompletion,
  SdkChatCompletionLike,
} from './adapters/openrouter.adapter';
export { withRetry, ProviderTimeoutError } from './adapters/retry';
export type { RetryOutcome, RetryDeps, RetryPolicy, AttemptFailure } from './adapters/retry';

// Direct-OpenAI embedding adapter (P2.6) — the `embedding`-role `providerCall` (SDK behind the port,
// rule #9) returning the authoritative vector + modelId + dimension for selection to persist.
export {
  createOpenAIEmbeddingProviderCall,
  createOpenAIEmbeddingClient,
  mapEmbeddingResponse,
} from './adapters/openai-embedding.adapter';
export type {
  EmbeddingResult,
  EmbeddingParams,
  EmbeddingRawCompletion,
  OpenAIEmbeddingClient,
  OpenAIEmbeddingAdapterDeps,
  SdkEmbeddingResponseLike,
} from './adapters/openai-embedding.adapter';

// Recorded/fake gateway (P2.9) — the freeze-bundle fork artifact dependent tracks + P3 integration
// tests run against; completes the gateway chain.
export { createFakeGateway, selectGateway } from './stub/fake-gateway';
export type { FakeGatewayConfig, FakeMode, GatewaySelection } from './stub/fake-gateway';

// Model registry (P2.2) — role→route resolution + boot config validation + credential boundary;
// provides createGateway's capabilityFor + the adapters' route resolution.
export { createModelRegistry, loadModelRegistry, assertProviderCredentials } from './registry';
export type { ModelRegistry, RegistryConfigSources } from './registry';
export { RegistryConfig, RouteConfig } from './config.schema';
