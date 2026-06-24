# Session phase-d-010 — demo-polish round (PD.17 · PD.20 · PD.18 · PD.19)

- **Date:** 2026-06-23
- **Phase:** Phase D (local-first demo path) — pre-merge demo-polish round (user hands-on testing)
- **Track:** phase-d (demo) · areas: web (PD.17/20), api+web (PD.18), api/config (PD.19)
- **Predecessor session:** [phase-d-008](phase-d-008-2026-06-23-web-api-wiring-reconciliation.md) (PD.14/15/16; the orch's round-4 seal ledger is [phase-d-009](phase-d-009-2026-06-23-orchestrator-round4-seal-web-api-reconciliation.md))
- **Successor session:** _(none — last build round; next is the lead-owned phase-d→cody merge + user sign-off)_
- **Commits:** `7980513` (PD.17) · `6a675d2` (PD.20) · `002c496` (PD.18) · `774b20e` (PD.19). ZERO frozen-contract change across all four (`packages/contracts` diff empty).

## Why this session existed

User hands-on demo testing (2026-06-23, via lead) surfaced four demo-polish gaps after the web↔API wiring (PD.14–16) landed: (PD.17) the dashboard could only show ONE run — no way to browse/replay past runs; (PD.20, DEMO-CRITICAL) a live run evolves fully in the backend but the lineage rendered only 1 node; (PD.18) the run-config form's static cap defaults exceeded a low `.env` ceiling → POST /runs 422; (PD.19) `pnpm start` was silent + a relative `.env.example DOPPL_FIXTURE_DIR` broke the documented per-package start.

## What was built

### PD.17 — run-list / replay browser + mode-as-state (`7980513`, web)
**Files created:** `apps/web/src/components/run/RunListPanel.tsx` (lists `listRuns` summaries — StatusBadge run-domain, null→neutral; click → `onReplay(runId)`; aria-current observed; loading/empty/error states) + its unit test.
**Files modified:** `routes/Dashboard.tsx` (mounts a "Runs" panel; lifts `mode` to STATE + shared `observeReplay`/`observeLive` — wired to RunListPanel AND FallbackLadderPanel.onReplay; onStarted→live); `test/unit/routes/Dashboard.test.tsx` (browse→replay wiring test); `test/smoke/web-api-smoke.test.ts` (+`smoke_run_list_browse_to_replay`); `test/e2e/dashboard-smoke.spec.ts` (GET /runs fixture → `{runs:[]}`). Wires the PD.15 reconciled-but-unused `listRuns`; bonus: fixes the latent fallback-replay-rung mislabel.

### PD.20 — live projection re-fetch (`6a675d2`, web, DEMO-CRITICAL)
**Files created:** `apps/web/src/lib/debounce.ts` (trailing-edge debounce + `.cancel()`) + its unit test.
**Files modified:** `routes/Dashboard.tsx` (the onEnvelope sink re-fetches `getLineage`+`getRunHealth` on the SSE cadence — debounced on non-terminal, FORCED on terminal via `isRunTerminal`; active-guard + cancel cleanup; `refetchDebounceMs` prop, default 600); `test/unit/routes/Dashboard.test.tsx` (terminal-force / debounced-coalesce / cleanup). Root cause: the projections were fetched once at mount; only `fold.events` updated live → the lineage froze at 1 node. PD.15 fixed event delivery; this rebuilds the projection (server rebuilds-on-read).

### PD.18 — cap-maxima route + RunConfigPanel clamp (`002c496`, api+web)
**Files created:** `apps/api/src/routes/cap-maxima.ts` (`GET /config/caps` → `{caps: defaultConfig.caps}`, read-only).
**Files modified:** `apps/api/src/server.ts` (register); `apps/api/test/integration/routes/runs-read.test.ts` (route test); `apps/web/src/data/runClient.ts` (`getCapMaxima`); `runConfigForm.ts` (`capCeilingFromRunCaps`/`clampCapsToCeiling`); `RunConfigPanel.tsx` (fetch maxima on mount → clamp inputs' max + values; static fallback on fetch-fail); 4 web tests (form helpers, clamp/fallback, runClient endpoint list, Dashboard fake). Fixes the cap-default 422. Source = `defaultConfig.caps` (the SAME maxima `overCapField` enforces) so the form can't offer a rejected value; rule #1 unchanged (clamp is UX-only).

### PD.19 — startup log + `.env.example` fix (`774b20e`, api/config)
**Files modified:** `apps/api/src/main.ts` (console.log `Doppl API listening on http://<host>:<boundPort>` after listen); `.env.example` (omit the relative `DOPPL_FIXTURE_DIR`); `apps/api/test/unit/config/env-example-drift.test.ts` (`CODE_DEFAULTED_OMITTABLE` set + omit test); `apps/api/test/integration/boot/main-boot.test.ts` (`boot_logs_listening_line` + `boot_seeds_from_default_fixture_dir`). The Fastify logger is OFF (`Fastify({bodyLimit})` — no logger) → `app.log` is a no-op = the silent-boot root cause; console.log is the guaranteed stdout signal.

## Decisions made
- **PD.17 mode-as-state (Q2):** the existing `onReplay` only set `observedRunId` (mode was a static prop; §2 non-folded label) → it didn't actually deliver "replay mode". Lifted `mode` to Dashboard state + a shared `observeReplay` reused by both the run-list and the fallback rung. Zero data-path risk (fold is identical live/replay).
- **PD.20 trailing + terminal-force (not leading-edge):** per-generation demo cadence (seconds apart) → a 600ms trailing delay is imperceptible; terminal-force guarantees the final graph. Re-fetch (server rebuilds-on-read), NOT a client-side incremental rebuild.
- **PD.18 source = `defaultConfig.caps`:** the served maxima == the `overCapField` ceiling, so the clamp can never offer a route-rejected value. `RunCaps` served read-only (ZERO new contract). Fetch-fail → static `CAP_CEILING` fallback.
- **PD.19 console.log (not app.log):** the Fastify logger is disabled, so `app.log` is a no-op; console.log is the only guaranteed stdout signal. `.env.example` OMIT (not make-absolute) — the module-relative default is correct + portable; the drift-guard marks `DOPPL_FIXTURE_DIR` an explicit `CODE_DEFAULTED_OMITTABLE` exception (required-credential set untouched — not a silent weakening).
- **`refetchDebounceMs` Dashboard prop (default 600):** a real-timer test seam (deterministic waitFor) — avoids fake-timers-in-React.

## Decisions explicitly NOT made (deferred)
- **`getRun`/`getReplay` remain UNUSED** in the dashboard (the run-list replay observes via the Dashboard's `getEvents`/`getLineage` effect, not `getReplay`). Reconciled defensively (PD.15) + the route works; a future replay view may consume `getReplay`. Not wired now — intentional.
- **Smoke not extended for `/config/caps`** (PD.18): the route integration + the web clamp units cover it; the smoke stayed lean (orch-confirmed).
- **chart mean-series / lineage onSelect / SSE connection-drop** (prior Carry-forward) — out of this polish round's scope.

## TDD compliance
- **PD.17:** clean — `RunListPanel.test` (6) written RED-first; the Dashboard browse→replay wiring test added.
- **PD.20:** clean — `debounce.test` RED-first; the 3 Dashboard re-fetch tests RED-first (the captureCreateStream driver — re-fetch absent → RED).
- **PD.18:** core clean — `runConfigForm` helper tests + the RunConfigPanel clamp/fallback tests RED-first. **Note (not a violation):** the `/config/caps` route integration test was added alongside the route (a thin read-route wiring guard over the registered route); the form-side behavior was TDD'd RED-first.
- **PD.19:** `boot_logs_listening_line` + `env_example_omits_relative_fixture_dir` RED-first. **Note (not a violation):** `boot_seeds_from_default_fixture_dir` is a GREEN-from-start characterization (the module-relative default already resolved CWD-independently; the bug was only the relative `.env.example` override) — it pins that the omission is safe.
- No safety-critical TDD skips. No security-reviewer on any (no invariant — read-only browse / read route / re-fetch cadence / stdout log; the cap clamp is UX-only with `overCapField` the sole authority, 422 pinned `runs.test.ts:110-111`).

## Cross-doc invariant audit
**ZERO frozen-contract change** across PD.17/18/19/20 (`git diff packages/contracts` empty, committed + uncommitted). New types are web-local (`RunSummary`/`RunStateView`/`StartRunResult`/`StopRunResult` from prior slices; the PD.18 `{caps}` wrapper reuses the frozen `RunCaps`). No Appendix-A model touched. The orchestrator owns the ARCH §11 (cap-maxima route) + §12 (run-list/replay browser + mode-as-state + live re-fetch cadence) notes (hot in its territory).

## Reachability
- **PD.17 RunListPanel** — mounted in the Dashboard "Runs" panel; `listRuns` on mount; click → `observeReplay` → observed-run switch.
- **PD.20 re-fetch** — the Dashboard mount effect's `onEnvelope` sink (wireRunStream) → debounced `getLineage`/`getRunHealth`; the production live path.
- **PD.18 `/config/caps`** — registered in `buildServer` (production server); `RunConfigPanel` fetches it on mount.
- **PD.19 startup log** — `bootApp` after `app.listen` (the production boot path); the `.env.example` default is the seed path (`seedDemo` ← `DOPPL_FIXTURE_DIR ?? module-relative default`).
- **No tested-but-unwired gaps.** (`getRun`/`getReplay` reconciled-but-unconsumed — surface-coherence, noted under deferred.)

## Open follow-ups
- **Orchestrator-territory (for /orchestrate-end):** ARCH §11 (/config/caps) + §12 (run-list/replay + mode-state + live re-fetch) notes; DEMO_RUNBOOK §3 (fixture-dir default) / §4–§5 (proxy + run-browser); LESSONS candidates — apps/web (one-time-fetched projection goes stale → re-fetch on the SSE cadence; mocked-e2e-hides-real-connection §12) + apps/api (relative `.env.example` path breaks per-pkg run; drift-guard treats code-defaulted vars optional).
- **`getRun`/`getReplay`** — wire when a runs-home / dedicated replay view calls for it (Future TODO).

## How to use what was built
- **Browse + replay past runs:** the dashboard "Runs" panel lists all runs → click any → observes it (REPLAY mode banner). **Watch a live run evolve:** the lineage + health now grow live (debounced re-fetch) + snap to the final graph on terminal. **Configure a run:** the cap inputs clamp to the API's real maxima (no 422). **Boot:** `pnpm -C apps/api start` prints `Doppl API listening on http://localhost:3000` + seeds from the module-relative `fixtures/replay` default (no `DOPPL_FIXTURE_DIR` needed).
