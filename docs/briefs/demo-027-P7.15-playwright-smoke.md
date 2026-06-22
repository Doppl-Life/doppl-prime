# /tdd brief — playwright_happy_path_smoke

## Feature
The **Playwright happy-path smoke** (§16, REQ-level acceptance) — ONE end-to-end browser test that drives the mounted dashboard shell (P7.14) through the demo's core narrative: **start (or load a run) → live events fold → the final-idea proof panel renders + its links resolve**. Plus a small **ModeBanner live/replay visual** assertion (the hatch/indicator). Runs against the Vite dev server with a **fixture/mocked data-client** (Playwright route-interception of the REST projections + an SSE fixture stream) — NOT the live backend (that lands at the demo→cody merge). This is the frontend acceptance surface shown to a room, proven to actually render end-to-end.

## Use case + traceability
- **Task ID:** P7.15 (Playwright happy-path smoke)
- **Architecture sections:** `ARCHITECTURE.md §16` (one Playwright happy-path smoke: start → live events → final-idea links resolve), `§12` (the dashboard render; live/replay).
- **Related context:** **NOT a unit-TDD slice** — this is the e2e smoke (the deliverable IS the test). Drives the P7.14 shell + the P7.5–P7.13 panels against **mocked endpoints** (Playwright `page.route` interception serving the web-local fixtures + a synthetic SSE stream). The live-backend e2e is a merge/CI item. Reuses the existing fixtures (test/fixtures/{events,lineage}) where possible.

## Acceptance criteria (what "done" means)
- [ ] **One Playwright spec** drives the dashboard happy path: the app loads → a run's projections/events are served (mocked) → the **lineage renders** → **live events fold** (the activity feed / a panel's state advances as the SSE fixture emits) → the operator navigates to the **final-idea proof panel** → its **proof links resolve** (lineage/critics/checks/score/energy sections present for the selected winner)
- [ ] **ModeBanner live/replay** is asserted (the live indicator / replay hatch visual shows per the served mode)
- [ ] The smoke runs against the **Vite dev server + mocked REST/SSE** (route-interception serving fixtures) — deterministic, no live backend, no network to a real server
- [ ] **Playwright config** (`playwright.config.ts`) + the `webServer` (Vite) wiring exist; the spec is in `apps/web/test/e2e/`
- [ ] The smoke is the §16 happy-path ONLY (not exhaustive) — start→live→final-idea-links; it must not flake (deterministic fixtures + explicit waits on rendered assertions, never arbitrary sleeps)
- [ ] If Playwright browsers aren't installed in this env, the spec + config still type-check/lint and the run is documented as a CI/integration step (flag at Step 2.5) — the spec is the deliverable

## Wiring / entry point (Step 7.5)
**The dev server + the mounted App (P7.14 Dashboard) is the entry.** The smoke drives the real app root through a browser; the data-client is mocked via Playwright route interception. No production code wiring — it's a test over the shipped shell.

## Files expected to touch
**New:**
- `apps/web/playwright.config.ts` — Playwright config (the Vite `webServer`, the e2e testDir, projects)
- `apps/web/test/e2e/dashboard-smoke.spec.ts` — the happy-path spec (mocked REST/SSE → lineage → live fold → final-idea links → ModeBanner)
- `apps/web/test/e2e/fixtures/` (if needed) — the served run projections + the SSE event sequence fixture (reuse test/fixtures where possible)

**Modified:**
- `apps/web/package.json` — add `@playwright/test` (devDep) + an `e2e` script (flag the manifest change at Step 9)

If implementation needs files beyond this, **flag at Step 2.5**.

## RED test outline (the smoke itself)
This slice's "test" IS the deliverable. The spec asserts, in order:
1. **app loads** — the dashboard shell mounts (ModeBanner + at least one panel visible).
2. **run loads** — mocked GET projections (runs/lineage/events/candidate) serve a fixture run; the lineage graph renders its nodes.
3. **live events fold** — the SSE fixture stream emits events; a live-updating surface (activity feed / a status) advances (assert a post-event state, not a sleep).
4. **final-idea links resolve** — navigate to the final-idea panel; the winner + its proof sections (lineage/critics/checks/score/energy) are present and reference the winner candidate.
5. **ModeBanner** — the live (or replay) indicator shows per the served mode.

## Cross-doc invariant impact
- **Model field changes:** none. **§2.5-seam:** none. (Mocks serve the frozen-contract-shaped fixtures.)
- **Orchestrator doc rows (Step 9):** the `@playwright/test` manifest change — flag at Step 9 (not a cross-doc invariant). Possibly a tiny LESSONS note on the mocked-e2e harness. I author hot if it adds.

## Things to flag at Step 2.5
1. **Mock strategy.** Default: Playwright `page.route` intercepts the REST projection endpoints (serve the web-local fixtures) + a synthetic SSE response (a `text/event-stream` body emitting the fixture envelopes). The app's injected data-client defaults to the real fetch/EventSource against the dev server, which the routes intercept — no app code change. Confirm (vs an app-level e2e fixture-injection hook).
2. **Playwright run feasibility.** Default: write the spec + config; run it if Playwright browsers install in this env, else type-check/lint it + document the run as a CI/integration step (the spec is the deliverable — like the P6.11 notebook). Confirm doc-if-unrunnable.
3. **Determinism.** Default: the SSE fixture emits a fixed sequence; the spec waits on rendered assertions (locators) not timers; the final-idea winner is a fixture candidate with `status:'selected'`. Confirm no arbitrary sleeps.

## Dependencies + sequencing
- **Depends on:** P7.14 (the mounted shell — the e2e drives it) + all P7.5–P7.13 panels + the fixtures. Independent of apps/api (mocked).
- **Blocks:** nothing — completes Phase 7. (Phase 7 exit gate after this.)

## Estimated commit count
**1.** The e2e smoke (spec + config + the manifest dep). Not safety-invariant. Step-8: code-quality phase-boundary; security n/a (a test). **This completes Phase 7** → after it lands, `/phase-exit P7` is in scope (orchestrator-dispatched).

## Lessons-logged candidates anticipated
- Possibly a tiny note: "the e2e smoke mocks the data-client via Playwright route-interception (REST fixtures + a synthetic SSE stream) — deterministic, no live backend; the spec is the deliverable, the run is CI/integration if browsers are absent." I author hot if it adds beyond the existing test conventions.

## How to invoke
> web session oriented. cwd `apps/web/`. Stage only `apps/web/...` (+ package.json for `@playwright/test`). (Round-3 web slice 10 — the §16 e2e smoke; completes Phase 7.) NOTE: this is an **e2e slice, not red-green unit TDD** — the spec IS the test; the "RED outline" is the smoke's assertion sequence.
1. **Author the Playwright spec + config** (the smoke scenario above).
2. **Step 2.5** — answer the 3 questions (esp. Q2 run-feasibility, Q1 mock strategy), send the scenario + assertion map.
3. **Step 9** — surface the `@playwright/test` manifest change + the run status (ran / documented-for-CI). After this lands I dispatch `/phase-exit P7`.
