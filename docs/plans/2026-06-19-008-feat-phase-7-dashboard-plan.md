---
title: "feat: Phase 7 — Frontend dashboard"
type: feat
status: active
created: 2026-06-19
owner: melissa
depth: standard
spec_anchors:
  - ARCHITECTURE.md §12
  - ARCHITECTURE.md §10
  - ARCHITECTURE.md §11
  - ARCHITECTURE.md §13
  - ARCHITECTURE.md §16
  - ARCHITECTURE.md §17
  - IMPLEMENTATION_PLAN.md Phase 7 (P7.1–P7.15)
depends_on:
  - docs/plans/2026-06-19-001-feat-scaffold-and-phase-0-contract-freeze-plan.md
  - docs/plans/2026-06-19-002-feat-phase-1-persistence-and-event-store-plan.md
  - docs/plans/2026-06-19-003-feat-phase-2-model-gateway-plan.md
  - docs/plans/2026-06-19-004-feat-phase-3-runtime-kernel-plan.md
  - docs/plans/2026-06-19-005-feat-phase-4-verifier-council-plan.md
  - docs/plans/2026-06-19-006-feat-phase-5-selection-plan.md
  - docs/plans/2026-06-19-007-feat-phase-6-projections-api-observability-plan.md
---

## Summary

Phase 7 of `IMPLEMENTATION_PLAN.md` — **the operator dashboard**. Adds a new `apps/web` workspace consuming Phase 6's REST + SSE surface to drive the demo: typed client over Zod-validated payloads; sequence-keyed view-store reducer surviving SSE disconnects via `Last-Event-ID` resync with polling fallback; an accessible status primitive used everywhere (shape + label + icon + colorblind-safe color, never color alone); the operator run-config panel with client-side cap-max validation; live/replay mode indicator; React Flow lineage tree with five custom node types + a deterministic Dagre layout (decision D3); fitness-over-time + generation-comparison Recharts series (decision D2); energy-per-agenome panel; candidate inspector + critic-gauntlet + subtype-check evidence panels; the final-surviving-idea proof panel whose links resolve to lineage / critics / checks / score / energy / traces; the dashboard shell with health/diagnostics; and one Playwright happy-path smoke (start → live events → final-idea links resolve).

The frontend is a **first-class acceptance surface shown to a room**. It defines NO Appendix-A models. Every payload is parsed through schemas re-exported from `packages/contracts`. The only writes it issues are the two idempotent commands Phase 6 exposed: `POST /runs` and `POST /runs/:id/stop`.

## Problem Frame

Phase 6 wired REST + SSE but only the engineer-CLI path can drive it. For the showcase audience to *see* an agent evolution run unfold, we need a projector-legible dashboard that:

1. **Drives the demo** — configure caps, start a run, stop it cleanly.
2. **Watches it live** — SSE-driven lineage updates, fitness chart climbing across generations.
3. **Proves the final idea** — every claim about why the surviving candidate won links back to its critic reviews, check results, score components, energy spend, and traces.
4. **Survives the demo room** — projector + colorblind viewers + intermittent network. SSE drops resync from `Last-Event-ID`; the room never sees a broken state.

The dashboard is the demo. Everything before this PR was structural; this PR is what people see.

---

## Scope

### In scope

- **`apps/web` workspace** — Vite + React 18 + TypeScript SPA (decision D1). Workspace package added to `pnpm-workspace.yaml`.
- **REST + SSE typed client** (P7.1) — `runClient.ts` for all GET/POST endpoints; `sseStream.ts` for `Last-Event-ID` resume; payloads validated through `packages/contracts` Zod schemas.
- **Run event store / reducer** (P7.2) — sequence-keyed; idempotent re-apply; disconnect resyncs from last applied sequence; degrades to polling on stalled live.
- **Accessible status primitive** (P7.3) — `StatusIndicator` mapping every domain status enum to a fixed shape + icon + label + colorblind-safe color. High-contrast theme tokens + projector-legible font scale defined centrally.
- **Live/replay mode indicator** (P7.4) — persistently visible across all panels.
- **Operator run-config panel** (P7.5) — Zod-validated form; cap-overrides rejected client-side above validated ceilings (only lowers allowed); both subtypes selectable; idempotent submit via `POST /runs`.
- **Stop control** (P7.6) — idempotent `POST /runs/:id/stop`; disabled in terminal state; preserves partial evidence after stop.
- **React Flow lineage tree** (P7.7) — five custom node types (agenome, candidate, critic_review, check_result, scoring); Dagre layout (D3) deterministic given the same projection bytes; incremental updates as `sequenceThrough` advances.
- **Fitness-over-time + generation-comparison charts** (P7.8) — Recharts (D2); pattern + marker + label encoding in addition to color.
- **Energy-per-agenome panel** (P7.9) — `energy.spent` aggregated per agenome; energy_exhausted state distinct; per-row links to lineage node + candidates.
- **Candidate inspector** (P7.10) — loads via `GET /runs/:id/candidates/:cid`; renders both subtype payloads; `EvidenceRef` resolver renders Postgres-tier links only.
- **Critic-gauntlet panel** (P7.11) — `CriticReview` records; candidate text presented as untrusted DATA (rubric vs candidate visually delimited per §7/§14).
- **Subtype-check evidence panel** (P7.12) — `CheckResult` records; skip reason + error visible; adapter outputs only.
- **Final-surviving-idea proof panel** (P7.13) — links resolve to all upstream panels.
- **Dashboard shell + health/diagnostics** (P7.14) — composes the panel set; mode indicator + stop control persistently visible; renders only redacted payloads (trust pin).
- **Playwright happy-path smoke** (P7.15) — start → live events fold → final-idea links resolve.

### Deferred to Follow-Up Work

- Dark-mode polish. The high-contrast theme is the only theme this PR ships.
- Mobile / responsive breakpoints. The dashboard targets a projector / monitor.
- Multi-run history view. The dashboard shows one active run at a time; switching to history is Phase D / future polish.
- Detailed Recharts tooltip customization beyond labels + markers. MVP keeps tooltips on the default Recharts behavior.

### Out of scope

- Any Appendix-A model definition. `apps/web` consumes Zod schemas only.
- Authoritative writes (no PUT/DELETE; no PATCH).
- A backend-for-frontend layer. The browser talks directly to Phase 6's Hono server.
- Authentication. Local demo only.
- An HTTP client generator from OpenAPI. The plan's hand-rolled typed client suffices.

---

## Key Technical Decisions

### D1. Vite + React 18 + TypeScript

`vite@5`, `react@18.3`, `react-dom@18.3`, `@vitejs/plugin-react`, `typescript@5.6` (workspace pin). Single-page app; no SSR. Dev server on port `5173` (Vite default), proxying `/runs` + `/model-routes` + `/healthz` to `http://localhost:3000` (Phase 6's Hono). Production build via `pnpm build` outputs static assets — Phase D may serve them from the same Hono instance later, but MVP just opens `index.html` over the dev server.

### D2. Recharts for fitness + comparison charts

`recharts@2`. React-native components, declarative `<LineChart>` / `<BarChart>` shape, native pattern + marker support. The Phase 7 spec mandates "patterns/markers/labels in addition to color" — Recharts' `<Symbols>` + `dot={true}` + per-series `strokeDasharray` cover this without custom SVG.

### D3. Dagre for React Flow layout

`@dagrejs/dagre@1`. Layered DAG layout. Pure JS, ~50KB. Deterministic: given the same node + edge set, returns the same positions byte-stable. Layout direction: `LR` (left-to-right), making generations read as columns.

`reactflow@11`. Five custom node components in `apps/web/src/lineage/nodeTypes.tsx`, one per `LineageNodeType` enum value (agenome, candidate, critic_review, check_result, scoring). Each uses the shared `StatusIndicator` primitive.

### D4. State management: built-in `useReducer` + Context

No Zustand / Redux / Jotai for MVP. The view state is a single `RunStoreState` shape ( `{ runId, mode, sequenceThrough, entities, errors[] }` ) driven by a pure reducer. A top-level `<RunStoreProvider>` wraps the app and exposes hooks (`useRunStore`, `useLineage`, `useFitnessSeries`, etc.). This keeps the dependency surface small and the data flow inspectable from one file.

### D5. Schema validation at the seam, NOT every component

The typed client parses every payload through Zod schemas at fetch / SSE-receive time. Once a `RunEventEnvelope` enters the reducer it's already validated — child components receive typed objects and trust them. A schema-validation failure surfaces as a typed `RunStoreError` recorded into the store's `errors[]`; the run remains inspectable via the REST projections.

### D6. SSE delivery is non-authoritative

`sseStream.ts` subscribes via the `EventSource` API. On message: parse JSON → `RunEventEnvelope.parse(...)` → dispatch to reducer if `sequence > sequenceThrough`. On disconnect: reconnect with `Last-Event-ID: <last applied>` header. On 3 consecutive reconnect failures: switch to polling `GET /runs/:id/events?afterSequence=<last>` every 2s. Resync from polling produces the identical fold state to live streaming.

### D7. Status semantics are codified once

A single `StatusIndicator` primitive owns the shape + icon + label + color mapping for every domain status enum:
- Agenome (7 states): seeded / active / spent / eligible_parent / reproduced / culled / failed
- Candidate (8 states): created / under_review / checked / scored / selected / rejected / culled / invalid
- Check (3 states): passed / failed / skipped
- Run terminal (4 states): completed / stopped / failed / cancelled

Unknown status renders a distinct neutral "?" indicator rather than throwing. Theme tokens (high-contrast palette + font scale) live in `theme.ts` and are consumed via CSS variables.

### D8. Playwright smoke runs against `RecordedGateway`

The smoke spins up `apps/api`'s Hono server with `DOPPL_LIVE_TESTS=0` (default), boots a `Worker` against testcontainers Postgres, posts a `RunConfig` that loads a recorded gateway fixture, and asserts:
1. Server accepts the POST → returns runId.
2. SSE stream delivers events that fold into the dashboard.
3. Final-idea panel renders with link targets that resolve to the loaded panels.

Provider-independent. Phase D will harden into the "local-first demo path."

---

## High-Level Technical Design

```
                          ┌───────────────────────────────────────────┐
                          │  Hono server (Phase 6, :3000)             │
                          │  REST + SSE + Idempotency-Key             │
                          └────────────────────┬──────────────────────┘
                                               │ Vite dev proxy
                                               ▼
                  ┌───────────────────────────────────────────────────┐
                  │  apps/web (Vite + React 18, :5173)                │
                  └───────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼────────────────────────────┐
        ▼                   ▼                            ▼
┌──────────────┐  ┌────────────────────┐   ┌─────────────────────────┐
│ runClient.ts │  │  sseStream.ts      │   │  RunStoreProvider       │
│  REST GETs   │  │   EventSource +    │   │   useReducer over       │
│  + 2 POSTs   │  │   Last-Event-ID    │   │   RunStoreState         │
│  Zod parse   │  │   polling fallback │   │   sequence-keyed        │
└──────────────┘  └─────────┬──────────┘   │   idempotent re-apply   │
                            │                └──────────┬─────────────┘
                            └────────────────────────────┤
                                                          ▼
                            ┌─────────────────────────────────────────┐
                            │   useRunStore() hook surface for panels │
                            └────────────────────────────────────────┬┘
                                                                     │
        ┌────────┬──────────┬────────┬──────────┬──────────┬─────────┼──────────────┬───────────────┐
        ▼        ▼          ▼        ▼          ▼          ▼         ▼              ▼               ▼
   RunConfig   Stop    ModeInd  LineageGraph  Charts   Energy  CandInspector   CriticGauntlet  CheckEvidence
   Panel       Ctrl    icator   (ReactFlow +  (Recharts) Panel  + EvidenceRef                   FinalIdea
                                Dagre)                                                          Panel
                                                          │
                                              ┌───────────┴─────────────┐
                                              │   StatusIndicator (D7)   │
                                              │   shape + icon + label   │
                                              │   colorblind-safe color  │
                                              └──────────────────────────┘
```

> *Directional guidance; not implementation specification.*

---

## Output Structure

```
apps/web/
  package.json
  tsconfig.json
  tsconfig.node.json
  vite.config.ts
  index.html
  playwright.config.ts
  public/
    favicon.svg
  src/
    main.tsx                          ← Vite entry
    App.tsx                           ← top-level shell
    data/
      contracts.ts                    ← re-export Zod schemas from @doppl/contracts
      runClient.ts                    ← REST client (GETs + 2 POSTs)
      sseStream.ts                    ← SSE + polling fallback
      __tests__/
        runClient.test.ts
        sseStream.test.ts
    state/
      runStore.ts                     ← provider + hooks
      reducer.ts                      ← pure RunEventEnvelope → state fold
      resync.ts                       ← polling/replay fallback
      __tests__/
        reducer.test.ts
        resync.test.ts
    ui/
      StatusIndicator.tsx
      theme.ts                        ← high-contrast tokens + font scale
      theme.css                       ← CSS variables
      status-map.ts                   ← domain enum → {shape, icon, label, color}
      __tests__/
        StatusIndicator.test.tsx
        status-map.test.ts
    panels/
      RunConfigPanel.tsx
      runConfigForm.ts                ← cap-max guard
      StopControl.tsx
      ModeIndicator.tsx
      HealthPanel.tsx
      CandidateInspector.tsx
      evidenceRef.tsx                 ← EvidenceRef resolver/link
      CriticGauntlet.tsx
      CheckEvidence.tsx
      EnergyPanel.tsx
      FinalIdeaPanel.tsx
      __tests__/
        RunConfigPanel.test.tsx
        StopControl.test.tsx
        ModeIndicator.test.tsx
        CandidateInspector.test.tsx
        CriticGauntlet.test.tsx
        CheckEvidence.test.tsx
        EnergyPanel.test.tsx
        FinalIdeaPanel.test.tsx
    lineage/
      LineageGraph.tsx
      nodeTypes.tsx                   ← 5 custom node components
      layout.ts                       ← Dagre helper
      __tests__/
        layout.test.ts
        LineageGraph.test.tsx
    charts/
      FitnessOverTime.tsx
      GenerationComparison.tsx
      chartTheme.ts
      __tests__/
        FitnessOverTime.test.tsx
        GenerationComparison.test.tsx
    layout/
      DashboardShell.tsx
      __tests__/
        DashboardShell.test.tsx
    test-utils/
      fixtures.ts                     ← sample LineageGraphProjection,
                                       RunEventEnvelope arrays, etc.
      render.tsx                      ← helper that wraps with RunStoreProvider
  tests/
    e2e/
      happy-path.spec.ts              ← Playwright smoke (P7.15)
```

Tests use Vitest + React Testing Library (already in the repo's vitest workspace).

---

## Implementation Units

### U1. Workspace scaffold + Vite + React + tsconfig

**Goal:** Create the `apps/web` workspace, install React 18 + Vite + TypeScript + Vitest deps, register in `pnpm-workspace.yaml`, expose package as `@doppl/web`. Wire Vite proxy: `/runs` and `/model-routes` and `/healthz` → `http://localhost:3000`. Boot a "Hello dashboard" `App.tsx`.

**Requirements:** Sets up the workspace; no spec requirement directly, but every following unit depends on this.

**Dependencies:** none.

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/tsconfig.node.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/index.html`
- Create: `apps/web/public/favicon.svg`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/App.tsx`
- Modify: `pnpm-workspace.yaml` (already includes `apps/*`; no change needed — verify).
- Modify: root `tsconfig.base.json` (verify path mapping for `@doppl/web` if used; not required).

**Approach:** `package.json` declares `name: "@doppl/web"`, dev deps `vite`, `@vitejs/plugin-react`, `react`, `react-dom`, `@types/react`, `@types/react-dom`, `@testing-library/react`, `@testing-library/jest-dom`, `@playwright/test`. Scripts: `dev`, `build`, `preview`, `typecheck`, `test`, `test:e2e`. `vite.config.ts` configures the react plugin + dev server proxy. `App.tsx` renders "Doppl Dashboard — Phase 7 scaffold" so `pnpm --filter @doppl/web dev` works end-to-end.

**Test scenarios:**
- `pnpm install` succeeds + workspace resolves `@doppl/web`.
- `pnpm --filter @doppl/web typecheck` clean.
- `pnpm --filter @doppl/web build` produces `dist/`.
- (Manual) `pnpm --filter @doppl/web dev` serves the placeholder page.

**Verification:** Subsequent units can import from `@doppl/web/src/...`. CI runs `pnpm -w typecheck` clean with the new package included.

---

### U2. REST + SSE typed client (P7.1)

**Goal:** Hand-rolled fetch-based client for every Phase 6 endpoint. Every response parsed through Zod schemas from `@doppl/contracts`. SSE handler manages `Last-Event-ID` resume + polling fallback after 3 reconnect failures.

**Requirements:** P7.1. Acceptance: read-only seam exposes only contract-defined endpoints + the 2 idempotent commands; SSE de-duplicated by sequence alone; schema-validation failures surface as typed errors.

**Dependencies:** U1.

**Files:**
- Create: `apps/web/src/data/contracts.ts` — re-exports from `@doppl/contracts`.
- Create: `apps/web/src/data/runClient.ts`.
- Create: `apps/web/src/data/sseStream.ts`.
- Create: `apps/web/src/data/__tests__/runClient.test.ts`.
- Create: `apps/web/src/data/__tests__/sseStream.test.ts`.

**Approach:** `contracts.ts` re-exports the Zod schemas (`RunEventEnvelope`, `RunConfig`, `RunCaps`, `CandidateIdea`, `CriticReview`, `CheckResult`, `FitnessScore`, `NoveltyScore`, `LineageGraphProjection`, etc.) and a `RunHealth` schema (define locally as Phase 6's `RunHealth` type is currently a TS-only type; mirror its shape in a small Zod object here).

`runClient.ts`:
- `createRunClient({ baseUrl })` returns `{ listRuns, getRun, getEvents, getLineage, getReplay, getCandidate, getHealth, getModelRoutes, startRun, stopRun }`.
- Each method: `fetch(url) → JSON → Schema.parse(...)`. On parse failure → throw `ClientValidationError(path, message, raw)`.
- `startRun(config, { idempotencyKey })` POSTs with the header.

`sseStream.ts`:
- `createSseStream({ baseUrl, runId, lastEventId, onEvent, onError, onModeChange })`.
- Constructs `EventSource(url)`. On message: parse → if `sequence > lastEventId`: call `onEvent(envelope)`; otherwise drop.
- On 3 successive `EventSource.onerror` events: stop, dispatch `onModeChange("polling")`, begin `setInterval`-based polling of `/events?afterSequence=<last>` every 2s.
- Returns a `{ close }` handle.

**Patterns to follow:** Phase 6's `apps/api/src/http/routes/runs-read.ts` for endpoint shapes; Phase 4's `apps/api/src/verifier/isolation/candidate-as-data.ts` for the typed error pattern.

**Test scenarios:**
- runClient: happy path GET `/runs` returns parsed list.
- runClient: malformed payload throws `ClientValidationError` with the failing Zod path.
- runClient: `startRun(config, { idempotencyKey })` sends the header.
- runClient: `getEvents(runId, { afterSequence: 5, limit: 10 })` constructs `?afterSequence=5&limit=10`.
- sseStream: event with `sequence > lastEventId` calls `onEvent`.
- sseStream: event with `sequence <= lastEventId` is dropped (de-dup).
- sseStream: after 3 errors, `onModeChange("polling")` fires + polling begins.
- sseStream: `close()` stops both EventSource + the polling interval.

**Verification:** Other units consume `runClient` + `sseStream` without re-implementing fetch logic.

---

### U3. Sequence-keyed run store + reducer (P7.2)

**Goal:** A single pure reducer folds `RunEventEnvelope` into a typed `RunStoreState`. Idempotent: re-applying an already-seen sequence is a no-op. `<RunStoreProvider>` exposes the state + dispatchers via React Context. Disconnect resync requests events `after lastEventId`; polling fallback degrades without losing applied state. Mode flag tracks live vs replay.

**Requirements:** P7.2. Acceptance: sequence-keyed idempotency; failure events retained; replay-sourced and live-sourced events fold identically.

**Dependencies:** U2.

**Files:**
- Create: `apps/web/src/state/runStore.ts` (Provider + hooks).
- Create: `apps/web/src/state/reducer.ts` (pure fold).
- Create: `apps/web/src/state/resync.ts` (polling/replay fallback orchestrator).
- Create: `apps/web/src/state/__tests__/reducer.test.ts`.
- Create: `apps/web/src/state/__tests__/resync.test.ts`.

**Approach:** Mirrors Phase 6's `apps/api/src/projections/current-state.ts` server-side fold but TS-only on the browser side. State shape:

```
RunStoreState = {
  runId: string | null;
  mode: "idle" | "live" | "polling" | "replay";
  sequenceThrough: number;
  errors: { sequence: number; type: string; message: string }[];
  run: RunRow | null;
  generations: Record<generationId, GenerationRow>;
  agenomes: Record<agenomeId, AgenomeRow>;
  candidates: Record<candidateId, CandidateRow>;
  criticReviews: Record<id, CriticReview>;
  checkResults: Record<id, CheckResult>;
  fitnessScores: Record<id, FitnessScore>;
  noveltyScores: Record<id, NoveltyScore>;
  energySpend: Record<agenomeId, number>;   // accumulator
  capsConsumed: { energy, generations, candidates, toolCalls };
  // failure-event log for the UI
  failureEvents: { sequence: number; type: string; payload: unknown }[];
}
```

`runStore.ts` exposes `useRunStore()` + selector hooks (`useLineage`, `useFitnessSeries`, `useEnergyByAgenome`, `useCandidateReviews(candidateId)`, etc.). The reducer dispatches one of `APPLY_EVENT | SET_MODE | RESET | RECORD_ERROR`.

`resync.ts` watches `sseStream` mode changes: on `polling`, kicks off the `getEvents(runId, { afterSequence: state.sequenceThrough })` poll loop and dispatches each event.

**Patterns to follow:** Phase 6's reducer-by-entity-slice idiom; React's official `useReducer + Context` pattern.

**Test scenarios:**
- Empty state → applying a `run.configured` event populates `run`.
- Applying the same event twice → state unchanged (idempotent).
- Out-of-order: an event with `sequence < sequenceThrough` is dropped.
- Failure events (`provider_call_failed`, `output_schema_rejected`, etc.) populate `failureEvents`.
- Live-sourced vs replay-sourced events fold to the identical state.
- `RESET` clears the store.
- Resync: `polling` mode dispatches each polled event through `APPLY_EVENT`.

**Verification:** Subsequent panels consume hooks without reimplementing fold logic.

---

### U4. Accessible `StatusIndicator` primitive + theme (P7.3)

**Goal:** Single primitive used everywhere. Each domain status enum maps to a fixed `{ shape, icon, label, color }`. Theme tokens (palette + font scale) in `theme.ts` + `theme.css`. Unknown status renders a neutral "?" indicator. ARIA labels expose status to assistive tech.

**Requirements:** P7.3. Acceptance: shape + label + icon AND color (never color alone); high-contrast theme; projector-legible font sizes; unknown is graceful.

**Dependencies:** U1.

**Files:**
- Create: `apps/web/src/ui/StatusIndicator.tsx`.
- Create: `apps/web/src/ui/theme.ts`.
- Create: `apps/web/src/ui/theme.css`.
- Create: `apps/web/src/ui/status-map.ts`.
- Create: `apps/web/src/ui/__tests__/StatusIndicator.test.tsx`.
- Create: `apps/web/src/ui/__tests__/status-map.test.ts`.

**Approach:** `status-map.ts` exports `getStatusToken(domain, status) → { shape: "circle" | "square" | "triangle" | "diamond" | "hexagon"; iconName: string; label: string; color: string; aria: string }`. Shapes drawn as SVG; icons from a small in-house set (no external icon lib for MVP — `lucide-react` is a follow-up if we want polish). Theme tokens: high-contrast palette (Okabe-Ito colorblind-safe), font scale `16/18/20/24/32`, focus ring tokens.

`StatusIndicator` consumes the token and renders `<span role="status" aria-label="..."><svg /> <span class="label">...</span></span>`.

**Test scenarios:**
- Each domain enum value renders a non-default mapping.
- Unknown status → neutral indicator with label "Unknown".
- aria-label is set to a human-readable status string.
- Visual snapshot: same `<StatusIndicator domain="check" status="passed" />` renders identical SVG on every render.

**Verification:** Subsequent panels import only this primitive for any status display.

---

### U5. Live/replay mode indicator (P7.4)

**Goal:** Persistent indicator at the top of the shell. Reads `mode` from `useRunStore`. Uses `StatusIndicator` primitive. Replay mode shows "REPLAY" badge + original-timestamps note.

**Requirements:** P7.4. Acceptance: mode is unambiguous via shape + label + icon + color; replay clearly marked; persistently visible.

**Dependencies:** U3, U4.

**Files:**
- Create: `apps/web/src/panels/ModeIndicator.tsx`.
- Create: `apps/web/src/panels/__tests__/ModeIndicator.test.tsx`.

**Approach:** Tiny component (~40 lines). Reads `useRunStore().mode`. Renders `<StatusIndicator domain="run-mode" status={mode} />` with explanatory label.

**Test scenarios:**
- `mode = "live"` → renders "LIVE" badge with the live status token.
- `mode = "replay"` → renders "REPLAY" badge + "Showing original timestamps" subtext.
- `mode = "polling"` → renders "DEGRADED — polling" badge (still live, but flagged).
- `mode = "idle"` → renders "IDLE — no run loaded".

**Verification:** Shell composes this at the top.

---

### U6. Operator run-config panel (P7.5)

**Goal:** Form editing all `RunConfig` + `RunCaps` fields. Client-side Zod validation against `RunConfig`. **Cap-max guard:** rejects any value above the validated ceiling (per the schema's `RunCaps` max constraints). Submit via `runClient.startRun(config, { idempotencyKey })`. Both subtypes selectable; cannot disable all.

**Requirements:** P7.5. Acceptance: cap-overrides above max rejected client-side; idempotent submit; field-level errors.

**Dependencies:** U2, U4.

**Files:**
- Create: `apps/web/src/panels/RunConfigPanel.tsx`.
- Create: `apps/web/src/panels/runConfigForm.ts`.
- Create: `apps/web/src/panels/__tests__/RunConfigPanel.test.tsx`.

**Approach:** `runConfigForm.ts` exports `formToConfig(formState) → { ok: true, config } | { ok: false, errors }`. Internally runs `RunConfig.safeParse(...)` AND a cap-max policy (a `MAX_CAPS` const mirroring Phase 0's enforced ceilings).

`RunConfigPanel.tsx` is a controlled form. On submit: `formToConfig` → if ok, `runClient.startRun(config, { idempotencyKey: crypto.randomUUID() })`. Field-level errors rendered inline via `<ErrorMessage>`.

**Test scenarios:**
- Happy path: valid form → `startRun` called with parsed config.
- Cap-max violation: `maxPopulation` above ceiling → submit blocked, error shown inline.
- All subtypes disabled → submit blocked.
- API returns 409 (run already active) → shows "Active run: <runId>" with link to load it.
- Idempotency-Key is a fresh UUID per submit.

**Verification:** Posting form → Phase 6 server accepts → dashboard loads the new run.

---

### U7. Stop control (P7.6)

**Goal:** Single button. Posts `runClient.stopRun(runId)`. Idempotent. Disabled when run is in a terminal state. Preserves projection state after stop.

**Requirements:** P7.6. Acceptance: idempotent; disabled in terminal; partial evidence preserved.

**Dependencies:** U2, U3, U4.

**Files:**
- Create: `apps/web/src/panels/StopControl.tsx`.
- Create: `apps/web/src/panels/__tests__/StopControl.test.tsx`.

**Approach:** Tiny component. Reads `useRunStore().run?.status`. Button disabled when status ∈ {`completed`, `stopped`, `failed`, `cancelled`}. On click: `stopRun(runId)` → no further action needed (the run.stopped event will fold into the store via SSE).

**Test scenarios:**
- Active run (status = `running` or `configured`) → button enabled.
- Terminal run → button disabled + label changes to "Stopped" / "Completed" etc.
- Click → `stopRun` called once even if double-clicked (button locks during request).
- Network error → inline error message; button remains enabled for retry.

**Verification:** Phase 6's `/stop` returns 200; the run transitions to `stopped` in the store.

---

### U8. React Flow lineage tree + Dagre layout (P7.7)

**Goal:** Render `LineageGraphProjection` from `useRunStore`. Five custom node types. Dagre layout for deterministic positions. Incremental updates as `sequenceThrough` advances.

**Requirements:** P7.7. Acceptance: storage-agnostic; five node types using `StatusIndicator`; same projection → same layout; incremental updates.

**Dependencies:** U3, U4.

**Files:**
- Create: `apps/web/src/lineage/LineageGraph.tsx`.
- Create: `apps/web/src/lineage/nodeTypes.tsx`.
- Create: `apps/web/src/lineage/layout.ts`.
- Create: `apps/web/src/lineage/__tests__/layout.test.ts`.
- Create: `apps/web/src/lineage/__tests__/LineageGraph.test.tsx`.

**Approach:** `layout.ts` exports `layoutGraph(nodes, edges, { rankdir: "LR" }) → { nodes: Array<{ id, x, y, ...rest }>, edges }`. Uses `@dagrejs/dagre`. Pure function; deterministic.

`nodeTypes.tsx` exports `nodeTypes: Record<string, React.ComponentType<NodeProps>>` — one per `LineageNodeType` enum value. Each renders the node label + `<StatusIndicator>` for status. Click handler dispatches a `SELECT_NODE` action on the store so panels can react.

`LineageGraph.tsx` consumes `useLineage()`, runs `layoutGraph`, renders `<ReactFlow nodes={...} edges={...} nodeTypes={nodeTypes} />`.

**Test scenarios:**
- `layoutGraph` is deterministic: same input → same output positions.
- 5-node fixture → 5 nodes rendered, each with the right node type component.
- Adding a node → layout recomputed; existing node positions stable (Dagre stable-id property).
- Empty graph → renders empty React Flow without throwing.

**Verification:** Visual: panning the graph shows generations as columns left-to-right.

---

### U9. Fitness-over-time + generation-comparison charts (P7.8)

**Goal:** Two Recharts components. `<FitnessOverTime>` plots `fitness.scored.total` per candidate across generations. `<GenerationComparison>` shows per-generation aggregates (mean/median fitness). Pattern + marker + label encoding in addition to color.

**Requirements:** P7.8. Acceptance: encodes series with patterns/markers/labels in addition to color; works with partial data; updates as events fold.

**Dependencies:** U3, U4.

**Files:**
- Create: `apps/web/src/charts/FitnessOverTime.tsx`.
- Create: `apps/web/src/charts/GenerationComparison.tsx`.
- Create: `apps/web/src/charts/chartTheme.ts`.
- Create: `apps/web/src/charts/__tests__/FitnessOverTime.test.tsx`.
- Create: `apps/web/src/charts/__tests__/GenerationComparison.test.tsx`.

**Approach:** `chartTheme.ts` exports `SERIES_THEMES = [{ stroke, strokeDasharray, dot: { shape, size } }, ...]`. 5 series at most for MVP (top-5 candidates).

`FitnessOverTime.tsx` reads `useFitnessSeries()` from the store: returns `{ candidates: [{ candidateId, points: [{ generationIndex, fitness }] }] }`. Renders `<LineChart><Line ... />` per series.

`GenerationComparison.tsx` reads aggregates and renders `<BarChart>` of mean/median fitness per generation.

**Test scenarios:**
- Empty data → renders chart frame with "No data yet" placeholder.
- 3 candidates × 4 generations → 3 lines, 4 x-axis ticks.
- Each series has a distinct `strokeDasharray` + dot shape (not just color).
- Chart updates when new fitness.scored events fold into the store.

**Verification:** Visual: lines climb across generations as the demo run progresses.

---

### U10. Energy-per-agenome panel (P7.9)

**Goal:** Table of agenomes with their accumulated `energy.spent` total. Per-row: status, energy, progress bar against `runCaps.energyBudget`. Highlights `energy_exhausted` state. Links to lineage node + candidates.

**Requirements:** P7.9. Acceptance: success-only spend (handled at the source via Phase 5's invariant); energy_exhausted state distinct; per-row links.

**Dependencies:** U3, U4, U8.

**Files:**
- Create: `apps/web/src/panels/EnergyPanel.tsx`.
- Create: `apps/web/src/panels/__tests__/EnergyPanel.test.tsx`.

**Approach:** Sortable table. `useEnergyByAgenome()` returns `[{ agenomeId, total, candidates: [...], progress: total/budget }]`. Clicking a row dispatches `SELECT_NODE` to highlight the agenome in `LineageGraph`.

**Test scenarios:**
- Empty data → empty table with "No energy events yet".
- 3 agenomes → 3 rows in descending energy order.
- `energy_exhausted` event in the failure log → banner at top of panel.
- Progress bar reflects `total / energyBudget` ratio.

**Verification:** Phase 5's energy events fold correctly into per-agenome totals.

---

### U11. Candidate inspector + EvidenceRef resolver (P7.10)

**Goal:** Loads a candidate via `getCandidate(runId, cid)`. Renders subtype-aware payload. `EvidenceRef` resolver links to events (Postgres-tier only). Both subtypes render without crashing the other.

**Requirements:** P7.10. Acceptance: subtype-specific payloads render; EvidenceRefs resolve within Postgres tier; unknown payload field degrades gracefully.

**Dependencies:** U2, U4.

**Files:**
- Create: `apps/web/src/panels/CandidateInspector.tsx`.
- Create: `apps/web/src/panels/evidenceRef.tsx`.
- Create: `apps/web/src/panels/__tests__/CandidateInspector.test.tsx`.

**Approach:** Reads selected `candidateId` from store. Calls `getCandidate`. Renders title + summary + claims + per-subtype block. `<EvidenceRefLink ref={ref} />` renders a link whose `href` is `#/events/<eventId>` (in-app navigation) or to the corresponding panel.

**Test scenarios:**
- Cross-domain candidate → renders source/target domain fields.
- Zeitgeist candidate → renders thesis/audience/currentSignals fields.
- Unknown subtype field → renders "(unsupported field)" placeholder without throwing.
- `EvidenceRefLink` → renders link with `kind` + `eventId`; never external URL.

**Verification:** Selecting a candidate in lineage opens the inspector with the full candidate body.

---

### U12. Critic-gauntlet panel (P7.11)

**Goal:** Renders `CriticReview` records for the selected candidate. Rubric (trusted) and candidate text (untrusted DATA) visually delimited per §7/§14. EvidenceRefs resolve via U11's resolver.

**Requirements:** P7.11. Acceptance: rubric vs candidate clearly delimited; EvidenceRefs resolve within Postgres tier; judge output read-only.

**Dependencies:** U3, U4, U11.

**Files:**
- Create: `apps/web/src/panels/CriticGauntlet.tsx`.
- Create: `apps/web/src/panels/__tests__/CriticGauntlet.test.tsx`.

**Approach:** Reads `useCandidateReviews(candidateId)`. Per review: header (mandate + confidence + status), critique text, evidence list. Candidate body is presented in a separate `<aside class="untrusted-data">` block with a visible "candidate output — treated as data" header.

**Test scenarios:**
- 5 reviews for one candidate → 5 review cards.
- Rejected review (no record from Phase 4) → row in the failure log section.
- EvidenceRef without `eventId` → renders "no eventId" placeholder.
- Candidate text appears in the "untrusted DATA" block, not the rubric block.

**Verification:** Per-candidate gauntlet renders all reviews; final-idea panel can link here.

---

### U13. Subtype-check evidence panel (P7.12)

**Goal:** Renders `CheckResult` records. Skip reason + error visible. `StatusIndicator` for passed/failed/skipped. Both subtypes' adapters covered.

**Requirements:** P7.12. Acceptance: skip reason + error shown; adapter outputs only; status uses primitive.

**Dependencies:** U3, U4, U11.

**Files:**
- Create: `apps/web/src/panels/CheckEvidence.tsx`.
- Create: `apps/web/src/panels/__tests__/CheckEvidence.test.tsx`.

**Approach:** Per candidate: table of checks with `checkType`, status indicator, score (if present), skipReason (if skipped), error (if failed). EvidenceRefs resolve via U11.

**Test scenarios:**
- 5 transfer checks + 5 zeitgeist checks for a multi-subtype candidate → 10 rows.
- Skipped check → row shows skip reason.
- Failed check → row shows error message.
- Final-judge check (checkType = `final_judge`) → flagged with a "JUDGE" tag.

**Verification:** Per-candidate evidence is complete.

---

### U14. Final-surviving-idea proof panel + links (P7.13)

**Goal:** Presents the final surviving idea with links resolving to lineage / critics / checks / score components / energy / traces. **A broken link is a test failure** (the Playwright smoke's assertion target).

**Requirements:** P7.13. Acceptance: all links resolve to loaded panels; trace links degrade cleanly when Langfuse is disabled.

**Dependencies:** U8, U9, U10, U11, U12, U13.

**Files:**
- Create: `apps/web/src/panels/FinalIdeaPanel.tsx`.
- Create: `apps/web/src/panels/__tests__/FinalIdeaPanel.test.tsx`.

**Approach:** "Final" is the candidate with the highest `fitness.total` in the latest completed generation. Renders the candidate card + a "Proof" section with 6 sub-links:
- **Lineage node** → scrolls/highlights in `LineageGraph`.
- **Critics** → opens `CriticGauntlet`.
- **Checks** → opens `CheckEvidence`.
- **Score components** → opens `FinalIdeaPanel` sub-section listing components.
- **Energy** → opens `EnergyPanel` row for the producing agenome.
- **Traces** → opens a modal showing `langfuseTraceId` (or "local trace" fallback).

Each link is a React Router-style hash anchor that the shell intercepts.

**Test scenarios:**
- With a completed run + fitness data → "Final idea: <candidateId>" rendered.
- Every link target exists in the loaded store state.
- Langfuse-disabled run → "Traces" link shows "Local trace" label.
- Run with zero candidates → renders "No surviving idea — run ended with 0 survivors".

**Verification:** This is the Playwright smoke's load-bearing target.

---

### U15. Dashboard shell + health/diagnostics + Playwright smoke (P7.14 + P7.15)

**Goal:** Compose all panels into one projector-legible layout. `<HealthPanel>` polls `getHealth(runId)` every 3s. Mode indicator + stop control persistently visible. Run-not-found / empty-run / failed-run handled gracefully. One Playwright happy-path smoke asserts start → live events fold → final-idea links resolve.

**Requirements:** P7.14 + P7.15. Acceptance: full panel set composed; health surfaced; UI never reconstructs secrets; one Playwright smoke passes.

**Dependencies:** U1–U14.

**Files:**
- Modify: `apps/web/src/App.tsx`.
- Create: `apps/web/src/layout/DashboardShell.tsx`.
- Create: `apps/web/src/panels/HealthPanel.tsx`.
- Create: `apps/web/src/panels/__tests__/DashboardShell.test.tsx`.
- Create: `apps/web/playwright.config.ts`.
- Create: `apps/web/tests/e2e/happy-path.spec.ts`.

**Approach:** `DashboardShell` is a 3-column flex layout: left rail (RunConfigPanel + StopControl + HealthPanel), main (LineageGraph + Charts), right rail (CandidateInspector + CriticGauntlet + CheckEvidence). FinalIdeaPanel pinned to bottom-right.

`HealthPanel` polls `/runs/:id/health` every 3s; renders generation count, candidates in flight, last event time, caps consumed (progress bars).

Playwright config: `webServer` boots `pnpm --filter @doppl/api dev` + `pnpm --filter @doppl/web dev` against a testcontainers-style local DB (use `docker compose` from the repo root). Smoke:
1. Visit `/`.
2. Fill the run-config form with a recorded fixture.
3. Click "Start".
4. Wait for SSE events to fold (LineageGraph renders ≥ 1 candidate).
5. Wait for `run.completed` (or stop after N seconds and assert partial state).
6. Open FinalIdeaPanel.
7. Click each of the 6 proof links and assert the target panel becomes active.

**Test scenarios:**
- Render shell with idle store → shows RunConfigPanel + "no run loaded" state.
- Run-not-found state → graceful message; no crashing.
- Failed-run state → mode indicator + stop disabled + evidence still inspectable.
- Playwright: full happy-path.

**Verification:** Smoke passes against the local-first demo boot path.

---

## System-Wide Impact

- **New top-level workspace**: `apps/web` adds 5+ MB to node_modules but no runtime impact on `@doppl/api`.
- **`pnpm-workspace.yaml`**: already includes `apps/*` — no change needed.
- **Phase 6 Hono server**: no changes. The web app consumes its surface as-is.
- **CI**: needs to run `pnpm --filter @doppl/web typecheck` + `vitest` for component tests. The Playwright smoke (U15) is gated behind a separate `pnpm --filter @doppl/web test:e2e` script and runs when `DOPPL_E2E=1` to avoid CI Docker churn.

---

## Open Questions Surfaced by Planning

**Run-mode discriminator at the SSE level:** Phase 6's `/stream` doesn't include a "live" vs "replay" hint in its frames. The dashboard defaults to `mode: "live"` when streaming, and switches to `mode: "replay"` when the user invokes a replay scenario (not implemented in MVP). Phase D's demo-fallback path will need a header or query param to flag replay; that's a Phase 6 follow-up, not Phase 7's concern.

**EventSource doesn't support custom headers:** `EventSource` in the browser cannot set `Idempotency-Key`. The dashboard's SSE consumer uses `lastEventId` as a query param (Phase 6's `/stream` supports `?lastEventId=` per U9 in the Phase 6 plan). Confirmed by reading the Phase 6 PR: query param is wired.

---

## Scope Boundaries

### Deferred to Follow-Up Work

- Dark mode + theme toggle.
- Mobile / responsive layout.
- Multi-run history sidebar.
- Detailed tooltip customization.
- Internationalization.
- A storybook for the component library.

### Deferred for Later (per IMPLEMENTATION_PLAN.md)

- Phase D demo polish — local-first boot script bundling api + web + postgres into one command.

### Outside this product's identity

- Any authoritative write beyond `POST /runs` + `POST /runs/:id/stop`.
- A backend-for-frontend layer.
- Auth — the demo runs local only.

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| React Flow + Dagre disagree on coordinate semantics | Low | Misaligned lineage tree | `layout.ts` is a thin adapter; unit-test that positions are non-NaN + non-overlapping. |
| Recharts SSR / hydration issues on first mount | Low | Console errors | Vite dev server is CSR-only; SSR not in scope. Charts mount in `useEffect`. |
| SSE eventsource buffers messages during reconnect | Medium | Brief gap on flaky network | Reconnect with `?lastEventId=`. Polling fallback kicks in after 3 failed reconnects. |
| Playwright e2e flakes on CI due to timing | Medium | Smoke fails intermittently | Use Playwright's `expect.poll(...)` for "wait for SSE event"; max 30s timeout. Gate behind `DOPPL_E2E=1`. |
| Browser bundle size (React Flow + Dagre + Recharts) | Low | Slower first paint | Vite tree-shakes; production build < 800KB gzipped for MVP. Code-splitting deferred. |

---

## Test Plan & Dev Loop

```bash
# Backend (in one terminal)
docker compose up -d postgres
pnpm --filter @doppl/api dev    # starts Hono on :3000

# Frontend (in another terminal)
pnpm --filter @doppl/web dev    # starts Vite on :5173

# Component tests (Vitest + React Testing Library)
pnpm --filter @doppl/web test

# Type check
pnpm --filter @doppl/web typecheck

# E2E smoke (Playwright)
DOPPL_E2E=1 pnpm --filter @doppl/web test:e2e

# Workspace-wide
pnpm -w typecheck
pnpm -w lint
pnpm -w test
```

CI runs everything except `test:e2e`. The smoke runs locally + in a manual workflow trigger.

## Environment Variables

| Var | Default | Effect |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:3000` | Backend base URL the client targets. |
| `VITE_SSE_RECONNECT_MAX` | `3` | Consecutive errors before falling to polling. |
| `VITE_POLL_INTERVAL_MS` | `2000` | Polling fallback cadence. |
| `DOPPL_E2E` | _unset_ | Gates Playwright e2e in CI. |

## Acceptance Criteria

- [ ] `apps/web` workspace boots `pnpm --filter @doppl/web dev` and renders against a live `apps/api` server (U1).
- [ ] Typed client + SSE stream parse every payload through `@doppl/contracts` Zod schemas (U2).
- [ ] Run store reducer is sequence-keyed, idempotent, and survives disconnect + polling fallback (U3).
- [ ] `StatusIndicator` primitive renders shape + label + icon + colorblind-safe color for every domain status; unknown is graceful (U4).
- [ ] Live/replay mode indicator persistently visible (U5).
- [ ] Run-config panel rejects cap-overrides above validated maxima client-side; idempotent submit (U6).
- [ ] Stop control disabled in terminal states; partial evidence preserved (U7).
- [ ] React Flow lineage tree with 5 custom node types; deterministic Dagre layout (U8).
- [ ] Fitness-over-time + generation-comparison charts encode series with pattern + marker + label + color (U9).
- [ ] Energy-per-agenome panel highlights `energy_exhausted` and links to lineage + candidates (U10).
- [ ] Candidate inspector renders both subtype payloads + EvidenceRefs resolve in-app (U11).
- [ ] Critic-gauntlet panel separates rubric (trusted) from candidate text (DATA) visually (U12).
- [ ] Check evidence panel covers passed/failed/skipped with skip reason + error (U13).
- [ ] Final-surviving-idea proof panel: every link target resolves (U14).
- [ ] Dashboard shell composes all panels; health endpoint polled; secret-redaction trust pin upheld (U15).
- [ ] One Playwright happy-path smoke passes: start → live events → final-idea links resolve (U15).
- [ ] Workspace-wide `pnpm -w typecheck && pnpm -w lint && pnpm -w test` all green at PR open.

## Dependencies on Prior Phases

- Phase 0: every domain + projection schema (`RunConfig`, `RunCaps`, `RunEventEnvelope`, `CandidateIdea`, `CriticReview`, `CheckResult`, `FitnessScore`, `NoveltyScore`, `LineageGraphProjection`, `EvidenceRef`).
- Phase 6: every consumed endpoint — `POST /runs`, `POST /runs/:id/stop`, `GET /runs`, `:id`, `/events`, `/lineage`, `/replay`, `/candidates/:cid`, `/health`, `/model-routes`, SSE `/stream`.
- Phase 4 + 5: the events the dashboard renders (`critic.reviewed`, `check.completed`, `novelty.scored`, `fitness.scored`, `lineage.culled`, `agenome.fused/mutated/reproduced`, `energy.spent`).

## What ships in the PR

- The `apps/web/` tree from the Output Structure section.
- `apps/web/package.json` registered as `@doppl/web` workspace.
- New deps (root or per-workspace): `vite`, `@vitejs/plugin-react`, `react@18`, `react-dom@18`, `@types/react`, `@types/react-dom`, `reactflow@11`, `@dagrejs/dagre`, `recharts@2`, `@testing-library/react`, `@testing-library/jest-dom`, `@playwright/test`, `jsdom`.
- Playwright config + the one e2e smoke.
- Plan file with `status: completed` (flipped at PR open).
- PR targets the `melissa` integration branch.
