import type { ModelRouteOverrideAllowlist } from '../model-gateway/model-route-override';

/**
 * Frozen per-run model-route override allowlist (FB.2, ARCHITECTURE.md §5/§6, KEY SAFETY RULES #1/#6).
 *
 * The kernel bound on `RunConfig.modelRouteOverride` (rule #1, like caps): a run may swap a role's model
 * ONLY to a `{provider, modelId}` listed here. Loaded once at boot, immutable to runs.
 *
 * Scope (lead-ratified, FB.2 Q4): the GENERATION roles are operator-tunable — the launcher's "pick the
 * local/remote model for generation" use case. `final_judge` is DELIBERATELY ABSENT (rule #6 — the
 * held-out judge model is not run-swappable; the fitness anchor cannot be moved via this surface).
 * `critic` / `subtype_check` / `embedding` / `retrieval` are absent for the MVP (the verifier-evidence
 * + embedding paths stay on the boot config). A role absent here ⇒ no override permitted for it
 * (fail-closed). The boot default model is implicitly fine — a run simply omits the override to use it.
 */
export const MODEL_ROUTE_OVERRIDE_ALLOWLIST: ModelRouteOverrideAllowlist = {
  population_generator: [
    { provider: 'openrouter', modelId: 'openai/gpt-4o-mini' },
    { provider: 'openrouter', modelId: 'openai/gpt-4o' },
    { provider: 'ollama', modelId: 'llama3.1' },
  ],
  fusion_synthesis: [
    { provider: 'openrouter', modelId: 'openai/gpt-4o' },
    { provider: 'ollama', modelId: 'llama3.1' },
  ],
  // final_judge: INTENTIONALLY ABSENT (rule #6 — not run-swappable).
};
