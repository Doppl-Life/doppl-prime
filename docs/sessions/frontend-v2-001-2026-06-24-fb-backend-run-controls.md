# frontend-v2-001 — Phase FB backend: run-controls (FB.0 · FB.1 · FB.2)

- **Date:** 2026-06-24
- **Phase:** FB (frontend-v2 backend — new run controls)
- **Track:** frontend-v2 (worktree `../Capstone-frontend-v2`, branch `track/frontend-v2`)
- **Role:** api implementer (`frontend-v2-api-implementer`)
- **Predecessor session:** _(none — first frontend-v2 implementer session)_
- **Successor session:** _(pending — a fresh team resumes FB.3/FB.4)_
- **Slices committed:** FB.0 `4bd2b4d` · FB.1 `a99a92e` · FB.2 `a6104fa`

## Why this session existed

Phase FB kickoff — the backend half of frontend-v2's "new run controls": extend the frozen
contract with the launcher's per-run controls (FB.0), make the local-model selector real behind the
ModelGateway (FB.1), and make the per-run model override load-bearing + safety-bounded (FB.2). Each
is gated by the Doppl safety invariants. FB.3 (mutagen operators) was dispatched then **abandoned
clean** (a user-approved round seal crossed the dispatch by one turn — no work lost, no commit).

## What was built

### FB.0 — RunConfig run-controls contract amendment (`4bd2b4d`)
**Files created:** `packages/contracts/src/run/generation-operator.ts` (closed 7-member `GenerationOperator`
enum, snake_case), `packages/contracts/src/run/model-route-override.ts` (`ModelRouteOverrideEntry`
strict `{provider,modelId}` + `ModelRouteOverride` = `z.partialRecord(ModelRole, …)`), the FB.0
schema-snapshot test.
**Files modified:** `run/run-config.ts` (+3 optional fields `generationOperators`/`generationBias`
[-1..+1]/`modelRouteOverride`), `version.ts` (`CURRENT_SCHEMA_VERSION` 5→6 + history), `index.ts`
(barrel), `__schema-snapshots__/field-sets.ts` (RunConfig 6→9), `test-fixtures/index.ts`
(+`validRunConfigWithControls`), 4 snapshot/version test constants in lockstep.
Additive/backward-compatible; `ScoringPolicy`/`FinalJudgeRubric`/`FinalJudgeAxis` byte-identical
(rule #6, asserted).

### FB.1 — ollama provider adapter + provider-dispatch (`a99a92e`)
**Files created:** `apps/api/src/model-gateway/adapters/ollama.adapter.ts` (keyless `OllamaClient` seam
— raw `fetch` POST `/api/chat`, `format:'json'` + candidate-independent schema instruction; HTTP
confined to `createOllamaClient`, rule #9; `createOllamaProviderCall` = raw output + `withRetry` +
0-token `ProviderCallError`, rule #8), + 2 unit test files.
**Files modified:** `live-gateway.ts` (provider-dispatching `providerCall`: `route.provider`→adapter;
`openai`/`web-search`→legacy OR passthrough; unknown→honest reject — the dispatch map IS the runtime
allowlist), `model-gateway/index.ts` (export), `main.ts` (keyless ollama client on the
`DOPPL_GATEWAY=live` branch).

### FB.2 — per-run modelRouteOverride clamped to a frozen allowlist (`a6104fa`)
**Files created:** `apps/api/src/model-gateway/model-route-override.ts` (`modelRouteOverrideViolation`
+ `applyRouteOverride` + `createRegistryOverlay`), `apps/api/src/config/model-route-allowlist.config.ts`
(frozen `MODEL_ROUTE_OVERRIDE_ALLOWLIST` — generation roles only; `final_judge` excluded), + 3 test
files (unit override · unit compose · integration route).
**Files modified:** `routes/runs.ts` (422 before append + `RunRoutesDeps.modelRouteOverrideAllowlist`),
`server.ts` (`BuildServerDeps` allowlist, fail-closed `{}`), `boot/composeRuntime.ts` (export
`mergePerRunConfig` + thread override + select per-run gateway), `boot/startRun.ts`
(`gatewayForOverride` pass-through), `main.ts` (`resolveGateway`→`{gateway, gatewayForOverride}` +
inject allowlist), `model-gateway/index.ts` (barrel).

## Decisions made

- **FB.0 `generationBias` range** = `-1..+1`, 0 neutral (symmetric dial; recorded as a generation input only).
- **FB.0 telemetry fields (FB.6–8) NOT folded** — each carries its own additive schemaVersion bump (keeps FB.0 tight, FB.6 secret-surface solo). Lead-ratified.
- **FB.0 `modelRouteOverride`** = `z.partialRecord(ModelRole, strict {provider,modelId})` (Context7-confirmed: `z.record(enum,…)` is exhaustive; `partialRecord` gives the partial override + still rejects unknown role keys).
- **FB.1 dispatch — Option A** (legacy passthrough): `{openrouter, ollama}` dispatched + explicit `{openai, web-search}`→legacy OR passthrough (preserves embedding/retrieval exactly as pre-FB.1); a genuinely-unknown provider → honest `ProviderCallError`. Embedding `embeddings` deferred (OpenAI-pinned).
- **FB.1 transport** = raw `fetch` (no SDK dependency), Context7-verified ollama REST shape.
- **FB.2 application seam** = per-run **registry overlay** built by a live-only `gatewayForOverride` factory threaded boot→infra→compose; no `ModelGatewayRequest` enrichment (no contract change).
- **FB.2 defense-in-depth (rule-#1-MANDATORY)** = the overlay re-clamps to the allowlist (applies permitted / ignores non-permitted → base) — so a direct-append `run.configured` bypassing the route 422 still can't widen. Mirrors the caps re-clamp; the bound is KERNEL-enforced, not route-only.
- **FB.2 overridable roles** = generation roles (`population_generator`, `fusion_synthesis`); `final_judge` HARD-EXCLUDED (rule #6); `critic`/`subtype_check`/`embedding`/`retrieval` not overridable (MVP). Fail-closed default.

## Decisions explicitly NOT made (deferred)

- **FB.3/FB.4** — abandoned clean (cross-in-flight seal); brief `frontend-v2-008` stays on disk for a fresh team. FB.3 Q1 (trusted-framing vs isolated-DATA) was flagged to the human, not yet ratified.
- **Wire the real OpenAI embedding adapter into the live dispatch** (FB.1's named Future TODO) — fixes the latent embedding-via-OR gap; out of FB.1 scope.
- **A permitted-models READ route** for FV.3's launcher picker (FB.2) — net-new surface, pairs with FV.3.
- **Widen the FB.2 allowlist to `critic`/`subtype_check`** — only if the launcher needs it.

## TDD compliance

**Clean.** All three slices were strictly test-first (RED → Step-2.5 review → GREEN → commit). No
implementation-before-test, no safety-critical TDD skips. FB.0/FB.2 carried the rule-#6/#1 invariant
pins as part of the same cycle; FB.1/FB.2 ran security-reviewer (INVARIANT) at Step 8 — all CLEAN.

## Cross-doc invariant audit (multi-track → memory check)

- **FB.0** changed an Appendix-A model: `RunConfig` +3 optional fields, new `GenerationOperator` enum,
  `CURRENT_SCHEMA_VERSION` 5→6. **Flagged at Step 9; orchestrator confirmed receipt** (its SHIP claimed
  the ARCH Appendix-A RunConfig row + §4 version prose + §6 generation-input note + `apps/api/CLAUDE.md`
  cross-doc row for its round commit). No drift.
- **FB.1, FB.2** — no contract change (provider stays an open string; allowlist is boot config; helpers
  are runtime). No model field change. ✓

No discipline violation.

## Reachability

- **FB.0** — `RunConfig` new fields reachable from the production boot validator `validateRunConfig`
  (proven by the across-layers deep-merge test). Runtime honoring is FB.1–FB.4.
- **FB.1** — `createOllamaProviderCall` reachable from `buildBootedApp` (live) → `resolveGateway` →
  `createOllamaClient` + `createLiveGateway` dispatch; invoked when a resolved route's provider is
  `ollama` (FB.2 supplies that per-run). `/wired` traced; the dispatch test exercises the real
  `createLiveGateway`→`createGateway` composition.
- **FB.2** — route 422 reachable from POST /runs (`main:253`→`server:97`→`runs.ts`); the honor path
  from `main:151` factory→infra→`startRun:78`→`compose:147`→`createLiveGateway(overlay)`→FB.1 dispatch.
  Both grep-traced from the production boot.

No tested-but-unwired gaps. (FB.1's ollama adapter being un-invoked by a default route is by design —
FB.2/per-run override supplies the ollama route.)

## Open follow-ups

1. **[Future TODO — cross-area]** Wire the existing `createOpenAIEmbeddingProviderCall` (P2.6) into the
   live dispatch to fix the latent embedding-via-OpenRouter gap (the live "novelty_scoring_degraded").
2. **[Future TODO — pairs with FV.3]** A read route exposing the permitted `{role→models}` so the
   launcher's model picker can populate from the frozen allowlist.
3. **[Future TODO — tuning]** Widen the FB.2 allowlist to `critic`/`subtype_check` if the launcher wants it.
4. **[Resume]** FB.3 (mutagen operators — trusted-framing design, brief `frontend-v2-008`, Q1 awaiting
   human ratification) + FB.4 (diverge/converge SAFETY-INVARIANT SOLO slice) — a fresh team picks up.
5. **[Convention — LESSONS, routed at Step 9]** integration route tests need a UNIQUE id prefix vs the
   shared testcontainer DB (a generic `id-N` `newId` collides on append → 500 only in the full suite).

_(Items 1–3,5 were routed hot to the orchestrator at Step 9 for its round commit — listed here for the trail.)_
