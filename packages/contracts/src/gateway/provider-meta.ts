import { z } from 'zod';

/**
 * ProviderMeta — non-authoritative provenance of a single model-gateway call (ARCHITECTURE.md §6,
 * Appendix A line 480). The SHARED shape (lesson §5, defined once at first use): P0.9
 * `EnergyEvent.providerMeta?` is the first consumer; P0.12 `ModelGatewayResponse.providerMeta`
 * imports THIS (never redefines).
 *
 * NO secret field — provider credentials load from env only and never enter payloads/events/traces
 * (KEY SAFETY RULE #4, §14). `strictObject` makes a credential-bearing field unrepresentable. Token
 * COUNTS are definitionally non-negative integers; the cost AMOUNT is permissive (a provider/kernel
 * concern, lesson §6).
 */
export const ProviderMeta = z.strictObject({
  provider: z.string().min(1),
  modelId: z.string().min(1),
  gatewayRequestId: z.string().min(1),
  tokensIn: z.int().nonnegative(),
  tokensOut: z.int().nonnegative(),
  costEstimate: z.number().optional(),
});

export type ProviderMeta = z.infer<typeof ProviderMeta>;
