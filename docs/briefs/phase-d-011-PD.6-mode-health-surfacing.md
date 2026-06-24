# /tdd brief — mode_indicator_and_health_surfacing

## Feature
PD.6 — surface the operator's **continue-vs-switch** signal in the dashboard: a dedicated **RunHealthPanel** renders `GET /runs/:id/health` (generation, candidates-in-flight, last-event-at, caps-consumed where the web schema allows) and **visibly flags stale/absent health** (a pure `isStale(lastEventAt)` → a colorblind-safe badge "stale — consider switching to replay"); the existing P7.4 **ModeBanner** is the live/replay mode indicator (already colorblind-safe shape+icon+label — reused, not rebuilt). Read-only over projections + SSE; ZERO new contract surface. Mostly a WIRING slice (the route, the mode indicator, the SSE resume/poll fallback all exist).

## Use case + traceability
- **Task ID:** PD.6
- **Architecture sections it implements:** `ARCHITECTURE.md §12` (frontend dashboard — mode indicator + health surfacing, colorblind-safe), `ARCHITECTURE.md §13` (observability / run-health signal), `ARCHITECTURE.md §17` (the demo continue-vs-switch operator decision). Web hat (api impl wears it).
- **Related context (what EXISTS — P6/P7):** `GET /runs/:id/health` route (P6.8, `apps/api/src/routes/run-health.ts`) + `buildRunHealth` projection (returns `{generationCount, candidatesInFlight, lastEventAt, capsConsumed (nested), …}`). Web: `runClient.getRunHealth(runId)` (P7.1) + a web-local `RunHealth` Zod (`apps/web/src/data/health.ts`) + a MINIMAL inline health render in `Dashboard.tsx` (generation / in-flight / last-event-at). **ModeBanner** (P7.4, `apps/web/src/components/feedback/ModeBanner.tsx`) is colorblind-safe (LIVE = breathing dot + "● LIVE"; REPLAY = hatched + "⏮ REPLAY"; terminals ✔/■/△) — driven by `runStore.getMode()` ('live'|'replay', set at Dashboard mount) + `runStatus`. **StatusBadge** (`apps/web/src/components/core/StatusBadge.tsx`) is the shape+icon+label+`var()`-token status primitive. SSE (L§9): `sseStream` resumes from `lastEventId` on reconnect + `onError → store.poll()` fallback (rule #3 safe; the dashboard holds a separate raw-events FoldState — SSE non-authoritative).
- **Two integration carry-forwards (NOT PD.6 — see "Cross-doc impact"):** (i) the web-local `RunHealth` schema diverges from the api shape (`currentGeneration` vs `generationCount`; flat vs nested `capsConsumed`) — LESSONS §34; (ii) the EventSource real `'error'` (connection-DROP) listener isn't modeled yet (only payload-validation `onError`). Both reconcile at the demo→cody merge with the live producer.

## Acceptance criteria (what "done" means)
- [ ] A dedicated **`RunHealthPanel`** component renders the run-health signal (generation, candidates-in-flight, last-event-at, + caps-consumed where the web-local schema exposes it) — read-only from `runClient.getRunHealth` + the run-store; no authoritative mutation.
- [ ] **`isStale(lastEventAt: string | null, nowMs: number, thresholdMs?: number): boolean`** — a PURE function: `true` when `lastEventAt` is null/absent OR older than the threshold (default ~10s) relative to an injected `nowMs` (no `Date.now()` inside — injected for deterministic tests).
- [ ] **Stale/absent health is VISIBLY FLAGGED** — a colorblind-safe badge (reuse `StatusBadge`: shape + icon + label, `var()` tokens, projector-legible) reading e.g. "stale — consider switching to replay" (the continue-vs-switch cue); fresh health shows a healthy badge.
- [ ] The **live/replay mode indicator is the existing `ModeBanner`** (reused as-is — already colorblind-safe + mounted); PD.6 confirms it's wired (no new mode component, or a THIN `demo/ModeIndicator` re-export wrapper if the plan's directory is wanted — Step-2.5 Q1).
- [ ] Read-only over projections + SSE; SSE stays non-authoritative — resync from `lastEventId` (already wired, rule #3); on disconnect the existing `onError → poll` fallback holds (the real connection-drop `'error'` listener is a documented carry-forward, not PD.6).
- [ ] `RunHealthPanel` is mounted in `Dashboard.tsx` (replacing/extracting the minimal inline health render) — reachable from the live-run view.
- [ ] Forbidden-pattern clean: no color-only status (shape+icon+label); no direct fetch (runClient); no `apps/api/**` import; no SSE-as-truth (separate FoldState + sequence resync).
- [ ] `/preflight` clean (web: typecheck + lint + Vitest + e2e smoke).

## Wiring / entry point (Step 7.5)
`apps/web/src/routes/Dashboard.tsx` mounts `<RunHealthPanel … />` for the `observedRunId` (replacing the inline `healthRow`), fed by the existing `getRunHealth` fetch + the run-store; `ModeBanner` stays mounted as the mode indicator. Reachable from the live-run view; the e2e drives it. Confirm the panel is mounted (not just defined) at Step 7.5.

## Files expected to touch
**New:**
- `apps/web/src/demo/RunHealthPanel.tsx` — the health panel (renders the signal + the stale/absent badge via StatusBadge).
- `apps/web/src/demo/runHealthStale.ts` — the pure `isStale` (+ a `healthBadgeStatus(lastEventAt, nowMs)` → 'healthy'|'stale'|'absent' helper, if cleaner). *(Or co-locate in the panel module; Step-2.5.)*
- `apps/web/test/unit/demo/runHealthStale.test.ts`
- `apps/web/test/unit/demo/RunHealthPanel.test.tsx` (behavioral: renders the fields + the stale/healthy badge given fixtures — deterministic-in-CI regardless of the e2e, per the PD.5b L§10 lesson)
- `apps/web/test/e2e/run-health-panel.spec.ts` (Playwright: health updates live → stale flag appears on a stalled stream) — keep if browsers install; doc-as-CI otherwise.

**Modified:**
- `apps/web/src/routes/Dashboard.tsx` — mount `<RunHealthPanel>` (extract the inline health render); confirm `ModeBanner` wiring.
- *(maybe)* `apps/web/src/demo/ModeIndicator.tsx` — a THIN re-export/wrapper of `ModeBanner` ONLY if the plan's `demo/` directory structure is wanted (Step-2.5 Q1); otherwise reuse ModeBanner directly.

If implementation needs files beyond this list, **flag at Step 2.5**.

## RED test outline (Step 2)
Vitest unit — `runHealthStale.test.ts`:
1. **`is_stale_true_when_absent`** — `lastEventAt = null` → `true`. Why: §13 — absent health is flagged.
2. **`is_stale_true_when_older_than_threshold`** — `lastEventAt` older than `nowMs - thresholdMs` → `true`. Why: §13 stale detection (injected `nowMs`, deterministic).
3. **`is_stale_false_when_recent`** — `lastEventAt` within the threshold → `false`. Why: fresh health = continue.

Vitest unit — `RunHealthPanel.test.tsx` (testing-library + fixtures):
4. **`renders_health_signal`** — given a fresh `RunHealth` fixture → renders generation + in-flight + last-event-at (+ caps-consumed where exposed) + a HEALTHY badge (shape+label). Why: §12/§13 surface the signal.
5. **`flags_stale_health`** — given a stale/absent `lastEventAt` (+ injected now) → renders the STALE/absent badge with shape+icon+label (not color-alone), reading the continue-vs-switch cue. Why: §17 + acceptance (e); rule #4 (colorblind-safe).

Playwright e2e — `run-health-panel.spec.ts`:
6. **`health_updates_live_then_stale`** — start → stream events (health/last-event-at updates) → stall the stream (no new events past the threshold) → the stale badge appears. Why: §12/§13/§17 end-to-end. (Doc-as-CI if browsers absent — L§10.)

> **Mode indicator** is the existing ModeBanner (already unit-tested for its live/replay/terminal derivation) — PD.6 reuses it, so no new mode-derivation test (cite the existing ModeBanner test as covering it). The visual layout/styling is e2e/design-review.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** none. ZERO new contract surface — `RunHealth` stays a web-local Zod mirror; `GET /runs/:id/health` exists; no `@doppl/contracts`/Appendix-A change, no new route.
- **Orchestrator doc rows to write hot (Step 9 routing):** likely an **Architecture-doc note** (§12/§13): the RunHealthPanel surfaces the continue-vs-switch health signal + a stale flag; ModeBanner is the mode indicator. **Two carry-forwards to record** (integration / demo→cody merge — NOT fixed here): (i) **reconcile the web-local `RunHealth` schema vs the api shape** (`currentGeneration`↔`generationCount`; flat↔nested `capsConsumed` — LESSONS §34; decide promote-to-contracts vs flatten-at-route vs update-web-schema); (ii) **wire the EventSource real `'error'` (connection-drop) listener** (today only payload-validation `onError → poll`; the connection-drop trigger lands with the live producer).
- **§2.5-seam model touched?** No.

## Things to flag at Step 2.5
1. **Mode indicator: reuse `ModeBanner` directly, or add a thin `demo/ModeIndicator` wrapper?** My default vote: **reuse `ModeBanner` directly** (it's already colorblind-safe + mounted) — the plan's `ModeIndicator.tsx` is satisfied by the existing P7.4 component; skip a redundant wrapper unless a `demo/` re-export aids clarity (then a thin pass-through).
2. **`isStale` threshold + clock injection.** My default vote: a configurable `thresholdMs` (default ~10s) + an INJECTED `nowMs` (no `Date.now()` in the pure fn — deterministic tests; the panel passes `Date.now()` at the call site, or a ticking `useEffect`). Confirm the default threshold (~10s) reads right for the demo cadence.
3. **Stale badge: reuse `StatusBadge` (health status-map healthy/stale/absent) or an inline badge?** My default vote: **reuse `StatusBadge`** (consistent shape+icon+label + `var()` tokens; add a small health status-map entry).
4. **Schema mismatch + EventSource `'error'` — DEFER (do NOT fix in PD.6).** My default vote: **surface what the web-local schema currently exposes** + record both as integration carry-forwards (demo→cody merge). Editing the web-local schema or wiring the live-producer `'error'` listener is merge-time work against the real producer — out of PD.6's scope.
5. **Caps-consumed rendering.** My default vote: render caps-consumed **where the web-local schema exposes it**; note (carry-forward) that the api's nested `capsConsumed` won't fully surface until the schema reconcile — don't block PD.6 on it.

## Dependencies + sequencing
- **Depends on:** P6.8 `GET /runs/:id/health` (shipped) · P7.4 ModeBanner · P7.1 runClient.getRunHealth · the run-store/SSE wiring (all shipped). PD.5b's live-run view (the panel mounts in the same shell).
- **Blocks:** PD.7 (final-idea proof panel — the operator-facing acceptance surface) + PD.8's continue-vs-switch / fallback-ladder rehearsal.

## Estimated commit count
**1.** One cohesive web wiring slice (RunHealthPanel + isStale + the mount + unit tests + e2e). Not safety-touching (read-only over projections; SSE non-authoritative already enforced) → security-reviewer = **phase-boundary**. NOT bundled with PD.7.

## Lessons-logged candidates anticipated
- **Architecture-doc note candidate** — §12/§13: RunHealthPanel = the continue-vs-switch surfacing (generation/in-flight/last-event-at/caps + a colorblind-safe stale flag); ModeBanner reused as the mode indicator.
- **Future TODO (carry-forward, integration)** — (i) reconcile web-local `RunHealth` vs the api shape (LESSONS §34); (ii) EventSource `'error'` connection-drop listener — both at the demo→cody merge.

## How to invoke
1. **Read this brief end-to-end** + `apps/web/CLAUDE.md` (web hat).
2. **Run `/tdd mode_indicator_and_health_surfacing`**.
3. **Step 0 (Restate)** — surface the health continue-vs-switch signal + a stale flag; reuse ModeBanner + StatusBadge + the existing SSE resume/poll; ZERO new contract surface; the schema reconcile + `'error'` listener are carry-forwards.
4. **Step 1 (Identify files)** — confirm against "Files expected to touch" (+ your Q1 mode-wrapper call).
5. **Step 2.5** — test-design + coverage map + the 5 answers (map which bullets are unit vs e2e).
6. **Step 9** — surface anything beyond the anticipated candidates; flag the 2 integration carry-forwards.

> **CWD — CRITICAL (Bash cwd RESETS each call):** Read/Edit/Write → ABSOLUTE paths under `/Users/dreddy/Documents/GauntletAI/Capstone-phased/`; **web TESTS → `pnpm -C /Users/dreddy/Documents/GauntletAI/Capstone-phased/apps/web test ...`** (a bare `pnpm test` runs the KERNEL worktree = FALSE GREEN; this is `apps/web`); git → `git -C /Users/dreddy/Documents/GauntletAI/Capstone-phased ...`; branch-check `== phase-d` before the first edit AND the Step-10 commit.
