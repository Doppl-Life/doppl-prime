import { z } from "zod";

/**
 * ProviderCapability — exactly the four capability booleans the gateway
 * cares about (ARCHITECTURE.md §9). The §2.5 snapshot pins these four
 * field names; adding or removing a capability breaks the snapshot.
 */
export const ProviderCapability = z
  .object({
    structuredOutputs: z.boolean(),
    toolCalling: z.boolean(),
    embeddings: z.boolean(),
    streaming: z.boolean(),
  })
  .strict();
export type ProviderCapability = z.infer<typeof ProviderCapability>;
