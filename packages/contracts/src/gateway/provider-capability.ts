import { z } from 'zod';

/**
 * ProviderCapability — the MVP-lean capability matrix for a route (ARCHITECTURE.md §6). Strict object.
 * `structuredOutputs` + `embeddings` are the REQUIRED day-one gate flags; `toolCalling` + `streaming`
 * are OPTIONAL (deferred capabilities added later). Booleans only — unknown keys rejected.
 */
export const ProviderCapability = z.strictObject({
  structuredOutputs: z.boolean(),
  embeddings: z.boolean(),
  toolCalling: z.boolean().optional(),
  streaming: z.boolean().optional(),
});

export type ProviderCapability = z.infer<typeof ProviderCapability>;
