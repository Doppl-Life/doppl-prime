# /tdd brief — cap_maxima_read_endpoint_and_form_clamp

## Feature
PD.18 — fix the **cap-default 422**: `RunConfigPanel`'s `DEFAULT_FORM` (pop 18 / gen 5 / energy 12000) + the hardcoded `CAP_CEILING` (20 / 8 / 20000) EXCEED a low `.env` ceiling (pop 12 / gen 6 / energy 1000) → `POST /runs` 422 `cap_override_exceeds_max`. Add a **read-only cap-maxima endpoint** exposing the API's `defaultConfig.caps` (the validated maxima); the `RunConfigPanel` **fetches it + clamps** `CAP_CEILING`/`DEFAULT_FORM` to the REAL ceiling. The form comment already anticipates this ("MIRRORS the API's `defaultConfig.caps` … the maxima when a config-maxima endpoint exists"). api + web hats. ZERO frozen-contract change (a new read route, like `/problem-sets`).

## Use case + traceability
- **Task ID:** PD.18 (demo-polish; the operator-config 422 fix)
- **Architecture sections it implements:** `ARCHITECTURE.md §11` (REST read route), `§12` (the operator run-config panel), `§5` (caps — rule #1 kernel/route-authoritative).
- **Origin:** user demo-polish round (hands-on testing, 2026-06-23 via lead). `runConfigForm.ts` `CAP_CEILING`/`DEFAULT_FORM`; `runs.ts` `overCapField` 422. The operator-prompt path is unaffected (sends no caps — only the RunConfigPanel path 422s).

## Acceptance criteria (what "done" means)
- [ ] A NEW read-only route returns the API's validated cap maxima (the boot `defaultConfig.caps` / `config.caps`) — zero contract surface (a plain serializable cap object), registered in `buildServer` alongside `/problem-sets`, `/demo/fallback-ladder`. Read-only (rule #2).
- [ ] `runClient` gains a typed fetch for it (web-local response type, not a frozen model).
- [ ] `RunConfigPanel` fetches the maxima on mount and **clamps** the cap inputs' max + the default values to the REAL ceiling — no static over-ceiling default remains, so a default-config `POST /runs` no longer 422s. Fallback to the existing static `CAP_CEILING` if the fetch fails (never block the form).
- [ ] Rule #1 stays kernel/route-authoritative: the route's `overCapField` STILL rejects an above-maxima override (422) — the clamp is a UX convenience, never a 2nd cap authority.
- [ ] Test-first: the route returns the configured maxima (integration); the form clamps to fetched maxima + falls back on fetch failure (web unit).
- [ ] `/preflight` clean (api + web).

## Wiring / entry point (Step 7.5)
The route registers on the shared Fastify server (`buildServer`), reading the boot `config.caps`/`defaultConfig.caps` (the same maxima `overCapField` enforces). The `RunConfigPanel` calls `runClient.<getCapMaxima>()` on mount → clamps the form. Confirm the served maxima == the authoritative `overCapField` ceiling (so the form can't offer a value the route rejects).

## Files expected to touch
**New (api):** a cap-maxima route (e.g. `apps/api/src/routes/cap-maxima.ts`) + its integration test; registered in `server.ts`.
**Modified (web):** `apps/web/src/data/runClient.ts` (the fetch + web-local type); `apps/web/src/components/run/runConfigForm.ts` + `RunConfigPanel.tsx` (fetch + clamp); their tests.

## RED test outline (Step 2)
1. **`cap_maxima_route_returns_configured_caps`** (api integration) — the route returns the boot `config.caps` (the maxima `overCapField` uses). RED: route absent. Why: §11/§5.
2. **`run_config_form_clamps_to_fetched_maxima`** (web unit) — given fetched maxima (pop 12/gen 6/energy 1000), the form's max + defaults clamp to them (no over-ceiling default). RED: static CAP_CEILING only. Why: §12 the 422 fix.
3. **`run_config_form_falls_back_on_fetch_failure`** (web unit) — fetch rejects → the form still renders (static fallback), never blocks. Why: robustness.
4. **`above_maxima_override_still_422`** (api — reuse/confirm) — an above-maxima `POST /runs` is still rejected (rule #1 unchanged). Why: §5 — the clamp is not a 2nd authority.

## Cross-doc invariant impact
- **Model field changes:** none. ZERO frozen-contract change (a read route returning a plain cap object; web-local fetch type).
- **Orchestrator doc rows (Step 9):** ARCH §11 one-line addendum (the cap-maxima read route) + the §11 route list — orch. No cross-doc invariant.

## Things to flag at Step 2.5
1. Route shape/name (`GET /config/caps`? `/cap-maxima`?) + the exact source (`defaultConfig.caps` vs `config.caps` — must equal the `overCapField` maxima).
2. Clamp semantics: clamp the input `max` AND the default value; keep the rule-#1 boundary (≤ maxima allowed, > rejected) consistent with the route.
3. Fetch-failure fallback to the static `CAP_CEILING` (don't block the form on a transient fetch error).

## Dependencies + sequencing
- **Depends on:** the API `defaultConfig.caps` (`main.ts`/boot) · `runConfigForm.ts`/`RunConfigPanel`.
- **Blocks:** nothing (demo-polish); pre-merge polish round.
- **Sequencing:** after PD.17.

## Estimated commit count
**1** (or 2 if api-route / web-clamp split cleanly). Non-safety (a read route + a UX clamp); rule #1 unchanged (route still authoritative) → no security-reviewer required unless the route is judged invariant-touching (it isn't — read-only maxima, the authoritative check is untouched).

## Lessons-logged candidates anticipated
- Possibly: "a client form mirroring a server ceiling must FETCH the real maxima (a static mirror drifts → 422); the server stays the sole cap authority."

## How to invoke
1. Read this brief + `runConfigForm.ts`/`RunConfigPanel.tsx`, `runs.ts` (`overCapField`), the boot `config.caps` (`main.ts`).
2. `/tdd cap_maxima_read_endpoint_and_form_clamp` (api + web hats).
3. Step 0 — confirm: a read-only cap-maxima route + the form fetch/clamp; rule #1 authoritative unchanged; ZERO contract.
4. Step 2.5 — Q1–Q3.
5. Step 9 — flag the ARCH §11 addendum (orch) + the route name + bundle/split.
