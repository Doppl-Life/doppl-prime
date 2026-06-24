import type { ProviderCapability } from '@doppl/contracts';
import type { RegistryConfig } from '../model-gateway/config.schema';

/**
 * Default role→route registry (P2.2, ARCHITECTURE.md §6). OpenRouter is primary for generation/critic/
 * judge/synthesis (tiered: cheaper model for population/critic/subtype_check, stronger for final_judge/
 * fusion_synthesis); direct-OpenAI `text-embedding-3-small` for embedding; web-search for retrieval.
 * Carries NO credentials — provider keys load only from env (rule #4). file/env layers override.
 */

const STRUCTURED_ONLY: ProviderCapability = { structuredOutputs: true, embeddings: false };
const EMBEDDING_ONLY: ProviderCapability = { structuredOutputs: false, embeddings: true };
const NONE: ProviderCapability = { structuredOutputs: false, embeddings: false };

const CHEAP_TIER = 'openai/gpt-4o-mini';
const STRONG_TIER = 'openai/gpt-4o';

export const DEFAULT_MODEL_REGISTRY: RegistryConfig = {
  population_generator: {
    provider: 'openrouter',
    modelId: CHEAP_TIER,
    capability: STRUCTURED_ONLY,
  },
  critic: { provider: 'openrouter', modelId: CHEAP_TIER, capability: STRUCTURED_ONLY },
  subtype_check: { provider: 'openrouter', modelId: CHEAP_TIER, capability: STRUCTURED_ONLY },
  embedding: { provider: 'openai', modelId: 'text-embedding-3-small', capability: EMBEDDING_ONLY },
  final_judge: { provider: 'openrouter', modelId: STRONG_TIER, capability: STRUCTURED_ONLY },
  fusion_synthesis: { provider: 'openrouter', modelId: STRONG_TIER, capability: STRUCTURED_ONLY },
  retrieval: { provider: 'web-search', modelId: 'web-search-default', capability: NONE },
};
