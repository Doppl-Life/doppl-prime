import { z } from 'zod';
import { ModelRole } from '../gateway/model-role';
import { ProviderMeta } from '../gateway/provider-meta';
import { SamplingParams } from '../gateway/sampling-params';

/**
 * LlmCallTelemetry — the persisted deep-telemetry capture of a SINGLE successful generation LLM call
 * (frontend-v2 FB.6, ARCHITECTURE.md §4/§5/§6). The authoritative home of the `llm_call_telemetry`
 * high-traffic event (the "click a node → see its raw reasoning" surface). Self-contained like the other
 * high-traffic payload models (EnergyEvent/CandidateIdea): it carries its own id + run/generation/agenome
 * correlation in the PAYLOAD.
 *
 * KEY SAFETY RULE #4 (secrets never leave the server): the raw fields ride the EXISTING persistence-boundary
 * scrub (`scrubEventPayload` before append + `scrubObservabilityPayload` before Langfuse emit) — this model
 * adds NO new scrub and represents NO credential field (`strictObject` makes one unrepresentable). The raw
 * fields are TRUNCATED-WITH-MARKER under the 1 MiB ceiling BEFORE append (the runtime helper) so a large
 * capture never fails the append; `truncated` is the queryable marker (a reader always knows if the capture
 * is partial). RULE #7 (replay): the capture is pure persisted DATA — replay reads it, never re-calls a
 * provider. RULE #1/#8: a capture is NOT a productive spend — it carries no energy/cap field and changes
 * neither. RULE #6: this records GENERATION output only; it names no judge/rubric/scoring surface.
 */
export const LlmCallTelemetry = z.strictObject({
  id: z.string().min(1),
  runId: z.string().min(1),
  generationId: z.string().min(1).optional(),
  agenomeId: z.string().min(1).optional(),
  /** The gateway routing role of the captured call (FB.6 captures `population_generator`). */
  role: ModelRole,
  /** The raw model response (the gateway `output`, serialized) — truncated-with-marker if oversized. */
  rawResponse: z.string(),
  /** A distinct provider reasoning channel, when an adapter surfaces one (absent for OpenRouter today). */
  rawReasoning: z.string().optional(),
  /** Non-authoritative provenance of the call (no secret field, rule #4). */
  providerMeta: ProviderMeta.optional(),
  /** Queryable marker — `true` iff a raw field was truncated to fit under the payload ceiling. */
  truncated: z.boolean(),
  /** FB.4 (sv7→8) — the EXECUTED sampling params (the dial's temperature); replay reads them (rule #7). */
  samplingParams: SamplingParams.optional(),
});

export type LlmCallTelemetry = z.infer<typeof LlmCallTelemetry>;
