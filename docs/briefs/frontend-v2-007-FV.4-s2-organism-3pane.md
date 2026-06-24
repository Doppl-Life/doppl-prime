# /tdd brief — s2_organism_view_3pane_shell

## Feature
Build the **S2 Organism View** — the 3-pane centerpiece — at `/runs/:id` (+ `/runs/:id/replay`), replacing FV.1's interim Dashboard mount: a **LEFT rail** (run `StopControl` + an **agent roster** derived from the lineage's agenome nodes) · a **CENTER** pane (the reused `LineageGraph`, live) · a **RIGHT** inspector **drawer slot** (empty/placeholder for FV.4 — FV.5 wires node-click → content). It **re-homes the existing tested live wiring** intact — the `RunStore`/`useSyncExternalStore` fold, the `wireRunStream` SSE connection, and the PD.20 debounced lineage/health re-fetch — so the graph still grows live. The launcher stays at `/launch` (Dashboard); FV.4 does NOT touch the launcher, the held-out judge, or the contract. The node-click→inspector wiring + the deep telemetry are **FV.5**; the ActivityTicker/gauges/charts polish is **FV.6** — FV.4 builds the **shell + live wiring + roster**.

## Use case + traceability
- **Task ID:** FV.4
- **Architecture sections it implements:** `ARCHITECTURE.md §12` (frontend dashboard — the live observatory, real-time in-flight window, per-node working sub-state, projector-legibility), `ARCHITECTURE.md §10` (lineage graph & `LineageGraphProjection` — the React Flow render FV.4 embeds in the center pane)
- **Related context:**
  - Phase plan: `docs/planning/frontend-v2-phase-plan.md` (FV.4 row — "Left rail (controls + roster) · center (reused LineageGraph, live) · right (inspector drawer); re-home the tested Dashboard SSE/lineage/health/energy wiring incl. the PD.20 live re-fetch. Backend: EXISTS").
  - **Reuse (do NOT rebuild):** `apps/web/src/routes/Dashboard.tsx` — the monolithic observatory; the live wiring to re-home (the `useEffect` at ~172–233: the `store` + `useSyncExternalStore`, `wireRunStream` from `dashboardWiring.ts`, the `fold`/`lineage`/`health` state, the **PD.20 debounced `refetchProjections` on the SSE cadence + forced-on-terminal**, the `selectedCandidateId` state). `apps/web/src/lineage/LineageGraph.tsx` (props `{projection, events?}` — read-only React Flow; **no `onSelect` yet — FV.5 adds it**; FV.4 embeds it as-is). `apps/web/src/components/run/StopControl.tsx`. The FV.0 `ds/` primitives (`AgenomeCard`, `StatusBadge`, `Meter`, the SystemState shells) for the roster + drawer-empty state.
  - FV.1 (`0c670d9`): the router + `RunClientProvider`/`useRunClient` + the AppShell; `/runs/:id` + `/runs/:id/replay` route to the run component with `runId`(useParams)+`mode`.
  - **No agent-roster component exists** → compose it from `lineage.nodes.filter(n => n.type === 'agenome')` + live status from the fold (the DS `organism-view/AgentRoster.jsx` prototype is the pattern — status glyph + id + gen + action + energy meter).
  - Layer rule #9 (frontend): read-only over projections; commands via the existing client; no contract mutation; resync from last sequence (the store already does).
  - Safety / DS rules: status = shape+icon+label (StatusBadge); LIVE vs REPLAY unmistakable (the ModeBanner from the AppShell slot / mode prop); motion honors `prefers-reduced-motion`; machine-truth verbatim.

## Acceptance criteria (what "done" means)
- [ ] A new `S2OrganismView` (or `OrganismView`) component mounts at `/runs/:id` (live) + `/runs/:id/replay` (replay) — replacing FV.1's interim Dashboard mount in `routes.tsx` — as a **3-pane layout** (LEFT rail | CENTER | RIGHT drawer) using the token/`CSSProperties` convention (a `grid` `gridTemplateColumns: 'auto 1fr <drawer>'` or equivalent; no raw hex/px).
- [ ] **CENTER:** the reused `LineageGraph` renders live (`projection` = the re-fetched lineage, `events` = the fold) — the graph **grows live** on the SSE cadence (the PD.20 re-fetch behavior preserved; forced-immediate on terminal).
- [ ] **LEFT rail:** the run `StopControl` (re-homed) + an **agent roster** derived from `lineage.nodes.filter(agenome)` with live per-agenome status (StatusBadge, shape+icon+label) + energy where available (Meter) — no new API call (lineage + fold only); empty/loading honest (SystemState).
- [ ] **RIGHT:** an inspector **drawer slot** — a container with an **empty/placeholder state** for FV.4 (a close affordance + the `selectedCandidateId` state wired to open/close), motion honoring `prefers-reduced-motion`. **FV.5 wires node-click → the drawer content** (CandidateInspector/AgenomeInspector) — FV.4 builds the slot + the open/close, NOT the content.
- [ ] **The live wiring is re-homed INTACT** — the `store`/`useSyncExternalStore`, `wireRunStream` SSE, the debounced lineage/health re-fetch (forced-on-terminal), and the `selectedCandidateId` state move into the new shell (or a shared `useRunObservatory` hook — Step-2.5 Q1) **without breaking live updates**; replay mode (`/runs/:id/replay`) still reconstructs from persisted events (no provider call).
- [ ] LIVE vs REPLAY is unmistakable (the mode banner reflects the route's mode); the existing fitness/energy panels are not LOST (Step-2.5 Q2 — kept in a secondary region or deferred to FV.6, not dropped).
- [ ] web unit suite green (3-pane layout + re-homed live wiring + roster derivation + drawer open/close tests, injecting `store`/`eventSourceFactory`/`createStream` per the Dashboard.test pattern); `/preflight` clean. **Backend: EXISTS**; **ZERO contract surface**.

## Wiring / entry point (Step 7.5)
`apps/web/src/app/routes.tsx` — `/runs/:id` + `/runs/:id/replay` mount `S2OrganismView` (runId from `useParams`, mode from the route) instead of the interim Dashboard. The live observatory wiring (re-homed from Dashboard, or a shared `useRunObservatory` hook) drives the panes. Confirm the graph grows live on SSE + the StopControl issues the stop + replay reconstructs from persisted events. The launcher stays at `/launch` (Dashboard, unchanged). The node-click→drawer content is FV.5 (the slot exists + opens/closes here).

## Files expected to touch
**New:**
- `apps/web/src/routes/S2OrganismView.tsx` — the 3-pane shell
- `apps/web/src/components/run/AgentRoster.tsx` — the left-rail roster (from lineage agenome nodes + fold status)
- `apps/web/src/components/run/InspectorDrawer.tsx` — the right drawer container (empty/placeholder + open/close)
- (per Q1) `apps/web/src/routes/useRunObservatory.ts` — the extracted live-wiring hook (if extracting rather than duplicating)
- Test files under `apps/web/test/unit/routes/` + `components/run/`

**Modified:**
- `apps/web/src/app/routes.tsx` — `/runs/:id[/replay]` → `S2OrganismView`
- (per Q1) `apps/web/src/routes/Dashboard.tsx` — if extracting the observatory wiring into the shared hook (Dashboard's observatory portion can then drop or call the hook); minimal — don't break the `/launch` launcher
- `apps/web/test/e2e/dashboard-smoke.spec.ts` — the gated smoke's `/runs/:id` view if the structure moved (keep green)

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)
Tests in `apps/web/test/unit/routes/S2OrganismView.test.tsx` + `components/run/{AgentRoster,InspectorDrawer}.test.tsx` (`happy-dom`, inject `store`/`eventSourceFactory`/`createStream` per `Dashboard.test`, `MemoryRouter`):

1. **`test_three_pane_layout_renders`** — Asserts: the shell renders a LEFT rail, a CENTER (LineageGraph), and a RIGHT drawer region. Why: §12 3-pane.
2. **`test_lineage_grows_live_on_sse`** — Asserts: an SSE envelope → the debounced lineage re-fetch fires (PD.20 preserved); a terminal event forces immediate re-fetch. Why: §12 live observatory (the "watch it evolve" behavior).
3. **`test_agent_roster_derived_from_lineage`** — Asserts: the roster lists one row per `agenome` lineage node with a StatusBadge (shape+icon+label) for its status; no extra API call. Why: §12 roster.
4. **`test_stop_control_in_left_rail`** — Asserts: the StopControl renders in the LEFT rail and issues the stop command. Why: run controls re-homed.
5. **`test_inspector_drawer_empty_then_open_close`** — Asserts: the drawer is empty/closed by default; setting `selectedCandidateId` opens it (placeholder content); a close affordance clears it. Why: the FV.5 slot (open/close built here; content deferred).
6. **`test_replay_mode_reconstructs_no_live`** — Asserts: `/runs/:id/replay` renders the observatory in replay mode (mode banner replay); reconstructs from persisted events (no provider call). Why: §10/§12 replay (rule #7).
7. **`test_live_wiring_rehomed_intact`** — Asserts: the re-homed wiring (store fold + wireRunStream + the cleanup) behaves as in Dashboard.test (the store subscription updates view state; the stream closes on unmount). Why: no live-update regression.
8. **`test_no_raw_hex_or_px_in_shell`** (adherence) — Asserts: the new shell/roster/drawer files use `var(--token)` only. Why: DS rule 3/5.
9. **`test_reduced_motion_drawer`** — Asserts: the drawer animation uses a named motion token / honors the global reduced-motion guard (structural). Why: DS rule 4.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** NONE — pure presentation; read-only over the existing projections; no contract surface.
- **Orchestrator doc rows to write hot (Step 9 routing):** an `ARCHITECTURE.md §12` note refinement — `/runs/:id` is the 3-pane S2 Organism View (left controls+roster · center LineageGraph live · right inspector drawer slot); the live wiring re-homed (PD.20 re-fetch preserved); FV.5 wires node-click. A `apps/web/LESSONS` convention candidate (extract-the-live-wiring-into-a-hook; roster-from-lineage; the drawer-slot-before-content pattern). Orchestrator writes hot.
- **shared-contract seam model touched?** No.

## Things to flag at Step 2.5
1. **Re-home the live wiring: extract a `useRunObservatory` hook vs duplicate.** My default vote: **extract a shared `useRunObservatory(runId, mode, deps)` hook** (the store + `useSyncExternalStore` + `wireRunStream` + the debounced re-fetch + `selectedCandidateId`) that `S2OrganismView` consumes — cleaner than duplicating Dashboard's effect, and it keeps the tested behavior in one place. Dashboard can keep its own copy until FV.3 retires its observatory (don't break `/launch`). You know Dashboard's internals — pick the cleanest extraction; flag if it ripples.
2. **Fitness/energy charts — keep, relocate, or defer to FV.6?** My default vote: **don't lose them** — render the existing `FitnessOverTime`/`EnergyPanel` in a secondary region (e.g. below the graph or a collapsible strip) for FV.4; the polished telemetry placement (ActivityTicker, gauges, the charts in-pane) is **FV.6**. Minimal: keep them mounted somewhere visible; flag if the 3-pane layout makes a clean secondary region awkward (then defer to FV.6 with a note).
3. **Agent roster source.** My default vote: **derive from `lineage.nodes.filter(agenome)` + fold status** — no new API call (the lineage projection + the event fold already carry agenome status). Use `AgenomeCard` (FV.0) or a compact roster row from `StatusBadge` + `Meter`.
4. **Drawer positioning.** My default vote: a **right-column drawer** (the DS prototype's ~460px right panel; absolute/position within the right pane OR a fixed right-side panel) with an empty state + close; honor `prefers-reduced-motion` for the slide. FV.4 = the slot + open/close; FV.5 = the content.
5. **Left rail beyond StopControl.** My default vote: LEFT = `StopControl` + the agent roster ONLY (the launcher panels — OperatorPrompt/RunConfig/FallbackLadder — are S1/`/launch`, NOT S2). No quick-start in S2.

## Dependencies + sequencing
- **Depends on:** FV.1 (`0c670d9`, router + provider) + FV.0 (`9a6be17`, ds/). The tested Dashboard observatory wiring + LineageGraph (reuse). Backend `listRuns`/`getLineage`/`getRunHealth`/`getEvents`/SSE (EXISTS). Backend-independent of Phase FB.
- **Blocks:** FV.5 (node-click inspector — mounts content into FV.4's drawer slot + adds `LineageGraph.onSelect`); FV.6 (live observatory telemetry — ActivityTicker/roster polish/gauges into the shell). FV.4 is the centerpiece the rest of the observatory hangs on.

## Estimated commit count
**1–2.** The 3-pane shell + the re-homed wiring + the roster + the drawer slot is one coherent slice (same area, shared context, no safety invariant — read-only presentation). MAY split into 2 (the `useRunObservatory` extraction + shell → the roster + drawer slot) if the diff grows; flag at Step 7.5. Each ends in a `feat(web)` commit.

## Lessons-logged candidates anticipated
- **Convention candidate** — "the S2 3-pane shell re-homes the tested live wiring via a shared `useRunObservatory` hook (one place for the store + SSE + the PD.20 re-fetch), derives the agent roster from the lineage agenome nodes + the event fold (no new API), and builds the inspector drawer SLOT (open/close + empty state) before its content (FV.5 wires node-click) — the centerpiece composes reused pieces, it doesn't rebuild them."
- **Architecture-doc note candidate** — §12: `/runs/:id` is the 3-pane S2 Organism View; the live wiring + PD.20 re-fetch preserved; FV.5/FV.6 layer the inspector + telemetry.
- **Future TODO — operational** — responsive collapse of the left rail / drawer at narrow viewport (FV.9 projector/a11y polish).
