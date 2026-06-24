# /tdd brief — app_shell_and_router

## Feature
Add `react-router-dom` + a global **AppShell** (the `◆ Doppl` wordmark, a ModeBanner slot, a dark/high-contrast/light theme toggle persisted to localStorage) wrapping an `<Outlet/>`, and a route table: `/` (S0 home) · `/launch` (S1) · `/runs/:id` (S2 organism, live) · `/runs/:id/replay` (S2 replay) · `/runs/:id/final` (S5). Today `apps/web` has NO router — a single `<Dashboard runId="">` mounts and behaves as an internal mini-router (empty → launcher+run-list, set → observatory). FV.1 externalizes that to real URL routes **reusing the existing tested Dashboard + data layer** (runClient, sseStream, runStore) — it does NOT rebuild the screens (S0/S1/S5 get their dedicated DS screens in FV.2/FV.3/FV.7; the 3-pane S2 in FV.4). The working demo flow (type problem → Start → live → Stop → replay) must keep working through the new routes.

## Use case + traceability
- **Task ID:** FV.1
- **Architecture sections it implements:** `ARCHITECTURE.md §12` (frontend dashboard — the shell, live/replay mode indicator, accessibility/high-contrast/projector-legibility), `ARCHITECTURE.md §11` (backend API & flows — the routes the screens consume read-only via the existing runClient)
- **Related context:**
  - Phase plan: `docs/planning/frontend-v2-phase-plan.md` (FV.1 row — router + global chrome + theme toggle; FV.2–FV.9 build the screens).
  - FV.0 (`9a6be17`) shipped the `ds/` component vocabulary (`apps/web/src/components/ds/`) — FV.1+ import from `ds/index.ts`. The wordmark/theme-toggle can use the DS `Button`.
  - **Reuse (do NOT rebuild):** `src/App.tsx` (memoizes `runClient` at app level — survives route changes), `src/routes/Dashboard.tsx` (the monolithic observatory — owns SSE/store/lineage/health wiring incl. the PD.20 re-fetch, apps/web LESSONS 13), `src/data/runClient.ts`, `src/data/sseStream.ts`, `src/state/{runStore,reducer,resync}.ts`, `src/components/feedback/ModeBanner.tsx` (reusable). The data layer is route-agnostic: `runClient` is app-level; the `store` recreates per `(runId, mode)`.
  - Theme: `src/styles/tokens/colors.css` defines `:root` (dark), `:root.hc` (high-contrast), `:root.light` — but the classes are **never applied today** (no toggle, no persistence). FV.1 wires the toggle.
  - `react-router-dom` is **NOT yet a dependency** (`apps/web/package.json`) — FV.1 adds it (Step-2.5 Q2 for the version).
  - Safety / layer rule #9 (frontend): read-only over projections; never mutate authoritative state (commands go via the existing runClient REST); never treat SSE as truth (the store resyncs from last sequence); never import backend internals; never ship provider keys to the client. FV.1 changes only presentation/routing — these all hold unchanged.

## Acceptance criteria (what "done" means)
- [ ] `react-router-dom` added to `apps/web/package.json`; `App.tsx` wraps the app in a router (BrowserRouter) and exposes `runClient` to routes via a `RunClientProvider` context (`useRunClient()`), keeping the single app-level memoized instance.
- [ ] An `AppShell` layout component renders the global chrome on every route: the `◆ Doppl` wordmark (links to `/`), a **ModeBanner slot**, a **theme toggle**, and an `<Outlet/>` for route content.
- [ ] **Routes resolve to the right component:** `/` → home (the existing Dashboard's launcher+run-list behavior, `runId=""`), `/launch` → the launcher (Step-2.5 Q1 — interim reuse vs placeholder), `/runs/:id` → the Dashboard observatory (`runId` from `useParams`, mode `live`), `/runs/:id/replay` → Dashboard (mode `replay`), `/runs/:id/final` → the final-idea view (interim: Dashboard, which already renders `FinalIdeaPanel` on terminal — FV.7 builds the dedicated S5). An unknown path → a not-found/redirect-to-`/`.
- [ ] **Theme toggle** cycles dark → high-contrast → light, applies the class to `document.documentElement` (`:root.hc`/`:root.light` per the DS tokens), **persists** to `localStorage['doppl-theme']`, and **restores** on app boot (dark default when unset/invalid).
- [ ] **Navigation actions wired to the router:** starting a run (the launcher's `onStarted`) → `navigate('/runs/:id')`; opening/replaying a run from the run-list → `navigate('/runs/:id')` / `navigate('/runs/:id/replay')` — replacing the Dashboard's internal `observeLive`/`observeReplay` state-switching with URL navigation (the observed run + mode now come from the URL, not internal state).
- [ ] The existing data layer is **unbroken**: `runClient` app-level; the per-`(runId,mode)` `store` + SSE wiring + the PD.20 lineage/health re-fetch still drive the observatory; the demo flow works end-to-end through the routes. No SSE/store regression.
- [ ] web unit suite green (routing + theme + nav tests added); the e2e smoke updated for the route-based nav if needed; `/preflight` clean. **Backend: none** (read-only over the existing routes; zero contract surface).

## Wiring / entry point (Step 7.5)
`src/main.tsx` → `src/App.tsx` (the BrowserRouter + RunClientProvider root) → `AppShell` (layout route) → the route table → the existing `Dashboard` mounted at the run routes. The wordmark + theme toggle live in `AppShell` (reachable on every route); the launcher/run-list nav actions call `useNavigate()`. Confirm the demo path is reachable through real URLs (`/` → start → `/runs/:id` → `/runs/:id/replay`), not just internal Dashboard state.

## Files expected to touch
**New:**
- `src/components/app/AppShell.tsx` — global chrome (wordmark + ModeBanner slot + theme toggle + `<Outlet/>`)
- `src/components/app/ThemeToggle.tsx` + a theme hook/util (apply class + localStorage)
- `src/app/router.tsx` (or in `App.tsx`) — the route table
- `src/data/RunClientProvider.tsx` — the `runClient` context + `useRunClient()`
- Test files: `test/unit/app/{router,AppShell,ThemeToggle}.test.tsx`

**Modified:**
- `src/App.tsx` — BrowserRouter + RunClientProvider + the route table (replace the direct `<Dashboard>` mount)
- `src/routes/Dashboard.tsx` — read `runId`/`mode` from props supplied by the route (useParams), and route its launcher/run-list nav callbacks through `useNavigate()` instead of internal `observeLive`/`observeReplay` state (the minimal router integration — NOT a screen rebuild)
- `apps/web/package.json` — `react-router-dom` dependency
- `test/e2e/dashboard-smoke.spec.ts` — update navigation if the route change moves the entry (keep it green)

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)
Tests in `test/unit/app/` (`// @vitest-environment happy-dom`, `@testing-library/react` + `MemoryRouter`):

1. **`test_route_runs_id_mounts_observatory`** — Asserts: `MemoryRouter initialEntries={['/runs/run_1']}` renders the Dashboard observatory for `run_1` (runId from `useParams`, mode `live`). Why: §12 route → screen mapping.
2. **`test_route_replay_sets_replay_mode`** — Asserts: `/runs/run_1/replay` renders the observatory in **replay** mode (the ModeBanner shows replay). Why: §12 live/replay indicator from the route.
3. **`test_route_root_shows_home`** — Asserts: `/` renders the home (launcher + run-list affordances). Why: §12 home route.
4. **`test_unknown_route_redirects_home`** — Asserts: an unknown path renders not-found / redirects to `/`. Why: route-table completeness.
5. **`test_app_shell_chrome_on_every_route`** — Asserts: the `◆ Doppl` wordmark + theme toggle render on `/` AND `/runs/:id` (the shell wraps all routes). Why: §12 global chrome.
6. **`test_theme_toggle_applies_class_and_persists`** — Asserts: toggling cycles dark→hc→light, sets `document.documentElement.className` accordingly, and writes `localStorage['doppl-theme']`. Why: §12 high-contrast/projector theme.
7. **`test_theme_restored_on_boot`** — Asserts: with `localStorage['doppl-theme']='hc'` preset, the app boots with `:root.hc` applied; an unset/invalid value → dark default. Why: persistence + safe default.
8. **`test_start_run_navigates_to_run_route`** — Asserts: the launcher's `onStarted(runId)` triggers `navigate('/runs/'+runId)` (inject a fake runClient/navigate). Why: command→navigation wiring (no internal state switch).
9. **`test_run_list_open_and_replay_navigate`** — Asserts: opening a run navigates to `/runs/:id`; replay → `/runs/:id/replay`. Why: run-list nav via the router.
10. **`test_run_client_context_single_instance`** — Asserts: `useRunClient()` returns the app-level instance across routes (not recreated per route). Why: data-layer reuse (one client per app load).

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** NONE — pure presentation/routing; consumes frozen `@doppl/contracts` + the existing read routes; no contract surface.
- **Orchestrator doc rows to write hot (Step 9 routing):** an `ARCHITECTURE.md §12` note — the dashboard is now a multi-route app (S0/S1/S2/S5 + replay) behind an AppShell with a theme toggle; the observed run + mode are URL-derived; the existing data layer is route-agnostic. A `apps/web/LESSONS` convention candidate is likely (router integration: URL as the observed-run source of truth, theme on `document.documentElement` + localStorage, the existing monolithic screen mounted per-route until the dedicated screens land). Orchestrator writes both hot.
- **shared-contract seam model touched?** No.

## Things to flag at Step 2.5
1. **Dashboard reuse vs split.** My default vote: **reuse the existing Dashboard at the run routes; do NOT split S0/S1/S5 out in FV.1** (that's FV.2/FV.3/FV.7). `/` mounts the Dashboard's existing launcher+run-list home (`runId=""`); `/launch` interim-redirects to `/` (or a thin route) until FV.3 builds the dedicated launcher; `/runs/:id/final` interim-mounts the Dashboard (it already shows `FinalIdeaPanel` on terminal) until FV.7. This preserves the working demo and keeps FV.1 to "shell + router," not a screen rebuild.
2. **`react-router-dom` version.** My default vote: **v7 (current major)** — confirm the exact version + the `createBrowserRouter`/`<Routes>` API via Context7 at GREEN; the `Routes`/`Route`/`Outlet`/`useParams`/`useNavigate`/`MemoryRouter` surface this brief uses is stable across v6↔v7. (v6.x is an acceptable fallback if v7 churns the test setup.)
3. **`runClient` access pattern.** My default vote: a **`RunClientProvider` context** + `useRunClient()` — cleaner than prop-drilling through `<Outlet/>`; keeps the single app-level memoized instance.
4. **Theme application target + toggle UX.** My default vote: apply the class to **`document.documentElement`** (`:root.hc`/`:root.light` match the DS token selectors), localStorage key `'doppl-theme'`, a 3-state cycle button (dark/hc/light) in the AppShell. Honor `prefers-reduced-motion` (no animated theme transition).
5. **Observed-run state → URL.** My default vote: **yes — the observed `runId` + `mode` come from the URL** (`useParams` + the `/replay` route), replacing Dashboard's internal `observeLive`/`observeReplay` state, so browser back/forward + bookmarking work. The per-`(runId,mode)` store/SSE wiring is unchanged (it already recreates on those changing).

## Dependencies + sequencing
- **Depends on:** FV.0 (`9a6be17`, the `ds/` vocabulary). The existing tested data layer + Dashboard. Backend-independent (runs parallel with Phase FB).
- **Blocks:** FV.2 (S0 Runs Home — the `/` route's real screen), FV.3 (S1 Launcher — `/launch`), FV.4 (S2 Organism 3-pane — restructures `/runs/:id`), FV.7 (S5 Final — `/runs/:id/final`), FV.8 (replay scrubber — `/runs/:id/replay`). Every later FV screen mounts inside this shell/route table.

## Estimated commit count
**1–2.** The router + AppShell + theme toggle + the RunClient context + the Dashboard nav-integration are one coherent slice (same area, shared context, no safety invariant). MAY split into 2 (router+shell skeleton → theme toggle) if the diff grows; flag at Step 7.5 if splitting. Each ends in a `feat(web)` commit.

## Lessons-logged candidates anticipated
- **Convention candidate** — "router integration re-homes the observed run/mode to the URL (`/runs/:id` + `/replay`), keeps `runClient` app-level via a context, applies theme to `document.documentElement` + localStorage, and mounts the existing monolithic Dashboard per-route until the dedicated DS screens (FV.2+) replace each route's content — preserving the working demo through the refactor."
- **Architecture-doc note candidate** — §12: the dashboard is now a multi-route app behind an AppShell (wordmark + ModeBanner slot + theme toggle); observed run + mode are URL-derived; the data layer is route-agnostic.
- **Future TODO — operational** — the e2e smoke may want per-route coverage (S0→S1→S2→S5 nav) once the dedicated screens land (FV.2+).
