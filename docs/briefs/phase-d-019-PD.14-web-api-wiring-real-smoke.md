# /tdd brief — wire_web_to_real_api_vite_proxy_and_real_smoke

## Feature
PD.14 — wire the dashboard to a real booted API so the demo UI actually works (the lead/user Finding: as wired, `pnpm -C apps/web dev` + open dashboard ⇒ every call 404s). (1) A **Vite dev proxy** `/api` → `http://localhost:3000` with a rewrite stripping `/api` (so `/api/runs` → `/runs`) covering the **SSE stream**; (2) make the data-client baseUrl **env-configurable** (`import.meta.env.VITE_API_BASE ?? '/api'`); (3) a **REAL web↔API smoke** that exercises the dashboard against a really-booted seeded API THROUGH the proxy (the connection the existing Playwright e2e always MOCKED — that mock is why this was never caught). Web hat. ZERO contract surface.

## Use case + traceability
- **Task ID:** PD.14 (the web↔API wiring Finding; gates the lead cody-merge)
- **Architecture sections it implements:** `ARCHITECTURE.md §11` (REST API + SSE — the routes the web calls), `§12` (the dashboard — read-only over projections + SSE; resync from lastEventId), `§17` (local-first demo — the boot + the dashboard flow).
- **FINDING (category 2, material; lead-surfaced 2026-06-23):** web data-client baseUrl hardcoded `/api` (`apps/web/src/App.tsx:11` + the runClient), NOT env-overridable; API routes at ROOT (`apps/api/src/server.ts` — `/runs`, `/runs/:id/stream`, `/problem-sets`, `/demo/fallback-ladder` — NO `/api` prefix); `apps/web/vite.config.ts` has NO `server.proxy`; the API doesn't serve the web build; the web Playwright e2e MOCKED the backend → the real web→API connection was never exercised. → wrong origin AND wrong prefix → 404s.
- **Related:** the demo paths (DEMO_RUNBOOK §4/§5) assume `pnpm -C apps/web dev` reaches the API — true ONLY once this proxy lands. The orch updates the runbook.

## Acceptance criteria (what "done" means)
- [ ] **Vite dev proxy** in `apps/web/vite.config.ts`: `/api` → `http://localhost:3000`, `changeOrigin`, **rewrite** stripping the `/api` prefix (`/api/runs` → `/runs`). A REST call from the dashboard (`/api/runs`, `/api/problem-sets`, `/api/demo/fallback-ladder`, `/api/runs/:id`) reaches the real API path.
- [ ] **SSE works through the proxy:** `/api/runs/:id/stream` proxies as a streaming `text/event-stream` (NOT buffered — the proxy must flush; configure the proxy so EventSource receives events incrementally). Pin/verify the stream is not buffered into one chunk.
- [ ] **baseUrl env-configurable:** the data-client reads `import.meta.env.VITE_API_BASE ?? '/api'` (so the operator can point at a non-proxy origin); default `/api` (the proxy path). No hardcoded origin remains.
- [ ] **REAL web↔API smoke (NOT a mock):** an automated test boots a really-seeded API (`demo-recorded-001`) + the web (Vite) and verifies the dashboard loads that seeded run THROUGH the proxy → the real API — i.e. the lineage / final-idea / run data RENDERS from real API responses, not a mocked fetch. (Shape = Step-2.5 Q1: Playwright `webServer`-real-backend vs a lighter real-fetch-through-proxy — but it MUST hit the real API through the proxy.)
- [ ] The existing MOCKED dashboard e2e either stays (as a fast unit-ish render check) or is supplemented by the real smoke — but the real connection is now exercised by at least one test. Say which.
- [ ] DEMO_RUNBOOK §4/§5 updated (the proxy + the API-must-run-at-:3000 requirement) — **orchestrator-authored** (flag at Step 9; don't edit it yourself).
- [ ] `/preflight` clean (web); the real smoke is runnable + documented (a script if it needs a special invocation).

## Wiring / entry point (Step 7.5)
The proxy is the dev-server entry (`vite.config.ts` `server.proxy`) — the dashboard's existing data-client calls flow through it to the real API. The env baseUrl is read by the data-client. The real smoke boots the actual `bootApp` (seeded) + Vite. Confirm the dashboard's REAL calls (REST + SSE) reach the real API through the proxy — that's the Finding's fix.

## Files expected to touch
**Modified:**
- `apps/web/vite.config.ts` — add `server.proxy` (`/api` → :3000, rewrite, SSE-safe).
- `apps/web/src/App.tsx` (+ the data-client / runClient) — `VITE_API_BASE ?? '/api'` baseUrl.
- the web e2e/test config — the real-backend smoke (+ possibly a Playwright `webServer` or a test harness that boots the seeded API + Vite).
**New:**
- a real web↔API smoke test (Playwright spec or a real-fetch integration test).
- *(maybe)* `apps/web/.env.example` or a `VITE_API_BASE` note (coordinate with the root `.env.example` / runbook).

**Orchestrator (NOT this slice):** DEMO_RUNBOOK §4/§5 update.

## RED test outline (Step 2)
1. **`vite_proxy_rewrites_api_prefix_to_root`** — a proxied `/api/runs` resolves to the API's `/runs` (config-level or a real request). Why: §11 — the prefix fix.
2. **`dashboard_loads_seeded_run_through_real_api`** (the headline real smoke) — with a really-booted seeded API + Vite, the dashboard renders the `demo-recorded-001` run's data (lineage / final-idea) from REAL API responses through the proxy (no mock). Why: §12/§17 — the Finding's fix, the connection always mocked.
3. **`sse_stream_proxies_unbuffered`** — `/api/runs/:id/stream` delivers events incrementally through the proxy (not one buffered blob). Why: §11/§12 live window.
4. **`baseurl_env_configurable`** — the data-client uses `VITE_API_BASE` when set, else `/api`. Why: operator flexibility; no hardcoded origin.

> The smoke MUST exercise web→proxy→REAL-API (the whole point of the Finding). NOT another mock.

## Cross-doc invariant impact
- **Model field changes:** none. ZERO contract surface (a dev-proxy config + an env baseUrl + a test; web reads existing API routes — no new route, no new model).
- **Orchestrator doc rows (Step 9):** the DEMO_RUNBOOK §4/§5 update (orch). Possibly an ARCH §17 note (the dev proxy is the local web↔API path). No cross-doc invariant.
- **§2.5-seam model touched?** No.

## Things to flag at Step 2.5
1. **Real-smoke shape:** (a) Playwright `webServer` booting the seeded API + Vite + the dashboard render assertion (most demo-faithful; heavier — needs a test DB/seed); (b) a lighter real-fetch-through-proxy test (boot API + Vite, fetch `/api/runs` → assert real seeded data; no browser). My default vote: **(a) if feasible within budget** (it proves the actual UI); else **(b)** — but EITHER way it hits the real API through the proxy (not a mock). Flag the DB/boot orchestration (testcontainer vs a local PG) you choose.
2. **SSE proxy config:** confirm the chosen proxy setup flushes the stream (some http-proxy setups buffer). My default: verify with the SSE test; configure `proxy` to not buffer (or `configure` the proxy instance).
3. **Keep or replace the mocked e2e:** my default — KEEP the mocked render e2e (fast, no backend) AND ADD the real smoke (the connection that matters). Say which you did.

## Dependencies + sequencing
- **Depends on:** the API routes (server.ts) + the seeded fixture (PD.8a `demo-recorded-001`) + the data-client (existing). Independent of PD.13 (web vs gateway).
- **Blocks:** the lead phase-d→cody merge (the demo's core UI path).
- **Sequencing:** NEXT round, FRESH impl (the current impl is spent after PD.13+live). The orchestrator persists + dispatches this at the cycle handoff.

## Estimated commit count
**1–2.** (1) feat(web) the proxy + env baseUrl + the real smoke; (optionally 2) if the smoke harness (Playwright webServer / test-boot) is a sizeable separate piece. Non-safety (web wiring + a test; ZERO contract surface). No security-reviewer required (no invariant touched) unless the real smoke boots the API in a way that touches a trust boundary (it shouldn't — read-only seeded replay).

## Lessons-logged candidates anticipated
- **Convention candidate** — "a mocked e2e hides the real web↔API connection; a demo UI needs at least one smoke that exercises web→proxy→REAL-API (booted + seeded), or the wiring (origin/prefix) silently 404s in the real app."
- **Architecture-doc note** — §17: the local web↔API path is a Vite dev proxy `/api`→:3000 (rewrite-stripped); the API serves at root.

## How to invoke
1. Read this brief + the Finding's cited files (`vite.config.ts`, `App.tsx`, the data-client, `server.ts` routes).
2. Run `/tdd wire_web_to_real_api_vite_proxy_and_real_smoke` (web hat; read `apps/web/CLAUDE.md`).
3. Step 0 (Restate) — confirm: proxy + env baseUrl + a REAL (not mocked) web→API smoke through the proxy.
4. Step 2.5 — Q1–Q3 (esp. the real-smoke shape).
5. Step 9 — flag the DEMO_RUNBOOK §4/§5 update (orch) + which smoke shape you used + whether you kept the mocked e2e.
