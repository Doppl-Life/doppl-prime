import { z } from 'zod';
import { ModelRole } from '../gateway/model-role';

/**
 * ModelRouteOverrideEntry — the per-role override VALUE (frontend-v2 FB.0). Strict 2-field object:
 * only `{provider, modelId}`, mirroring the routable subset of {@link ModelRoute}. Strict so no
 * credential/url/header field is representable at the contract boundary (KEY SAFETY RULE #4 — secrets
 * never leave the server; they live in server-side route config, never in a per-run override).
 */
export const ModelRouteOverrideEntry = z.strictObject({
  provider: z.string().min(1),
  modelId: z.string().min(1),
});

export type ModelRouteOverrideEntry = z.infer<typeof ModelRouteOverrideEntry>;

/**
 * ModelRouteOverride — a per-run, PARTIAL per-`ModelRole` override of the boot route's
 * `{provider, modelId}` (frontend-v2 FB.0, ARCHITECTURE.md §6). `z.partialRecord` keyed by the closed
 * {@link ModelRole}: override a SUBSET of roles ("use ollama for `population_generator`"), leave the
 * rest on the boot route; an unknown role key is rejected (closed key schema).
 *
 * The contract fixes the SHAPE only. Allowlist-CLAMPING the requested {role→models} to the permitted
 * set is a RUNTIME concern (FB.2, rule #9 — the gateway is the only provider seam). Replay
 * reconstructs from the persisted route and makes no provider call (rule #7).
 */
export const ModelRouteOverride = z.partialRecord(ModelRole, ModelRouteOverrideEntry);

export type ModelRouteOverride = z.infer<typeof ModelRouteOverride>;
