# /tdd brief — wire_pd4_fallback_ladder_and_cap_override_into_production

## Feature
PD.12 — wire PD.4's two built-but-orphaned demo helpers into production so they're reachable from a production entry point (closes the `/phase-exit PD` reachability BLOCK; user-decided option A): (1) `applyDemoCapOverride` → the POST /runs write path (a demo cap-lowering convenience that only-LOWERS within validated maxima and defers to the authoritative `overCapField`/kernel clamp — rule #1 stays kernel-enforced); (2) `createFallbackLadder` → a read-only API route that exposes the 3 rung descriptors, consumed by a web operator panel (the web cannot import `apps/api` internals — layer rule). Completes PD.4's intended integration. PLUS a SEPARATE unbundled commit: dedup `main.ts`'s `REQUIRED_SECRET_ENV` against `registry.ts`'s `REQUIRED_CREDENTIAL_ENV` (latent rule-#4 drift).

## Use case + traceability
- **Task ID:** PD.12 (completes PD.4's deferred production wiring; clears the `/phase-exit PD` reachability finding — user-decided option A, 2026-06-23 via lead)
- **Architecture sections it implements:** `ARCHITECTURE.md §17` (the operator-driven fallback ladder + the demo cap-lowering override), `§11` (REST routes — the new read-only ladder endpoint + the POST /runs cap path), `§12` (the dashboard operator surface), `§5` (caps rule #1 — the override defers to the authoritative clamp), `§14` (rule #4 — the `main.ts`/`registry.ts` secret-env dedup).
- **Why:** `docs/audits/PD-reachability.md` — `createFallbackLadder` (`runtime/demo/fallback-ladder.ts`) + `applyDemoCapOverride` (`runtime/demo/demo-cap-override.ts`) + the `runtime/demo/index.ts` type exports are reachable only from tests. The round-2 "wiring deferred to PD.5/PD.6" never landed. Wiring them clears the gate (no waiver).
- **Integration map (Explore-verified):**
  - **POST /runs** (`apps/api/src/routes/runs.ts`): `overCapField(caps, maxima)` (line ~52) validates `caps ≤ maxima` (returns the over-cap field or null); the handler (line ~117) 422s on an over-cap. `applyDemoCapOverride(maxima, overrides): RunCaps` (`demo-cap-override.ts:14`) lowers within maxima + re-validates via `RunCaps.parse`. **Insertion: after `validateRunConfig` succeeds, BEFORE the `overCapField` check** — apply the override, then the authoritative check still runs (rule #1).
  - **`createFallbackLadder(config): FallbackLadder`** (`fallback-ladder.ts:66`) — pure, client-serializable; `{active(), select(kind), advance()} → RungDescriptor` (`LowCapLiveRung{caps}` | `PreparedRung{runConfig}` | `ReplayRung{replayRunId}`, all frozen). Config inputs: `maxima` (boot caps), `demoOverrides`, `preparedRunConfig` (a problem set), `replayRunId` (the committed `demo-recorded-001`).
  - **Web** (`apps/web/src/`): `Dashboard.tsx` mounts `RunConfigPanel`/`OperatorPromptPanel`/`StopControl`; the data-client/run-store is how the web gets data. The web CANNOT import `createFallbackLadder` (it's `apps/api`) → it consumes the descriptors via the new API route.
  - **Dedup:** `main.ts:51` `REQUIRED_SECRET_ENV` == `registry.ts:19` `REQUIRED_CREDENTIAL_ENV` (identical 3 values); main.ts already imports from model-gateway → import the export, delete the dup (no layering concern).

## Acceptance criteria (what "done" means)
- [ ] **POST /runs applies the demo cap-override** (when the request carries the demo-override input — shape per Step-2.5 Q1): `applyDemoCapOverride` lowers the caps within maxima, THEN the authoritative `overCapField` check still runs — an above-maxima override is STILL 422'd (rule #1 unchanged; the override only-LOWERS, never raises). `applyDemoCapOverride` is now reached from the POST /runs production handler.
- [ ] **A read-only API route exposes the fallback-ladder rung descriptors** (path per Step-2.5 Q2) — it calls `createFallbackLadder(...)` and returns the 3 serializable rungs (low-cap-live caps · prepared runConfig · replay runId). `createFallbackLadder` + the `runtime/demo` type exports are now reached from a production route. Read-only (no append, rule #2).
- [ ] **A web operator panel** (mount per Step-2.5 Q3) fetches the rung descriptors + renders the 3 rungs + lets the operator select/advance (client-side) + on Start POSTs the active rung's config (low-cap-live → `startRun` with the lowered caps; prepared → the prepared runConfig; replay → mounts the replay run). Read-only over projections; never imports `apps/api` internals.
- [ ] **Reachability re-run is CLEAR** — `applyDemoCapOverride`, `createFallbackLadder`, and the `runtime/demo/index.ts` type exports are all reachable from a production entry (POST /runs · the ladder route · the web panel). No orphaned demo exports remain.
- [ ] **SEPARATE unbundled commit (rule-#4 dedup):** `main.ts` imports `REQUIRED_CREDENTIAL_ENV` from `./model-gateway/registry` and deletes the duplicate `REQUIRED_SECRET_ENV` — the event-store secret-scrub now single-sources the credential list (a future credential add can't silently escape redaction). The existing scrub behavior is unchanged (same 3 values today).
- [ ] All new/changed tests pass (real-PG integration for the route + POST /runs; web component test for the panel); `/preflight` clean per touched area.

## Wiring / entry point (Step 7.5)
- `applyDemoCapOverride` — reached from the **POST /runs handler** (`routes/runs.ts`), applied before the authoritative `overCapField`.
- `createFallbackLadder` — reached from the **new read-only GET route** (registered on the shared Fastify server), which the web fetches.
- The **web panel** is mounted in the Dashboard shell (operator surface).
- Confirm at Step 7.5 that all three are reached from REAL production entries (route handlers + the mounted panel), not test-only — this is the whole point (clears the reachability gate).

## Files expected to touch
**New:**
- `apps/api/src/routes/<demo-ladder route>.ts` (or extend an existing routes module) — the read-only GET endpoint calling `createFallbackLadder`.
- `apps/web/src/components/demo/FallbackLadderPanel.tsx` (or extend `OperatorPromptPanel.tsx` — Step-2.5 Q3) — the operator UI.
- Test files (route integration · POST /runs cap-override integration · web component).

**Modified:**
- `apps/api/src/routes/runs.ts` — apply `applyDemoCapOverride` in POST /runs before the cap check.
- `apps/web/src/.../Dashboard.tsx` (or the run-config area) — mount the panel; the data-client/run-store for the fetch.
- `apps/api/src/main.ts` — **(separate commit)** import `REQUIRED_CREDENTIAL_ENV`, delete `REQUIRED_SECRET_ENV`.

If implementation needs files beyond this list, flag at Step 2.5.

## RED test outline (Step 2)
apps/api (real-PG integration):
1. **`post_runs_applies_demo_cap_override`** — POST /runs with a demo-override lowering caps → the run is configured with the LOWERED caps (recorded==executed). Why: §17/§5 the override only-LOWERS.
2. **`post_runs_demo_override_still_rejects_above_maxima`** — a demo-override attempting to RAISE a cap above maxima is still 422'd by `overCapField` (the override can't bypass the authoritative clamp). Why: rule #1 (kernel/route stays the sole authority — LESSONS §89).
3. **`demo_ladder_route_returns_three_rungs`** — GET the ladder route → 3 serializable rung descriptors (low-cap-live caps · prepared runConfig · replay runId); read-only (appends nothing). Why: §17/§11; `createFallbackLadder` reached from production.
apps/web (component):
4. **`fallback_ladder_panel_renders_and_drives_rungs`** — the panel fetches + renders the 3 rungs, select/advance updates the active rung, Start posts the active rung's config. Why: §12/§17 operator UX.
(dedup — no new test: the existing `env-example-drift` + the redaction tests cover the credential list; confirm the scrub still redacts all 3 after the import.)

## Cross-doc invariant impact
- **Model field changes:** none. ZERO new contract surface (composes existing `applyDemoCapOverride`/`createFallbackLadder`/`RunCaps`/`RunConfig`; the route returns existing descriptor types; the web reads them). If POST /runs gains a demo-override request FIELD, it's a route-body shape (not an Appendix-A model) — confirm it's not a frozen-contract change at Step-2.5.
- **Orchestrator doc rows to write hot (Step 9):** an Architecture-doc note (§17/§11) — the fallback ladder + cap-override are now wired (route + POST /runs + web panel); + tick the PD reachability gate row + re-seal. Flag the new route + the demo-override field.
- **§2.5-seam model touched?** No.

## Things to flag at Step 2.5
1. **Demo cap-override request shape.** (a) a `demoCaps`/`demoOverride` field on the POST /runs body that the route feeds to `applyDemoCapOverride`; (b) the web just sends already-lowered caps in the normal `RunConfig` (then `applyDemoCapOverride` isn't reached from the route — does NOT clear the finding). My default vote: **(a)** — an explicit demo-override field so `applyDemoCapOverride` is genuinely reached from POST /runs (the reachability goal); keep it a route-body field, not a frozen-contract change.
2. **Ladder route path + shape.** e.g. `GET /demo/fallback-ladder` returning `RungDescriptor[]`, or `GET /runs/demo-ladder`. My default vote: a dedicated read-only `GET /demo/fallback-ladder` returning the 3 descriptors (the api assembles the ladder config from boot caps + the problem sets + the committed `demo-recorded-001` replay id). Confirm where the prepared runConfig + replay id come from.
3. **Web panel: extend `OperatorPromptPanel` or new `FallbackLadderPanel`?** My default vote: **a new `FallbackLadderPanel`** mounted alongside `OperatorPromptPanel` (keeps the operator-prompt panel focused; the ladder is a distinct 3-rung workflow). Either is fine — keep it read-only over the route + projections.
4. **Commit structure.** My default: (1) feat(api) — the cap-override wiring + the ladder route; (2) feat(web) — the FallbackLadderPanel; (3) **fix — the `main.ts` dedup, UNBUNDLED** (rule-#4 safety hygiene, never bundled with feature work). Confirm or split further.

## Dependencies + sequencing
- **Depends on:** PD.4 (`createFallbackLadder` + `applyDemoCapOverride`, shipped); the POST /runs route (LESSONS §56); the problem sets (PD.5); the committed `demo-recorded-001` fixture (PD.8a).
- **Blocks:** the `/phase-exit PD` reachability re-run → gate CLEAR → `/orchestrate-end`.

## Estimated commit count
**2–3.** (1) feat(api) cap-override + ladder route [cap-path → **security-reviewer (invariant) at Step 8**: confirm the override only-LOWERS + the authoritative `overCapField` still rejects above-maxima, rule #1]; (2) feat(web) FallbackLadderPanel; (3) **fix(api) `main.ts` REQUIRED_SECRET_ENV dedup — SEPARATE/UNBUNDLED** (rule-#4 safety, never bundled with feature). The cap-override wiring touches rule #1 but defers to the authoritative clamp (not a new authority) → invariant-reviewed feature, not a must-be-solo safety pin; the dedup IS rule-#4 hygiene → its own commit.

## Lessons-logged candidates anticipated
- **Convention candidate** — "a built-but-orphaned helper is wired to a REAL production entry to clear a reachability gate; a cross-app helper the consumer can't import (web ✗→ apps/api) is exposed via a read-only route, not duplicated."
- **Architecture-doc note** — §17/§11: the fallback ladder + cap-override are production-wired (route + POST /runs + web panel).

## How to invoke
1. Read this brief + `docs/audits/PD-reachability.md` + the integration points (`routes/runs.ts` cap path · `fallback-ladder.ts` · the Dashboard shell).
2. Run `/tdd wire_pd4_fallback_ladder_and_cap_override_into_production` (`apps/api` + `apps/web` hats; real-PG integration for the api).
3. Step 0 (Restate) — confirm: wire to clear the reachability gate; cap-override only-LOWERS + defers to the authoritative clamp; dedup is a separate unbundled commit.
4. Step 2.5 — Q1–Q4.
5. Step 8 — security-reviewer (invariant) on the cap-path wiring.
6. Step 9 — flag the new route + the demo-override field + the dedup commit; note this clears the reachability finding (I re-run the reachability auditor before re-sealing `/phase-exit PD`).
