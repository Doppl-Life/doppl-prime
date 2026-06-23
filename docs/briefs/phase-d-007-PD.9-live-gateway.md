# /tdd brief — live_gateway_selectGateway_wiring

## Feature
Wire the real OpenRouter-backed `ModelGateway` into `selectGateway` so `DOPPL_GATEWAY=live` produces a working live gateway (today `selectGateway({useStub:false})` is an honest-throw). A new `createLiveGateway({registry, client})` composes the already-shipped §6 pieces — `createOpenRouterProviderCall` → `createGateway` — behind the port; `selectGateway` grows to delegate to it; `main.ts` builds the live deps (registry + client) from env when `DOPPL_GATEWAY=live` (default `recorded`). ZERO new contract surface — pure composition of existing seams. The live-rung enabler for PD.4's rung-1 low-cap-live.

## Use case + traceability
- **Task ID:** PD.9
- **Architecture sections it implements:** `ARCHITECTURE.md §6` (model gateway & provider integration — the real OpenRouter route, the P2.5-deferred live path), `ARCHITECTURE.md §17` (the demo live rung). Carry-forward (a) from Phase-D round 1 (the live-rung enabler; the gateway/kernel track stood down → the demo team builds it).
- **Related context:** the §6 composition pieces ALL exist + are tested: `createGateway({providerCall, capabilityFor, resolveSchema?})` (P2.4, `model-gateway/gateway.ts`), `createOpenRouterProviderCall({registry, client, …})` (P2.5, `adapters/openrouter.adapter.ts`), `createOpenRouterClient(env)` (P2.5 — SDK behind the `OpenRouterClient` seam, key closed over), `createModelRegistry`/`loadModelRegistry`/`assertProviderCredentials` (P2.2, `registry.ts`). The fake path (`createFakeGateway`, P2.9) is the mirror this slice parallels. `selectGateway` currently throws for `useStub:false` (`stub/fake-gateway.ts:85-90`); `main.ts:79-81,125` maps `DOPPL_GATEWAY` env → `selectGateway`.

## Acceptance criteria (what "done" means)
- [ ] `createLiveGateway({registry, client})` returns a `ModelGateway` that runs a real model call through `createGateway`'s validate / repair (≤1) / reject discipline — built by feeding `createOpenRouterProviderCall({registry, client})` as `providerCall` + `registry.capabilityFor` into `createGateway` (it IS `createGateway`, so the discipline is inherited, not re-implemented).
- [ ] A successful structured response from the (injected) client → an **accepted** `ModelGatewayResponse`; the client was called with the route resolved from `registry.resolve(role)`.
- [ ] A `ProviderCallError` from the client → a **rejected** `ModelGatewayResponse` (mapped by `createGateway`, never thrown out); no energy field on the response (rule #8 — failure debits nothing).
- [ ] `selectGateway({useStub:true})` → the recorded fake (UNCHANGED); `selectGateway({useStub:false}, liveDeps)` → `createLiveGateway(liveDeps)`; `selectGateway({useStub:false})` with NO liveDeps → throws an honest error naming the missing live deps (no silent fallback to the fake).
- [ ] `main.ts` builds the live deps (registry via `createModelRegistry(loadModelRegistry({defaults: DEFAULT_MODEL_REGISTRY}))` + client via `createOpenRouterClient(env)`) ONLY when `DOPPL_GATEWAY=live`; default `recorded` builds NO client/registry (recorded boot stays provider-client-free).
- [ ] The OpenRouter API key stays **env-only** (rule #4): read inside `createOpenRouterClient(env)`, closed over in the SDK client, and present in NO `ModelGatewayRequest`/`ModelGatewayResponse`/`providerMeta`/persisted payload — asserted by driving the live gateway and inspecting the response carries no key value.
- [ ] The OpenAI/OpenRouter SDK appears ONLY behind the `OpenRouterClient` seam (rule #9 — no SDK type on `createLiveGateway`'s or the gateway's exported surface).
- [ ] The live boot path is reachable from `main.ts` AND testable WITHOUT a network call (an injected fake `OpenRouterClient`).
- [ ] All unit tests in `apps/api/test/unit/model-gateway/` pass; the boot integration test passes.
- [ ] `/preflight` clean.

## Wiring / entry point (Step 7.5)
Production entry point: **`apps/api/src/main.ts` `bootApp`** — when `gatewaySelectionFromEnv(env)` resolves `{useStub:false}` (`DOPPL_GATEWAY=live`), `bootApp` constructs `liveDeps = {registry, client}` and calls `selectGateway(selection, liveDeps)` → `createLiveGateway` → the gateway is threaded into `StartRunInfra.modelGateway` → the run worker's generation/verify calls hit the real OpenRouter client. Reachable + exercised (not deferred). The recorded default path is unchanged. Confirm via `/wired createLiveGateway` (boot → selectGateway → worker).

## Files expected to touch
**New:**
- `apps/api/src/model-gateway/live-gateway.ts` — `createLiveGateway(deps: LiveGatewayDeps): ModelGateway` + `LiveGatewayDeps {registry: ModelRegistry; client: OpenRouterClient; maxRetries?; timeoutMsForRole?; retry?}` (pass-throughs to `createOpenRouterProviderCall`).
- `apps/api/test/unit/model-gateway/live-gateway.test.ts`
- `apps/api/test/unit/model-gateway/select-gateway.test.ts` (the multiplexer delegation cases)

**Modified:**
- `apps/api/src/model-gateway/stub/fake-gateway.ts` — `selectGateway(selection, liveDeps?)` delegates `{useStub:false}` to `createLiveGateway(liveDeps)` (throws if absent); `GatewaySelection` unchanged (deps are a 2nd arg, not a field).
- `apps/api/src/model-gateway/index.ts` — export `createLiveGateway` + `LiveGatewayDeps`.
- `apps/api/src/main.ts` — build `liveDeps` from env when `live`; pass to `selectGateway`; add a minimal `BootOverrides.openRouterClient?` injection seam so the live boot BRANCH is testable without network (default `createOpenRouterClient(env)`).
- `apps/api/test/integration/boot/main-boot.test.ts` (extended) — the `DOPPL_GATEWAY=live` boot branch with an injected fake client.

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)

`apps/api/test/unit/model-gateway/live-gateway.test.ts` (fake `OpenRouterClient` + test registry — NO network):
1. **`live_gateway_accepts_valid_structured_response`** — Asserts: a valid client response → accepted `ModelGatewayResponse`; `client.complete` called with the route from `registry.resolve(role)`. Why: §6 happy path; the live composition runs the real discipline.
2. **`live_gateway_maps_provider_error_to_rejected`** — Asserts: client throws `ProviderCallError` → a **rejected** response (not a throw); no energy field. Why: §6 + rule #8 (failure debits nothing).
3. **`live_gateway_runs_validate_repair_reject`** — Asserts: an invalid-then-valid client output → ≤1 repair → accepted (the discipline is inherited from `createGateway`). Why: §6 structured-output discipline isn't re-implemented.
4. **`live_gateway_key_never_in_response`** — Asserts: with an `OPENROUTER_API_KEY` set in the fake client's env, no response/`providerMeta` field contains the key value. Why: rule #4 (credential env-only, never in a payload).

`apps/api/test/unit/model-gateway/select-gateway.test.ts`:
5. **`select_use_stub_returns_recorded_fake`** — Asserts: `selectGateway({useStub:true})` → a deterministic fake. Why: recorded default unchanged.
6. **`select_live_with_deps_delegates_to_live`** — Asserts: `selectGateway({useStub:false}, liveDeps)` → a gateway that calls the injected client. Why: the live path is now wired.
7. **`select_live_without_deps_throws_honest`** — Asserts: `selectGateway({useStub:false})` throws an error naming the missing live deps; never silently returns a fake. Why: honest-throw posture (no silent fallback masking a misconfig).

`apps/api/test/integration/boot/main-boot.test.ts` (extended):
8. **`boot_live_mode_builds_live_gateway`** — Asserts: `bootApp({env:{DOPPL_GATEWAY:'live', …}, openRouterClient: fakeClient})` boots + a run drives the fake client (no network); `recorded`/unset default unchanged. Why: §17 live rung reachable from boot; the env→live branch is exercised.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** none — ZERO new contract surface. `createLiveGateway` / `LiveGatewayDeps` / the `selectGateway` 2nd arg are apps/api-internal seam types (not `packages/contracts`/Appendix-A). Confirms PD acceptance "Demo introduces NO new contract surface."
- **Orchestrator doc rows to write hot (Step 9 routing):** none expected. A likely **Architecture-doc note** (§6/§17): the live gateway is `createLiveGateway` composing the P2.5 adapter behind `selectGateway`; `DOPPL_GATEWAY=live` builds it at boot (env-only credential, honest-throw on absent deps). Routed to phase-d's `ARCHITECTURE.md` copy (cody reconcile at phase-end). Also: this CLOSES carry-forward (a).
- **§2.5-seam (shared-contract) model touched?** No — no Appendix-A model defined/changed; no schema-snapshot test required.

## Things to flag at Step 2.5
1. **`selectGateway` signature growth: `createLiveGateway` + delegate (B) vs inline compose (C)?** My default vote: **B** — a named `createLiveGateway({registry, client})` mirrors `createFakeGateway`, is a cohesive unit-testable composition, and keeps `selectGateway` a thin 2-way multiplexer that delegates. `selectGateway` grows to `(selection, liveDeps?)`; `GatewaySelection` is unchanged (deps are a separate arg, not a field — keeps the env-free selection contract).
2. **Where does `createLiveGateway` live?** My default vote: **a new `model-gateway/live-gateway.ts`** (mirrors `stub/fake-gateway.ts`; keeps the real composition out of the stub file). `index.ts` re-exports it.
3. **Testing `main.ts`'s live branch without a network call.** `overrides.gateway` bypasses the whole branch, so the env→live wiring would be UNtested. My default vote: **add a minimal `BootOverrides.openRouterClient?`** (default `createOpenRouterClient(env)`) so the live-boot test injects a fake client and the branch is exercised + reachable. (Alternative: leave the 2-line branch untested — rejected; the live path is the point of this slice.)
4. **Build live deps lazily (only when `live`)?** My default vote: **yes** — `main.ts` constructs the registry + client ONLY when `mode==='live'`; a `recorded` boot instantiates no provider client (local-first stays dependency-light). `assertProviderCredentials` already runs in `loadConfig` regardless (existing behavior — don't change it here).
5. **`resolveSchema`?** My default vote: **omit it** — callers (critic/judge/runtime) supply the Zod schema in the request; `createGateway`'s default duck-type check handles it. No role→schema map is built in this slice (confirmed: no such production map exists; the schema is caller-supplied).

## Dependencies + sequencing
- **Depends on:** P2.2 (registry) · P2.4 (`createGateway`) · P2.5 (OpenRouter adapter + client) — all shipped. The fake path (P2.9) is the mirror.
- **Blocks / enables:** PD.4 rung-1 low-cap-live REAL execution; PD.5's operator-entered LIVE prompt path; PD.8's low-cap-live rehearsal. Closes carry-forward (a).
- **Independent of:** the PD.5 A/B/C decision (this is the gateway plumbing, not the per-run-problem→generation question).

## Estimated commit count
**1.** One cohesive composition+wiring unit (`createLiveGateway` + `selectGateway` delegation + `main.ts` live branch). NOT a new safety invariant (rule #4 credential boundary + rule #9 SDK-behind-port are pre-existing in the P2.5 adapter — this slice COMPOSES them without re-implementing), but it touches the provider/credential composition → **security-reviewer = invariant**. Split into 2 (the pure `createLiveGateway`+`selectGateway` unit, then the `main.ts` boot wiring) ONLY if the boot-wiring test infrastructure grows heavy — flag at Step 2.5.

## Lessons-logged candidates anticipated
- **Convention candidate** — "the live gateway is `createLiveGateway` = the P2.5 adapter fed into `createGateway` (the discipline is inherited, never re-implemented); `selectGateway` is a thin recorded-vs-live multiplexer with an honest-throw when live deps are absent (no silent fallback to the fake that would mask a misconfig)."
- **Architecture-doc note candidate** — §6/§17: `DOPPL_GATEWAY=live` composes the live gateway at boot from env (registry + OpenRouter client); the credential is env-only (closed over in the SDK client, in no payload); recorded is the default.
- **Future TODO — operational** — provider cost/latency envelope + model-route tuning (OQ-005/006) are post-spike; this slice wires the plumbing, not the route values.

## How to invoke
1. **Read this brief end-to-end** — especially the 5 Step-2.5 design questions (pre-voted).
2. **Run `/tdd live_gateway_selectGateway_wiring`** in the implementer session.
3. **Step 0 (Restate)** — confirm: compose the existing §6 pieces behind `selectGateway`; ZERO new contract surface; the live boot path testable without network.
4. **Step 1 (Identify files)** — confirm against "Files expected to touch."
5. **Step 2.5** — send the test-design write-up + the acceptance→test coverage map + answers to the 5 questions (or take defaults). If a real-provider design question surfaces that needs a call beyond these, flag the orchestrator (the lead asked to be looped in on real-provider design Qs).
6. **Step 9** — surface anything beyond the anticipated lessons-logged candidates; note this CLOSES carry-forward (a).

> **CWD — CRITICAL (the Bash cwd RESETS to the lead's root each call; `cd` is not a persistent guard):**
> - Read/Edit/Write → ABSOLUTE paths under `/Users/dreddy/Documents/GauntletAI/Capstone-phased/`.
> - TESTS / pnpm → `pnpm -C /Users/dreddy/Documents/GauntletAI/Capstone-phased/apps/api test ...` OR a single-call `cd /Users/dreddy/Documents/GauntletAI/Capstone-phased/apps/api && pnpm test ...`. A bare `pnpm test` from the reset cwd runs the KERNEL worktree's suite = FALSE GREEN.
> - git → `git -C /Users/dreddy/Documents/GauntletAI/Capstone-phased ...`.
> - Branch-check gate before the first edit AND the Step-10 commit: `git -C /Users/dreddy/Documents/GauntletAI/Capstone-phased branch --show-current` == `phase-d`.
