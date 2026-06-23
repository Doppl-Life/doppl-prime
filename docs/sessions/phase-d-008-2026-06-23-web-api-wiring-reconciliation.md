# Session phase-d-008 — web↔API wiring + response-shape reconciliation (PD.14/15/16) + PD.8c live re-run

- **Date:** 2026-06-23
- **Phase:** Phase D (local-first demo path)
- **Track:** phase-d (demo) · area: api + web (web hat for PD.14/16; api+web for PD.15)
- **Predecessor session:** [phase-d-007](phase-d-007-2026-06-23-final-idea-proof-panel-pd7.md)
- **Successor session:** _(none yet — PD.16 is the last buildable slice; next is the lead-owned phase-d→cody merge + user sign-off)_
- **Commits:** `fb27d73` (PD.14) · `3b3d476` (PD.15) · `fd32890` (PD.16). PD.8c live re-run = validation-only (no commit).

## Why this session existed

Fresh successor impl after the prior pair auto-cycled at ACTION. Two arcs were queued: (1) confirm PD.13's `json_object` fix cleared the live structured-output HTTP 400 (the PD.8c live-winner re-run); (2) wire the dashboard to a really-booted API (PD.14 — the lead/user Finding: `pnpm -C apps/web dev` 404'd every call). PD.14's **real** smoke then surfaced a deeper web↔API response-shape drift the mocked e2e had hidden, split into PD.15 (read path) + PD.16 (command path).

## What was built

### PD.8c live re-run (task #5 — validation only, no commit)
Ran the shipped `test:smoke:live` with the user's real keys sourced from the **repo-root** `.env` (not `apps/api/.env` as briefed): `set -a; . .env; set +a; DOPPL_GATEWAY=live pnpm -C apps/api test:smoke:live` → **10/10 passed, 0 skipped** (4 keyless-mirror + 6 live). PD.13's fix cleared the HTTP 400; the live path now produces a real `selected` winner. All safety invariants held live (terminal · caps#1 · winner via PD.11 · energy#8 · no-leak#4 · capture→replay#7).

### PD.14 — Vite dev proxy + env baseUrl + real web→API smoke (`fb27d73`)
**Files created:**
- `apps/web/src/data/apiBase.ts` — `resolveApiBaseUrl(env)` → `VITE_API_BASE ?? '/api'` (pure, env-injected).
- `apps/web/test/unit/config/vite-proxy.test.ts` — proxy config (target/changeOrigin/rewrite) assertions.
- `apps/web/test/unit/data/apiBase.test.ts` — env-baseUrl resolution.
- `apps/web/vitest.smoke.config.ts` — standalone config for the real smoke (`test/smoke/**`).
- `apps/web/test/smoke/web-api-smoke.test.ts` — the real web→proxy→API smoke (testcontainer PG + spawned seeded API + programmatic Vite); extended in PD.15/16.

**Files modified:** `vite.config.ts` (`server.proxy` `/api`→:3000 rewrite-stripped, SSE-safe, `VITE_API_PROXY_TARGET`-overridable; `test.exclude` for `test/smoke/**`) · `App.tsx` (env baseUrl) · `vite-env.d.ts` (`VITE_API_BASE`) · `package.json` (+devDep `@testcontainers/postgresql`, +script `test:smoke:web-api`) · `pnpm-lock.yaml`.

### PD.15 — read-path response-shape reconciliation + omit-null wire serializer (`3b3d476`)
**Files created:**
- `apps/api/src/routes/_support/serializeEnvelope.ts` — shared wire serializer; deep-omits null/undefined keys, `Date`-guarded (occurredAt not flattened — LESSON §31), arrays preserved. Read-path/presentation only (log untouched rule#2; downstream of the append scrub rule#4).
- `apps/api/test/unit/routes/serialize-envelope.test.ts` — omit-null + Date + deep + re-parse.

**Files modified:** `run-stream.ts` + `runs-read.ts` (wire the serializer into the SSE frame + GET /events) · their integration tests (null-free re-parse guards, non-opt-in) · `runClient.ts` (consume `{runs}` / `{runId,sequenceThrough,state}` / `{runId,events}` + `?since=`; web-local `RunSummary`/`RunStateView`/`EventsResponse`) · `runClient.test.ts` (+6 read-shape tests) · `web-api-smoke.test.ts` (SSE tightened to strict `RunEventEnvelope.parse` = the failing-then-green; +real-runClient REST through the proxy).

### PD.16 — command-endpoint reconciliation: operator start/stop (`fd32890`)
**Files modified:** `runClient.ts` (`startRun`/`startDemoRun`→`StartRunResult`, `stopRun`→`StopRunResult` [both 200/202]; `Run` import dropped; **`postInit` bodyless-POST content-type fix** — see Decisions) · `OperatorPromptPanel.tsx`/`RunConfigPanel.tsx`/`FallbackLadderPanel.tsx`/`StopControl.tsx` + `Dashboard.tsx` (`onStarted`/`onStopped` types + `run.id`→`run.runId`) · `dashboard-smoke.spec.ts` (POST /runs fixture → `{runId}`) · `web-api-smoke.test.ts` (+`smoke_operator_start_stop_through_proxy`) · the 4 component tests + `runClient.test.ts` (+6 command-shape tests) + `operatorPromptClient.test.ts` (mocks → command shapes).

## Decisions made
- **PD.14 smoke shape = real-fetch-through-proxy, NOT a browser** (orch-approved Q1=b). Boots the API as a **child process** (no `apps/api` import → rule #6 clean), seeded creds-free (recorded gateway, placeholder keys), testcontainer PG (skipIf no Docker / opt-in `DOPPL_WEB_API_SMOKE=1`). The mocked Playwright e2e was kept (fast render check).
- **PD.15 fix at the API SOURCE (omit nulls), never `.nullable()` on the frozen contract** (user-decided option C, both sides). The frozen `RunEventEnvelope` is untouched; web-local response types absorb the wrappers.
- **PD.16 split from PD.15** — the command ripple was ~11–14 files (component+test churn), not the "1 file" first assumed; corrected the premise, the orch chose a focused follow-up.
- **PD.16 `postInit` bodyless-POST fix** — `stopRun`'s empty POST sent `content-type: application/json` → Fastify 400 (empty JSON body) → operator Stop broke vs the real API regardless of response shape. Fixed by setting content-type only when a body is present (HTTP-correct). Caught by the smoke.
- **Smoke asserts start/stop WIRING (real runId + stop wrapper), not a terminal status** — the recorded gateway can't drive a fresh run to completion, so a status assert would race.

## Decisions explicitly NOT made (deferred)
- **`listRuns`/`getRun`/`getReplay` are reconciled but UNUSED in the dashboard** (only `getEvents` + SSE + `getLineage`/`getCandidate` are consumed). Reconciled defensively (surface-coherence + smoke-guarded); a future panel may consume them. Not wired now — intentional.
- **Replay view** consumes `getReplay`'s summary shape; if a future replay view needs raw events, that's a separate slice (the API would expose events for replay).
- **Committed live fixture** (PD.8c) — left transient (default); committing is the user's optional call.

## TDD compliance
- **PD.14:** clean — `vite-proxy.test.ts` + `apiBase.test.ts` written RED-first → GREEN; the real smoke written + run green.
- **PD.15:** core clean — `serialize-envelope.test.ts` (serializer logic) + the 6 runClient read-shape tests RED-first → GREEN. **Note (not a violation):** the two route-wiring **integration guards** (events/SSE null-free re-parse) were added *after* wiring the serializer — they guard already-TDD'd pure logic at the route boundary; the demo-critical behavior (SSE strict-parse) is the smoke's failing-then-green.
- **PD.16:** behavior pinned RED-first by the 6 runClient command-shape unit tests (RED confirmed against the old `Run`-parsing impl). **Note (not a violation):** the 4 component-test updates + the e2e fixture were *mechanical mock-shape follow-ons* to the type migration (the behavior was already pinned by the runClient unit tests + the typecheck). The `postInit` 400 fix was **test-caught** (the smoke) then fixed.
- No safety-critical TDD skips. No security-reviewer needed for PD.14/PD.16 (no invariant); PD.15 ran security-reviewer (invariant) → **CLEAN**.

## Cross-doc invariant audit
**ZERO frozen-contract change** across PD.14/15/16 (`git diff packages/contracts` = empty). No Appendix-A model field added/removed/renamed. The new types (`RunSummary`, `RunStateView`, `StartRunResult`, `StopRunResult`, `EventsResponse`) are **web-local** data-client types, not Appendix-A models. The omit-null serializer is presentation, not a contract change. The orchestrator added an `ARCHITECTURE.md §11` note (the read routes/SSE omit null optionals on the wire; the web consumes the REST wrapper shapes) hot in its territory — no implementer doc edit owed.

## Reachability
- **PD.14 proxy** — reachable from the Vite dev server (`pnpm -C apps/web dev`): the data-client's `/api/*` calls flow through `server.proxy` → :3000 (rewrite-stripped). `resolveApiBaseUrl` reached from `App.tsx` (`createRunClient({ baseUrl: resolveApiBaseUrl(import.meta.env) })`).
- **PD.15 serializer** — reached from `GET /runs/:id/events` (`runs-read.ts`) + the SSE frame serializer (`run-stream.ts`); both production routes the dashboard calls through the proxy. Web `runClient.getEvents` + `sseStream` consume them.
- **PD.16 command methods** — `startRun`/`startDemoRun` reached from `RunConfigPanel`/`OperatorPromptPanel`/`FallbackLadderPanel`; `stopRun` from `StopControl` — all mounted in the `Dashboard` shell; the observed-run switch keys off `run.runId`.
- **No tested-but-unwired gaps.** The real smoke + the mocked e2e exercise the full proxy + read + SSE + start/stop paths. (`listRuns`/`getRun`/`getReplay` are reconciled-but-unconsumed — surface-coherence, not a wiring gap; noted under deferred.)

## Open follow-ups
- **Step-9 items** (orch-routed hot during the session; orch's `/orchestrate-end` is the verify pass): PD.14 devDep `@testcontainers/postgresql` + the smoke config/script + `VITE_API_PROXY_TARGET` env; PD.15/16 `ARCHITECTURE.md §11` addendum + `DEMO_RUNBOOK §4/§5` (proxy + API-at-:3000) — all orchestrator-territory, written hot.
- **Reconciled-but-unused client methods** (`listRuns`/`getRun`/`getReplay`) — wire into a runs-home / replay view when a phase calls for it (Future TODO — belongs to a later phase).
- **Committed live fixture** — user's optional call (default transient).

## How to use what was built
- **Run the demo UI against a real API:** start the API (`DATABASE_URL=… [DOPPL_SEED_FIXTURE=demo-recorded-001 DOPPL_FIXTURE_DIR=fixtures/replay] pnpm -C apps/api start`) on :3000, then `pnpm -C apps/web dev` — the dashboard's `/api/*` calls proxy through to it; reads, live SSE, and operator start/stop all work end-to-end.
- **Run the real web→API smoke:** `pnpm -C apps/web test:smoke:web-api` (needs Docker; gated `DOPPL_WEB_API_SMOKE=1`). The fast unit gate (`pnpm test`) stays network-free.
