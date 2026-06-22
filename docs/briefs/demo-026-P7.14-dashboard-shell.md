# /tdd brief — dashboard_shell_and_sse_wiring

## Feature
The **dashboard shell** (§12) — composes the full §12 panel set into the operator dashboard and wires the **live data flow**: it constructs the `runStore` (P7.2) and an `sseStream` (P7.1) and connects them via the **deferred IoC** — `createSseStream({ onEvent: store.applyEvent, onError: () => store.poll() })` (the P7.2/LESSONS §2 deferral) — so live `RunEventEnvelope`s fold into view state and a stream drop falls back to polling. Mounts the **global ModeBanner** (live/replay, P7.4), the **run-health panel** (P6.8 `getRunHealth`), and the secret-redaction **trust indicator**, plus the panel set (run-launcher, lineage, charts, energy, candidate, critic, check, final-idea) — each fed the store/event-list + its dataRef/candidateId link targets. The shell is the composition + wiring layer; the panels are already built (P7.5–P7.13). **Wired against fixtures + the data-client seam** (NOT the live backend — that lands at the demo→cody merge).

## Use case + traceability
- **Task ID:** P7.14 (dashboard shell + run health/diagnostics + secret-redaction trust indicator)
- **Architecture sections:** `ARCHITECTURE.md §12` (the dashboard shell; the full panel set; live/replay; accessible), `§11` (SSE→store wiring + polling fallback; run-health), `§13` (secret-redaction trust indicator — the dashboard shows redaction is active, never a secret).
- **Related context:** the **composition/wiring capstone** — resolves the P7.2 deferred SSE-store IoC (LESSONS §2) + mounts P7.4 ModeBanner + P6.8 health + P7.5–P7.13 panels (via their dataRef/candidateId link targets). **Integration-confirm carry-forwards** (the P7.7 dataRef↔event-entity-id bridge, the P7.9 `run.configured`-carries-`RunConfig.caps`) are confirmed against the REAL producer at the **demo→cody merge** (the live runtime isn't on the demo fork) — NOT in this slice; here they're exercised against fixtures. Unit + the wiring; the full render is the P7.15 Playwright smoke.

## Acceptance criteria
- [ ] **SSE→store IoC wiring:** the shell constructs the `runStore` + `sseStream` and wires `createSseStream({ onEvent: store.applyEvent, onError: () => store.poll() })` (LESSONS §2) — a live event folds into the store; a stream error triggers the polling fallback; the store stays the single fold sink (the shell does not re-fold)
- [ ] **Global ModeBanner mounted** (P7.4) reflecting the store's `mode` (live/replay); the **run-health panel** (P6.8 `getRunHealth`) mounted; a **secret-redaction trust indicator** shows redaction is active (a static §13 affordance — never renders a secret)
- [ ] **Panel set mounted** (run-launcher P7.5, lineage P7.7, charts P7.8, energy P7.9, candidate-inspector P7.10, critic-gauntlet P7.11, subtype-check P7.12, final-idea P7.13) — each fed the store/event-list; the lineage node `dataRef`/`onSelect` targets route to the inspector/evidence/final-idea panels (the link-not-embed wiring the panels exposed)
- [ ] **Resync on mount + sequence-keyed:** the shell resyncs the store from REST on mount (P7.2 `resync`) before/alongside the stream, so a fresh load + a live stream + a reconnect all reach the same view (sequence sole ordering, SSE non-authoritative)
- [ ] Adherence-clean (var() tokens, no hex); no apps/api import (rule #6); no secret in the client (rule #4); accessible/projector-legible (rule #4)
- [ ] Unit tests pass (happy-dom + injected runClient/sseStream/store doubles); count reported; `/preflight` (web) clean

## Wiring / entry point (Step 7.5)
**This IS the wiring slice — the production entry point.** The shell is mounted at the app root (`App.tsx`/`main.tsx`); it's the first consumer of the runStore + sseStream IoC + every panel. (The live BACKEND wiring — real SSE endpoint, real getLineage/getCandidate — lands at the demo→cody merge; here the seam is the injected data-client.)

## Files expected to touch
**New:**
- `apps/web/src/routes/Dashboard.tsx` (or per the established layout) — the shell: constructs store + stream, wires the IoC, mounts the panels + ModeBanner + health + trust-indicator
- `apps/web/src/routes/dashboardWiring.ts` — the pure wiring helper (store+stream construction + the onEvent/onError IoC + resync-on-mount), testable without the DOM
- `apps/web/test/unit/routes/{dashboardWiring,Dashboard}.test.{ts,tsx}`

**Modified:**
- `apps/web/src/App.tsx` / `main.tsx` — mount the Dashboard shell at the root (replace the placeholder)

If implementation needs files beyond this, **flag at Step 2.5**.

## RED test outline
1. **`test_sse_onEvent_folds_into_store`** — a live envelope delivered to the wired `onEvent` folds into the store (store.applyEvent called; view state advances). Why: §11/§2 IoC.
2. **`test_sse_onError_polls`** — a stream error triggers `store.poll()` (polling fallback). Why: §11 fallback.
3. **`test_resync_on_mount`** — the shell resyncs the store from REST on mount (resync called) so a fresh load reaches the projection view. Why: §11 resync.
4. **`test_mode_banner_reflects_store_mode`** — the ModeBanner shows live/replay per the store's mode. Why: §12/P7.4.
5. **`test_trust_indicator_no_secret`** — the redaction trust indicator renders the "redaction active" affordance and never a secret value. Why: §13/rule #4.
6. **`test_panels_mounted_with_targets`** — the panel set is mounted; a lineage node dataRef/onSelect routes to the inspector/evidence panels (the link targets resolve within the shell). Why: §12 composition.
7. **`test_no_apps_api_import`** — structural (rule #6).

## Cross-doc invariant impact
- **Model field changes:** none. **§2.5-seam:** none.
- **Orchestrator doc rows (Step 9):** likely a LESSONS entry (the shell wires the P7.2 deferred SSE-store IoC + resync-on-mount + composes the panel set via link targets; the live-producer integration-confirms remain merge-time). I author hot. The integration-confirm carry-forwards (dataRef bridge, run.configured) are NOT closed here — they DELETE at the demo→cody merge.

## Things to flag at Step 2.5
1. **Shell location + App mount.** Default: `routes/Dashboard.tsx` (per the apps/web module-org `routes/`) mounted at `App.tsx` root; the pure wiring in `routes/dashboardWiring.ts` (testable without the DOM, mirroring the panel pure-logic split). Confirm.
2. **IoC construction.** Default: `createSseStream({ onEvent: store.applyEvent, onError: () => store.poll() })` exactly per LESSONS §2 — the store is the sink, the shell wires it, never re-folds; resync-on-mount before/with the stream. Confirm.
3. **Integration-confirm scope.** Default: this slice wires against the INJECTED data-client + fixtures; the live-producer confirms (dataRef↔entity-id bridge, run.configured-carries-RunConfig.caps) stay carry-forward → demo→cody merge (the live runtime isn't on the demo fork). Confirm we do NOT block P7.14 on live-backend wiring.

## Dependencies + sequencing
- **Depends on:** P7.1 (runClient/sseStream), P7.2 (runStore/resync/poll — the deferred IoC), P7.4 (ModeBanner), P6.8 (run-health), P7.5–P7.13 (the panel set) — all landed. Independent of apps/api (injected seam).
- **Blocks:** P7.15 (the Playwright smoke renders the mounted shell: start → live events → final-idea links resolve). Phase 7 completes after P7.14 + P7.15.

## Estimated commit count
**1.** Composition/wiring slice (shell + the pure wiring helper). Not safety-invariant (read-only over projections; the only writes are the contract commands the run-launcher/stop-control already issue; rule #2 SSE-non-authoritative is the wiring discipline pinned by the IoC tests). Step-8: code-quality phase-boundary; security optional (no secret — the trust indicator is a static affordance, pinned by T5).

## Lessons-logged candidates anticipated
- **Convention candidate** — "the shell wires the P7.2 deferred SSE-store IoC (`createSseStream({onEvent: store.applyEvent, onError: store.poll})`) + resyncs-on-mount; it composes the panel set via the dataRef/candidateId link targets (link-not-embed) the panels exposed; the store stays the single fold sink (the shell never re-folds); the live-producer integration-confirms (dataRef bridge, run.configured shape) are merge-time, not shell-time." I author hot.

## How to invoke
> web session oriented — `/tdd`. cwd `apps/web/`. Stage only `apps/web/...`. (Round-3 web slice 9 — the shell/wiring; composes P7.5–P7.13 + the P7.2 deferred IoC.)
1. **Run `/tdd dashboard_shell_and_sse_wiring`.**
2. **Step 2.5** — answer the 3 questions (esp. Q2 IoC, Q3 integration-confirm scope), send the coverage map.
3. **Step 9** — surface the shell-wiring LESSONS candidate + confirm the merge-time integration items stay carry-forward.
