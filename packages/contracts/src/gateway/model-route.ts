import { z } from "zod";
import { ModelRole } from "./model-role.js";
import { ProviderCapability } from "./provider-capability.js";

/**
 * ModelRoute — a single entry in the role -> provider/model resolution
 * table the gateway consults at request time. `fallbackRouteIds`
 * preserves ordered fallback for the bounded-retry / one-fallback policy
 * (P2.5, P3.7).
 */
export const ModelRoute = z
  .object({
    role: ModelRole,
    provider: z.string().min(1),
    modelId: z.string().min(1),
    capabilities: ProviderCapability,
    fallbackRouteIds: z.array(z.string()),
  })
  .strict();
export type ModelRoute = z.infer<typeof ModelRoute>;
