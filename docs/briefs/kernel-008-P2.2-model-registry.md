# /tdd brief — model_registry

## Feature
The role-keyed model registry: maps each of the 7 `ModelRole`s to exactly one `ModelRoute`, resolves a route by role (provider/modelId/capability), is Zod-validated at boot with `defaults < file < env` precedence and fails fast on an invalid/incomplete registry — and enforces the credential boundary (key safety rule #4): provider credentials load **only from env**, are fail-fast checked at boot, and are **never embedded in the registry config object**. This is the route-resolution + capability source the gateway (`capabilityFor`) and the adapters (P2.5/2.6/2.7) consume, and the real path behind `selectGateway`.

## Use case + traceability
- **Task ID:** P2.2
- **Architecture sections it implements:** `ARCHITECTURE.md §6` (role→route routing; OpenRouter primary for gen/critic/judge/synthesis, direct-OpenAI embeddings, web-search retrieval; model tiering; capability matrix), `ARCHITECTURE.md §14` (credentials load only from env, never threaded into a persisted/logged object — rule #4)
- **Related context:** consumes the frozen `ModelRoute`/`ModelRole`/`ProviderCapability` (P0.11). The landed gateway: `createGateway({providerCall, capabilityFor, resolveSchema?})` (P2.4, `9c8c886`) takes an injected `capabilityFor` — this registry PROVIDES it (`resolve(role).capability`); `selectGateway({useStub})` (P2.9) — its `useStub:false` real path resolves through this registry. The boot-config precedence pattern mirrors `validateRunConfig` (P0.3, lesson §4 — pure merge over `{defaults,file,env}`, IO at the boundary) — see Step-2.5 Q1. **Credential-boundary (rule #4)** → solo commit + security-reviewer fan-out at Step 8. Unit-testable (no PG, no live providers).

## Acceptance criteria (what "done" means)
- [ ] The registry maps each of the 7 `ModelRole`s to exactly one `ModelRoute`; `resolve(role)` returns that route's provider/modelId/capability; an **unmapped role is a boot/config error**, never a silent default
- [ ] Registry config is **Zod-validated at startup** with precedence `defaults < file < env`; an invalid or incomplete registry **fails fast** with a clear, field-identifying error rather than starting degraded
- [ ] **Rule #4 credential boundary:** required provider credentials (OpenRouter key, OpenAI key, DB URL) are **fail-fast checked at boot**; they load **only from env** and are **never embedded in the registry config object** (a config carrying a credential value is rejected / structurally absent) — so the config object can't leak a key if logged/persisted
- [ ] Default role→provider routing: generation/critic/final_judge/fusion_synthesis → **OpenRouter**; embedding → **direct OpenAI `text-embedding-3-small`**; retrieval → the **web-search/retrieval** route
- [ ] **Model tiering** is expressible per role (cheaper model for population/critic, stronger for final_judge/synthesis) and the resolved route reflects the configured tier
- [ ] `fallbackRouteIds` on a route reference **only other registered routes**; a dangling fallback id is a config-validation error
- [ ] `/preflight` clean; **security-reviewer fan-out at Step 8** (credential-boundary focus)

## Wiring / entry point (Step 7.5)
`resolve(role)` (+ the registry's `capabilityFor`) is consumed by: (a) `createGateway`'s injected `capabilityFor` (the registry supplies it), (b) the adapters (P2.5/2.6/2.7 resolve their route), (c) `selectGateway({useStub:false})`'s real path. So: `first consumers — P2.5 (OpenRouter adapter resolves its route) + the gateway's capabilityFor`; the full gateway boot (registry + real adapter + env-loaded creds wired into the running server) completes in **P2.5 / P3.1**. The boot-time config load + cred check is reachable via the registry's `load`/`validate` entry; named here, fully wired at the P3.1 boot path.

## Files expected to touch
**New:**
- `apps/api/src/model-gateway/registry.ts` — `resolve(role)` + the role→route map + boot load/validate
- `apps/api/src/model-gateway/config.schema.ts` — the registry config Zod schema (+ precedence merge per Q1)
- `apps/api/src/config/model-registry.config.ts` — the default registry (role→route map with tiering)
- `apps/api/test/unit/model-gateway/registry.test.ts`

**Modified:**
- `apps/api/src/model-gateway/index.ts` — export `resolve`/registry surface (per Q-barrel)

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)
Tests in `apps/api/test/unit/model-gateway/registry.test.ts` (`spec(§6)` / `spec(§14)`):

1. **`test_resolve_returns_route_for_each_role`** — all 7 roles resolve to a `ModelRoute` (provider/modelId/capability). Why: §6 role→route.
2. **`test_unmapped_role_is_boot_error`** — a registry missing a role fails validation (no silent default). Why: §6 fail-fast.
3. **`test_config_precedence_defaults_file_env`** — env overrides file overrides defaults for an overridable key. Why: §6/§15 precedence.
4. **`test_invalid_registry_fails_fast`** — an invalid/incomplete registry throws a clear field-identifying error. Why: §6/§15 fail-fast boot.
5. **`test_credentials_never_in_config_object`** (rule #4) — the registry config object contains NO credential value; a config with an embedded key is rejected. Why: §14 cred boundary.
6. **`test_required_env_fail_fast`** — a missing required env var (e.g. `OPENROUTER_API_KEY`) aborts boot with a named error identifying which var. Why: §14/§15 fail-fast env.
7. **`test_role_provider_defaults`** — gen/critic/judge/synthesis→OpenRouter, embedding→OpenAI `text-embedding-3-small`, retrieval→web-search. Why: §6 routing.
8. **`test_dangling_fallback_rejected`** — a `fallbackRouteId` referencing an unregistered route is a config error. Why: §6 fallback integrity.
9. **`test_model_tiering_expressible`** — a per-role tier is reflected in the resolved route. Why: §6 tiering.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** none (consumes frozen `ModelRoute`/`ModelRole`/`ProviderCapability`).
- **Orchestrator doc rows to write hot (Step 9):** likely a LESSONS entry (the credential-boundary pattern — env-only, never in the config object, fail-fast) if it's a durable convention.
- **Shared-contract seam model touched?** No.

## Things to flag at Step 2.5
1. **Config precedence: reuse `validateRunConfig`'s merge or a registry-local one.** The `defaults<file<env` deep-merge pattern is identical to P0.3's `validateRunConfig` (lesson §4). My default vote: **reuse the same merge discipline** (deep-merge objects / replace arrays+scalars, skip JS-internal keys, field-identifying errors) — extract a shared pure merge helper if `validateRunConfig` doesn't already expose one; the registry keeps its OWN Zod schema (`config.schema.ts`). Confirm whether a shared helper exists to import vs. mirror the pattern.
2. **Credential check shape.** My default vote: a boot check reads `process.env` for the required set (`OPENROUTER_API_KEY`, `OPENAI_API_KEY`, `DATABASE_URL`) and aborts with a named error on any missing one; the loaded values are **passed to the gateway/adapters at call time, never stored in the registry config object** (the config object holds provider/modelId/capability/tier only — no key field is representable). Confirm the required-env set.
3. **Default registry location + override.** My default vote: `model-registry.config.ts` holds the default role→route map (with tiering); file/env layers override per Q1. Flag if the default set should differ.
4. **Barrel surface.** My default vote: export `resolve` (+ the registry factory/load) from the model-gateway barrel so P2.5/P3.1 import the one seam surface.

## Dependencies + sequencing
- **Depends on:** P0.11 (frozen route/role/capability), P2.1 (`171fe23`, port). No PG, no live providers.
- **Blocks:** P2.5/P2.6/P2.7 (adapters resolve their route via the registry), `selectGateway`'s real path (P2.9 → P2.5), the gateway boot (P3.1).

## Estimated commit count
**1.** Credential-boundary slice (rule #4 — creds env-only, never in the config object). OWN commit (safety-adjacent), never bundled; **security-reviewer fan-out at Step 8** (focus: no credential value reachable in the registry config object or any logged/persisted surface; env-only; fail-fast).

## Lessons-logged candidates anticipated
- **Convention candidate** — "the credential boundary at config: provider keys load only from env + are fail-fast-checked at boot + are NEVER a field in the registry/config object (structurally unrepresentable), so a logged/persisted config can't leak a key; the config object carries only provider/modelId/capability/tier."

## How to invoke
1. **Read this brief end-to-end** — credential-boundary (rule #4): own commit + Step-8 security-reviewer.
2. **Use Context7** for any version-correct config/env-loading patterns if needed.
3. **Run `/tdd model_registry`.**
4. **Step 2.5** — answer the 4 design questions (esp. Q1 merge-reuse + Q2 cred check), send the write-up.
5. **Step 8** — `security-reviewer` (credential-boundary focus).
6. **Step 9** — surface the credential-boundary lesson candidate.
