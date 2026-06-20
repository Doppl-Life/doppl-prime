import { z } from 'zod';
import { ModelRole } from './model-role';
import { ProviderCapability } from './provider-capability';

/**
 * ModelRoute — a role→provider routing entry (ARCHITECTURE.md §6, Appendix A line 479). Strict object.
 *
 * The schema does NOT force a single provider: `provider`/`modelId` are open strings, so an
 * `embedding` route pinned to direct-OpenAI and a `critic` route via OpenRouter both validate (§6
 * provider-agnostic routing). `fallbackRouteIds` MAY be empty — multi-hop fallback is added later
 * (§6); it references other route ids (treated as opaque strings).
 */
export const ModelRoute = z.strictObject({
  role: ModelRole,
  provider: z.string().min(1),
  modelId: z.string().min(1),
  capability: ProviderCapability,
  fallbackRouteIds: z.array(z.string().min(1)),
});

export type ModelRoute = z.infer<typeof ModelRoute>;
