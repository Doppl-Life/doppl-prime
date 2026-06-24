import { z } from 'zod';

/**
 * SamplingParams — provider-agnostic LLM sampling parameters (frontend-v2 FB.4, ARCHITECTURE.md §6).
 *
 * The SHARED shape (lesson §5, defined once at first use — like {@link import('./provider-meta').ProviderMeta}):
 * `ModelGatewayRequest.samplingParams?` carries what the gateway should request; `LlmCallTelemetry.samplingParams?`
 * records what was EXECUTED (so replay reads the recorded outcome, never re-derives or re-samples — rule #7).
 *
 * `strictObject` → no credential/url field representable (rule #4). `temperature` is the FB.4 diverge/converge
 * dial's lever (bounded `[0, 2]` at the contract; the runtime clamps the dial to a research-bounded `[0.4, 1.2]`).
 * Forward-compatible for a future `top_p` etc. — tune temperature OR top_p, not both (research).
 */
export const SamplingParams = z.strictObject({
  temperature: z.number().min(0).max(2).optional(),
});

export type SamplingParams = z.infer<typeof SamplingParams>;
