# Session frontend-v2-001 — FV web rebuild (round 1): DS port → router → S0 → S2 3-pane

- **Date:** 2026-06-24
- **Phase:** frontend-v2 / Phase FV (web rebuild — `apps/web`)
- **Track:** frontend-v2 (worktree `../Capstone-frontend-v2`, branch `track/frontend-v2`)
- **Implementer:** frontend-v2-web-implementer
- **Predecessor:** _(none — first frontend-v2 web session; track branched off cody)_
- **Successor:** _(TBD — fresh team picks up FV.3/FV.5–FV.9)_

## Why this session existed

Phase FV is the `apps/web` rebuild: refactor the single scrolling `Dashboard` into a real
multi-screen app matching the Doppl design system (S0 Runs Home · S1 Launcher · S2 Organism
3-pane · node-click inspector · S5 Final Idea), **reusing** the tested data layer
(runClient/SSE/reducer/React-Flow lineage) — implement the design, don't redesign. This round
landed the backend-independent FV slices that don't depend on Phase FB: **FV.0, FV.1, FV.2, FV.4**.

## What was built

### FV.0 — DS component port (`9a6be17`)
**Files created:** `src/components/ds/{Button,Meter,EmptyState,LoadingState,ErrorState,DegradedState,CandidateCard,AgenomeCard,ActivityTicker,HealthIndicator,RunEnergyGauge}.tsx` (11 components hand-translated TS-strict from `docs/doppl-design-system/components`, never importing the prototype `.jsx`) + `src/components/ds/index.ts` (the canonical FV.1+ import barrel, named re-exports + re-exported StatusBadge/ModeBanner). Tests: `test/unit/components/ds/{core,feedback,observatory}.test.tsx` + `adherence.test.ts`.
**Files modified:** `src/components/feedback/ModeBanner.tsx` (reconcile: `position: relative` + `zIndex: var(--z-banner)` so the component owns rule-2's top-z); `src/styles/tokens/motion.css` (+`--motion-shimmer-ms: 1400ms`, the LoadingState shimmer's named beat). StatusBadge/status-map left unchanged (verdict: already frozen-enum-faithful + adherence-clean).

### FV.1 — app shell + router (`0c670d9`)
**Files created:** `src/data/RunClientProvider.tsx` (app-level runClient context + `useRunClient`, throws outside provider); `src/components/app/{useTheme.ts,ThemeToggle.tsx,AppShell.tsx}` (dark/hc/light theme on `document.documentElement` + `localStorage['doppl-theme']`; AppShell wordmark + reserved ModeBanner slot + toggle + `<Outlet/>`); `src/app/routes.tsx` (the route table). Tests: `test/unit/app/{router,ThemeToggle,RunClientProvider,AppShell}.test.tsx`.
**Files modified:** `src/App.tsx` (BrowserRouter + RunClientProvider + AppRoutes); `src/routes/Dashboard.tsx` (optional `onObserveLive`/`onObserveReplay` nav callbacks, internal observe state kept as fallback); `apps/web/package.json` (+`react-router-dom ^7.18.0`) + workspace `pnpm-lock.yaml`; `test/e2e/dashboard-smoke.spec.ts` (post-start URL assertion).

### FV.2 — S0 Runs Home (`5ee233b`)
**Files created:** `src/routes/RunsHomeScreen.tsx` (`/` — `listRuns` → RunCard grid + Loading/Error(+retry)/Empty states + New Run CTA → `/launch`); `src/components/run/RunCard.tsx` (machine-truth-minimal off `RunSummary` — StatusBadge + runId + seq; status-derived actions Open live/Replay/Final idea). Tests: `test/unit/routes/RunsHomeScreen.test.tsx` + `test/unit/components/run/RunCard.test.tsx`.
**Files modified:** `src/app/routes.tsx` (`/`→RunsHomeScreen; `/launch` REPOINTED from FV.1 redirect to the interim Dashboard launcher — demo-continuity, RunListPanel stays reachable); `test/unit/app/router.test.tsx` + `test/unit/app-shell.test.tsx` (updated to track the `/`+`/launch` behavior change); the gated e2e smoke (`/`→New Run→`/launch` entry).

### FV.4 — S2 Organism View 3-pane shell (`8e6400d`)
**Files created:** `src/routes/S2OrganismView.tsx` (3-pane: LEFT StopControl+AgentRoster · CENTER reused LineageGraph live + fitness/energy strip · RIGHT InspectorDrawer slot); `src/routes/useRunObservatory.ts` (the tested live wiring EXTRACTED into a shared hook — RunStore/useSyncExternalStore fold + wireRunStream SSE + the PD.20 coalesced-debounce/forced-on-terminal lineage/health re-fetch + selectedCandidateId); `src/components/run/AgentRoster.tsx` (from `lineage.nodes.filter(agenome)` + fold; energy Meter only when `node.metrics` carries it); `src/components/run/InspectorDrawer.tsx` (right-column slot — open/close + empty placeholder; FV.5 wires content). Tests: `test/unit/routes/S2OrganismView.test.tsx` + `test/unit/components/run/{AgentRoster,InspectorDrawer}.test.tsx`.
**Files modified:** `src/app/routes.tsx` (`/runs/:id`+`/replay`→S2OrganismView; `/launch`+`/final` keep Dashboard interim); the gated e2e smoke (assert 3-pane at `/runs/run_1`, then `goto /final` for the proof panel).

## Decisions made

- **DS components hand-translated, never importing the prototype `.jsx`; token-only (`var(--token)`, no raw hex/px — raw-px → `--space-*`/`--motion-*` tokens; bare numeric geometry exempt per the lineage/charts adherence precedent).** ds/index.ts is the one canonical import surface; shared StatusBadge/ModeBanner reconciled in-place + re-exported (zero churn to existing imports).
- **Added `--motion-shimmer-ms` token** (not reused `--motion-pulse-ms`) — distinct named beats per rule #4; makes web `motion.css` a superset of the DS source (backport candidate).
- **react-router-dom v7.18.0** (declarative API confirmed via Context7); **runClient app-level via RunClientProvider**; **theme on `document.documentElement` + localStorage**; **observed run+mode URL-derived** (RunRoute/OrganismRoute `key=${mode}:${id}` remounts per URL).
- **`/launch` repoint (FV.2)** to the interim Dashboard launcher so the New Run flow reaches a working start-a-run path (and RunListPanel stays reachable) — preserves the demo through the screen-replacement.
- **S0 cards machine-truth-minimal** off `RunSummary` ({runId,status,sequenceThrough}) — no fabricated title/energy/winner (DS rule 5); status-derived per-card actions.
- **FV.4 re-homes the live wiring via a shared `useRunObservatory` hook** (S2 consumes it); **Dashboard kept its inline copy** (a tracked temporary duplication — lowest risk to `/launch` + the 12 Dashboard.test cases; FV.3 retires Dashboard's observatory + de-dups).
- **`/runs/:id/final` stays the interim Dashboard** (it renders FinalIdeaPanel on terminal) until FV.7 builds the dedicated S5 — preserves the demo's final-idea proof URL.

## Decisions explicitly NOT made (deferred)

- **ModeBanner AppShell-slot-lift** — S2 renders ModeBanner inside the view (satisfies "banner reflects the route mode"); lifting it into the AppShell reserved slot needs a portal/context → re-routed to FV.6/FV.9 (orchestrator confirmed).
- **Rich S0 card enrichment** (title/energy/best-candidate) + a reviewer-mode New Run gate → Carry-forward (needs `listRuns`/`RunSummary` enrichment or lazy per-card fetch).
- **Responsive left-rail/drawer collapse** at narrow viewport → FV.9 projector/a11y polish.
- **Node-click → inspector content** (FV.5), **telemetry polish/ActivityTicker/gauges** (FV.6) — FV.4 built the shell + slot + wiring + roster only.

## TDD compliance

**Clean across all 4 slices.** Every slice ran RED (confirmed failing for the right reason — missing source module / unbuilt behavior) → Step-2.5 orchestrator review (APPROVED, with FV.1 `/final`-pin ADD + FV.4 motion-token/zIndex grants) → GREEN → full suite → reachability → typecheck/lint/format → Step-9 → commit. No test written after implementation. Two GREEN-time test adjustments (neither an impl behavior change): FV.4 `test_inspector_drawer_empty_default` matcher tightened `/select a node/i`→`/inspect its details/i` (the broad regex collided with React Flow's a11y live-region text); FV.2 updated FV.1's router/app-shell test assertions to track the intentional `/`+`/launch` behavior change (pre-approved at Step-2.5).

## Reachability

- **FV.0 ds/** — reachable via the `ds/index.ts` barrel (the FV.1+ consumption surface; pinned by `test_ds_barrel_exports_resolve`); intentionally not route-mounted this slice. Reconciled ModeBanner live-mounted at Dashboard (regression-free).
- **FV.1 router** — `main.tsx → App → BrowserRouter → RunClientProvider → AppRoutes → AppShell → routes → Dashboard`; theme toggle + wordmark on every route.
- **FV.2 RunsHomeScreen** — `/` (index route) → RunCard; `/launch` → Dashboard launcher (RunListPanel reachable, not orphaned).
- **FV.4 S2OrganismView** — `/runs/:id` + `/replay` (OrganismRoute); AgentRoster/InspectorDrawer/useRunObservatory consumed by it; `/launch`+`/final` keep Dashboard.
- The live demo path (`/` → New Run → `/launch` → start → `/runs/:id` 3-pane → Replay/Final) is pinned by the router + screen tests + the gated e2e smoke.
- **No tested-but-unwired gaps.**

## Open follow-ups

Step-9 items were routed hot to the orchestrator each slice; its `/orchestrate-end` is the single verify pass. Still-open:

- **apps/web LESSONS** convention rows (orchestrator writes hot): FV.0 DS-port discipline · FV.1 router-integration (URL-derived run/mode, RunClientProvider, theme-on-documentElement) · FV.2 S0 machine-truth-minimal cards + `/launch`-repoint-preserves-demo · FV.4 useRunObservatory-extraction + roster-from-lineage + drawer-slot-before-content (+ the `exactOptionalPropertyTypes` pass-through-seam `?: T | undefined` note).
- **ARCHITECTURE.md §12** note (orchestrator writes hot): the dashboard is now a multi-route app behind an AppShell (wordmark + reserved ModeBanner slot + theme toggle); observed run+mode URL-derived; `/runs/:id` = the 3-pane S2 Organism View (left controls+roster · center LineageGraph live · right inspector drawer slot); the data layer is route-agnostic.
- **Carry-forward** (orchestrator triages): (a) the live-wiring DUP — Dashboard's inline observatory copy vs the extracted `useRunObservatory`; FV.3 retires Dashboard's observatory + de-dups. (b) ModeBanner AppShell-slot-lift → FV.6/FV.9. (c) responsive left-rail/drawer collapse → FV.9. (d) rich S0 card enrichment + reviewer-mode New Run gate. (e) `--motion-shimmer-ms` backport to the DS kit's `motion.css`.
- **Next slices:** FV.3 (S1 Launcher — gated on FB.0–FB.4), FV.5 (node-click inspector — mounts content into FV.4's drawer slot + adds `LineageGraph.onSelect`), FV.6 (telemetry), FV.7 (S5 Final), FV.8 (replay scrubber), FV.9 (`/phase-exit FV`). → a fresh team.

## Cross-doc invariant audit

**Clean.** All 4 web slices touched **zero contract surface** (verified: my commits touched no `packages/contracts`/`ARCHITECTURE.md`/`IMPLEMENTATION_PLAN.md` — 43 files, all under `apps/web/`). Multi-track memory check: every slice flagged "no contract field touched" at Step 9; orchestrator confirmed receipt each time. No drift.
