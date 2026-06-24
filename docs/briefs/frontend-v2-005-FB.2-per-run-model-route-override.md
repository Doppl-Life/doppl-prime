# /tdd brief — per_run_model_route_override_clamped_to_allowlist

## Feature
Make `RunConfig.modelRouteOverride` (FB.0's shape) **load-bearing**: a per-run override of a role's `{provider, modelId}` that is **clamped to a boot allowlist of permitted models per role** (rule #1 — the kernel bounds what a run may select, exactly like caps), **rejected at `POST /runs` (422) before the `run.configured` append** if it names a non-permitted model (rule #2 — never persist an invalid override), **honored** by the runtime (a permitted override resolves the overridden route for that run → FB.1's provider-dispatch routes to the right adapter, e.g. ollama), and **replay-deterministic** (the override is read from the persisted `run.configured` and re-applied with NO provider call / no re-resolve divergence — rule #7). **Crucially the allowlist EXCLUDES `final_judge`** (rule #6 — the held-out judge is immutable to agents *and operators*; its model is not run-swappable, so the bedrock fitness anchor can't be moved via this surface).

## Use case + traceability
- **Task ID:** FB.2
- **Architecture sections it implements:** `ARCHITECTURE.md §5` (runtime — per-run config is executed-as-recorded with caps clamped to `min(posted, boot ceiling)`; the rule-#1 clamp pattern this mirrors), `ARCHITECTURE.md §6` (model gateway — `ModelRegistry` role→route resolution + the FB.1 provider-dispatch the override feeds)
- **Related context:**
  - Phase plan: `docs/planning/frontend-v2-phase-plan.md` (FB.2 row — "`RunConfig.modelRouteOverride` clamped to an allowlist of {role → permitted models}; kernel/gateway honor it; replay reconstructs from the persisted route — rule #7, no provider calls").
  - FB.0 (`4bd2b4d`): `modelRouteOverride?` = `partialRecord(ModelRole, strict {provider, modelId})` (shape frozen, clamp deferred to here). FB.1 (`a99a92e`): `createLiveGateway` is provider-dispatching (`route.provider → adapter`) — a resolved-overridden route with `provider:'ollama'` routes to the ollama adapter.
  - **The clamp pattern to mirror (rule #1):** caps. `mergePerRunConfig` (`apps/api/src/boot/composeRuntime.ts:67-88`) clamps each cap to `Math.min(perRun, boot)` (never raises — apps/api LESSONS 80 clamp-as-hint); it currently **drops** `modelRouteOverride`. The route-level reject pattern: `overCapField(caps, maxima)` (`apps/api/src/routes/runs.ts:53-58`) → 422 `cap_override_exceeds_max` at `POST /runs:141-145` BEFORE the append. FB.2 mirrors BOTH (the override-violation helper + the 422 + threading the validated override into the per-run config).
  - Registry is **GLOBAL** (`createModelRegistry`, one per boot, `main.ts:133`); `registry.resolve(role)` is called at every gateway call (`live-gateway.ts:80`). No run context at the gateway layer → the override applies via a **per-run overlay** where the run's config is composed (Step-2.5 Q1).
  - Per-run config is authoritative in `run.configured` (`routes/runs.ts:152-161`), read back via `readRecordedConfig` (`boot/startRun.ts:15-24`) → replay reads the same persisted override (rule #7).
  - Safety: rule #1 (kernel bounds; an override can only NARROW to a permitted model, never widen), rule #6 (the held-out judge/rubric/scoring immutable — the judge's route is NOT operator-overridable), rule #4 (the override carries only `{provider, modelId}` — never a credential; structurally unrepresentable per FB.0's strict shape), rule #2 (validate before append), rule #7 (replay re-applies the persisted override, no provider call).

## Acceptance criteria (what "done" means)
- [ ] A **frozen boot allowlist** `MODEL_ROUTE_OVERRIDE_ALLOWLIST: Partial<Record<ModelRole, Array<{provider, modelId}>>>` — per-role permitted `{provider, modelId}` pairs — defined in boot config; **immutable to runs** (a run can never widen it).
- [ ] **`final_judge` is EXCLUDED from the allowlist** (rule #6) — an override targeting `final_judge` is rejected; the scoring/judge anchor is not run-swappable. (Step-2.5 Q4 settles which roles ARE overridable — default: the generation roles; judge excluded hard.)
- [ ] A **pure helper** `modelRouteOverrideViolation(override, allowlist)` returns the first `{role, provider, modelId, reason}` that is not permitted (an unlisted role, or a `{provider,modelId}` not in that role's permitted set), or `null` if all entries are permitted (mirrors `overCapField`).
- [ ] **`POST /runs` rejects** a non-permitted override with **422** `{error:'model_route_override_not_permitted', role, provider, modelId}` **BEFORE** appending `run.configured` (rule #2 — never persist an invalid override); a permitted override (or an absent one) appends + proceeds normally.
- [ ] **`mergePerRunConfig` threads the validated `modelRouteOverride`** into the per-run config (today it drops it) — alongside the existing caps clamp.
- [ ] **The runtime honors a permitted override:** when the run resolves a role's route, the override's `{provider, modelId}` replaces the base route's provider/model (capability + `fallbackRouteIds` inherited from the base — the override narrows provider/model, never fabricates a capability); FB.1's provider-dispatch then routes to the right adapter.
- [ ] **Reachable (Step 7.5):** a run configured with a permitted override (e.g. `population_generator → {provider:'ollama', modelId:…}`) actually causes the ollama adapter to serve that role (proven through the real per-run composition + the FB.1 dispatch — not dead code).
- [ ] **Replay-deterministic (rule #7):** the override is read from the persisted `run.configured`; the same overlay is rebuilt deterministically; replay calls no provider and the effective route reconstructs identically (no re-resolve divergence).
- [ ] No contract change (FB.0 shipped the `modelRouteOverride` shape; the allowlist is boot config, the violation helper + overlay are runtime). All apps/api tests pass; `/preflight` clean.
- [ ] **security-reviewer (INVARIANT):** FB.2 enforces rule #1 (override can't widen) + rule #6 (judge not overridable) + rule #4 (no credential in the override) → run security-reviewer at Step 8 (these are the slice's core).

## Wiring / entry point (Step 7.5)
Two production entry points: (1) `POST /runs` (`apps/api/src/routes/runs.ts`) — the 422 reject of a non-permitted override, mirroring the `overCapField` check, BEFORE the `run.configured` append. (2) The per-run runtime composition (`apps/api/src/boot/composeRuntime.ts` `mergePerRunConfig` + where the run's gateway/registry is composed) — the validated override is threaded into the per-run config and applied as a **per-run registry overlay** so the run's gateway resolves the overridden route (Step-2.5 Q1 settles the exact overlay seam). Confirm a permitted override actually changes the provider the run calls (the dispatch reachability), and that replay re-applies it with no provider call.

## Files expected to touch
**New:**
- `apps/api/src/config/model-route-allowlist.config.ts` (or extend `config/model-registry.config.ts`) — the frozen `MODEL_ROUTE_OVERRIDE_ALLOWLIST`
- `apps/api/src/model-gateway/model-route-override.ts` — `modelRouteOverrideViolation(override, allowlist)` + the overlay/apply helper (`applyRouteOverride(baseRoute, overrideEntry)` / a per-run registry overlay)
- Test files: `apps/api/test/unit/model-gateway/model-route-override.test.ts` + a route-reject test + an integration/dispatch test for the honored override + replay

**Modified:**
- `apps/api/src/routes/runs.ts` — the 422 override-violation check before the `run.configured` append
- `apps/api/src/boot/composeRuntime.ts` — `mergePerRunConfig` threads the validated override; build the per-run registry overlay (or the seam per Q1)
- (per Q1) `apps/api/src/model-gateway/live-gateway.ts` / `registry.ts` — accept the per-run overlay so the run's gateway resolves the overridden route
- `apps/api/src/main.ts` — load + inject the frozen allowlist into the boot composition

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)
Tests in `apps/api/test/unit/model-gateway/model-route-override.test.ts` (+ a route-reject unit test mirroring the cap-override test, + an integration test for the honored override):

1. **`test_override_violation_detects_unpermitted_model`** — Asserts: `modelRouteOverrideViolation` returns the `{role, provider, modelId, reason}` for a `{provider,modelId}` not in that role's allowlist; `null` when all permitted. Why: rule #1 clamp/bound (mirrors `overCapField`).
2. **`test_override_violation_rejects_final_judge`** (rule #6) — Asserts: ANY override targeting `final_judge` is a violation (the judge is not overridable — its allowlist is empty/absent). Why: rule #6 — the held-out-judge anchor is not run-swappable.
3. **`test_override_carries_no_credential`** (rule #4) — Asserts: the override entry shape is `{provider, modelId}` only — no credential field is representable (FB.0 strict). Why: rule #4 (keys server-only; structurally unrepresentable).
4. **`test_post_runs_rejects_unpermitted_override_422`** — Asserts: `POST /runs` with a non-permitted override → 422 `model_route_override_not_permitted` and appends NO `run.configured` (validate before append). Why: rule #2 + the route reject pattern.
5. **`test_post_runs_accepts_permitted_override`** — Asserts: a permitted override (and an absent one) appends `run.configured` carrying the override + proceeds. Why: happy path.
6. **`test_merge_per_run_threads_validated_override`** — Asserts: `mergePerRunConfig` carries the validated `modelRouteOverride` into the per-run config (no longer dropped); caps still clamped. Why: per-run execution (recorded==executed).
7. **`test_apply_override_replaces_provider_model_inherits_capability`** — Asserts: `applyRouteOverride(baseRoute, {provider:'ollama', modelId})` returns a route with the new provider/model but the base's `capability` + `fallbackRouteIds`. Why: the override narrows provider/model, never fabricates a capability.
8. **`test_honored_override_routes_to_overridden_provider`** (integration/dispatch) — Asserts: a run with a permitted `population_generator → ollama` override causes the ollama adapter to serve that role through the real per-run composition + FB.1 dispatch (faked clients). Why: Step-7.5 reachability — the override is honored, not dead.
9. **`test_replay_reapplies_persisted_override_no_provider_call`** — Asserts: replay reads the override from `run.configured`, rebuilds the same effective route, and calls no provider. Why: rule #7 replay determinism.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** NONE — `modelRouteOverride` shape shipped in FB.0; the allowlist is boot config, the violation helper + overlay are runtime. No schema-snapshot.
- **Orchestrator doc rows to write hot (Step 9 routing):** an `ARCHITECTURE.md §5/§6` note — `modelRouteOverride` is clamped to a frozen per-role allowlist (rule #1, like caps; reject-at-route 422), honored via a per-run registry overlay, replay-deterministic, and **excludes `final_judge` (rule #6)**. A `apps/api/LESSONS` convention candidate is likely (override = clamp-as-hint to an allowlist; the judge-exclusion rule-#6 pin). Orchestrator writes both hot.
- **shared-contract seam model touched?** No — runtime + boot config only.

## Things to flag at Step 2.5
1. **The application seam (LOAD-BEARING).** The registry is a boot singleton; the run's gateway must resolve the overridden route. My default vote: a **per-run registry overlay** built where the run's config is composed (`composeRuntime`/`mergePerRunConfig`) — `overlay.resolve(role) = applyRouteOverride(base.resolve(role), clampedOverride[role])` — injected into the run's gateway so FB.1's dispatch sees the overridden provider; replay rebuilds the overlay from `run.configured`. Confirm the exact wrap point (does `composeRuntime` build/receive the gateway, or is it the boot singleton from `main.ts:133` that needs its registry overlaid per-run?). You know the gateway-construction path best — refine here. (Avoid enriching `ModelGatewayRequest` with the override — that's a needless contract change.)
2. **Reject (422) vs clamp (silent drop).** My default vote: **REJECT at `POST /runs` (422)** — mirrors `overCapField`, signals intent, no silent data loss (apps/api LESSONS 22 class). Validate before append (rule #2). Do NOT silently drop a disallowed override at merge.
3. **Allowlist shape + defaults.** My default vote: per-role `Array<{provider, modelId}>`; the boot default route is ALWAYS implicitly permitted (the override narrows within the allowlist, never widens); a role with no allowlist entry → no override permitted for it. The allowlist is FROZEN (loaded at boot, immutable to runs).
4. **Which roles are overridable? (rule #6 safety).** My default vote: the allowlist covers the **generation roles** (`population_generator`, `fusion_synthesis`) — the launcher's "pick the local/remote model for generation" use case — and **EXCLUDES `final_judge`** (rule #6 — the held-out judge model is not run-swappable). Open: should `critic`/`subtype_check` be overridable? Default **no** for the MVP (keep the verifier evidence path on the boot config too; only the generation roles are operator-tunable) — narrower is safer; widen later if the launcher needs it.

## Dependencies + sequencing
- **Depends on:** FB.0 (`4bd2b4d`, the `modelRouteOverride` shape) + FB.1 (`a99a92e`, the provider-dispatch the override feeds). The caps-clamp + route-reject patterns (shipped).
- **Blocks:** FV.3 (launcher per-run model selection incl. ollama) needs FB.0–FB.4; this is the "honor the per-run model choice" half.

## Estimated commit count
**1.** One coherent invariant-bearing slice (allowlist + violation-reject + per-run overlay + replay). It is **security-reviewed (INVARIANT)** — rule #1 (no-widen), rule #6 (judge-exclusion), rule #4 (no-credential) are the slice's core, not bundled feature work. No contract change → the §5/§6 arch note + the lesson ride the `/orchestrate-end` round commit. (If the per-run overlay wiring proves large, it MAY split into 2 — the validate/reject at the route, then the honor/overlay — flag at Step 7.5.)

## Lessons-logged candidates anticipated
- **Convention candidate** — "a per-run `modelRouteOverride` is clamp-as-hint to a FROZEN per-role allowlist (rule #1, mirrors caps): reject-at-route 422 before append (rule #2), thread the validated override through `mergePerRunConfig`, honor via a per-run registry overlay over the boot singleton (FB.1 dispatch picks the provider), replay re-applies the persisted override (rule #7); the allowlist EXCLUDES `final_judge` (rule #6 — the judge model is not run-swappable)."
- **Architecture-doc note candidate** — §5/§6: the override surface + its allowlist clamp + the judge-exclusion safety boundary.
- **Future TODO — operational** — widen the allowlist to `critic`/`subtype_check` if the launcher wants it; surface the permitted-models set via a read route for the launcher (FV.3) to populate the model picker.
