# 02 · Information Architecture + Navigation

One-line purpose: the screen map, navigation model, AppShell + global chrome, route sketch, entry/transition graph, and persistence rules that every other Doppl design doc binds to.

Related: `01-product-and-experience.md` · `03-design-system.md` · `04-screens-S0-S2.md` · `05-screens-S3-S6.md` · `06-lineage-graph.md` · `07-motion-and-liveness.md` · `08-states-empty-loading-error-degraded.md` · `09-dummy-data.md` · ground truth: `../../ARCHITECTURE.md` (§3, §10, §11, §12), `../planning/USER_FLOWS.md`, `../planning/USERS.md`, `../planning/EVALUATION_CRITERIA.md`

---

## 0 · Reading this doc

Doppl is **one app you watch a run evolve inside of**, not a multi-page console. There are exactly **seven canonical screens (S0–S6)**, but only **five of them are real navigable destinations** — the two Inspectors (S3 · CandidateInspector, S4 · AgenomeInspector) are **overlays** that float over the live observatory, and Replay (S6) is **not a separate page** — it is S2 · Organism View reskinned with a `ModeBanner` set to `REPLAY` plus the `ReplayScrubber`.

So the mental model the prototype must encode:

```
Real destinations:   S0 · Runs Home →  S1 · Run Launcher →  S2 · Organism View →  S5 · Final Idea / Payoff
Same destination, different mode:     S6 · Replay Mode  ==  S2 · Organism View  +  REPLAY ModeBanner + ReplayScrubber
Overlays (never own a page):          S3 · CandidateInspector  /  S4 · AgenomeInspector   (drawers over S2 or S6)
```

Everything below is design-actionable: regions are named, states are enumerated (default / loading / empty / error / degraded / live / replay), transitions are drawn, and dummy data is supplied so the prototype can be built with zero backend.

---

## 1 · Screen map (S0–S6) and how they relate

| ID | Name | Kind | Primary persona | One-job |
|----|------|------|-----------------|---------|
| **S0** | **Runs Home** | Page | Operator (Reviewer can browse) | Pick a run to watch / replay, or launch a new one |
| **S1** | **Run Launcher** | Page **or** modal over S0 | Operator only | Configure caps + prompt + subtypes, then `Start` |
| **S2** | **Organism View** | Page (the heart) | Both | Watch the population evolve **live** (SSE-driven) |
| **S3** | **CandidateInspector** | **Overlay drawer** on S2/S6 | Both | Read one candidate's full evidence |
| **S4** | **AgenomeInspector** | **Overlay drawer** on S2/S6 | Both | Read one genome's traits + lineage |
| **S5** | **Final Idea / Payoff** | Page (reached from S2/S6) | Both | The money shot: the winner + the gauntlet it survived |
| **S6** | **Replay Mode** | **S2 in `REPLAY` mode** | Both | Time-travel a completed/partial run from the event log |

### Relationship rules (load-bearing — do not break these)

1. **S3 and S4 are overlays, never pages.** They render as a right-side `Drawer` (shadcn/ui `Sheet`/Radix Dialog) above S2 or S6 with the observatory still visible (dimmed, not unmounted) behind a scrim. Opening one does **not** navigate; closing one returns you to the exact graph viewport you left. Only one inspector is open at a time; opening the other replaces it. The graph keeps streaming behind the drawer in LIVE mode.
2. **S6 is S2 with a different `ModeBanner` + the `ReplayScrubber`.** Same `AppShell`, same `RunHeader`, same panels (`LineageGraph`, `FitnessOverTimeChart`, `EnergyMeter`/`RunEnergyGauge`, `ActivityTicker`, `BestIdeaPanel`). The *only* additions in S6 are: a persistent `REPLAY` `ModeBanner`, the `ReplayScrubber` docked at the bottom, and the suppression of the `StopButton` (nothing live to stop). Liveness animations still play — but driven by the scrubber's clock, not SSE.
3. **S5 is reachable from both S2 (live, after `run.completed`) and S6 (replay).** It is the same component (`FinalIdeaProof` / `BestIdeaPanel` expanded), and it **inherits the mode** of where you came from (LIVE-completed vs REPLAY) so the `ModeBanner` is correct.
4. **S1 may render as a full page OR a modal over S0.** Default: modal `Dialog` over S0 for fast launch; full-page route exists for deep-linking and projector clarity. Either way the component is `RunLauncherForm`.
5. **The reviewer (read-only) sees the same screens** but `S1` is unreachable, the `StopButton` is hidden, and the `New Run` CTA is hidden. (Single-operator MVP — there is no auth gate, so this is a UI-mode flag, not a permission wall. See `../planning/USERS.md` permission matrix.)

### Containment / overlay diagram

```
            ┌──────────────────────────────────────────────┐
            │                  AppShell                     │
            │  (global chrome: brand, mode awareness,       │
            │   connection status, theme, reduced-motion)   │
            │                                               │
            │   ┌───────────────────────────────────────┐   │
            │   │  ROUTED VIEW (one of):                │   │
            │   │   S0 Runs Home                        │   │
            │   │   S1 Run Launcher (page variant)      │   │
            │   │   S2 Organism View  ◄── S6 = S2+REPLAY │   │
            │   │   S5 Final Idea / Payoff              │   │
            │   └───────────────────────────────────────┘   │
            │            ▲ overlays mount here ▲             │
            │   ┌───────────────┐   ┌───────────────────┐   │
            │   │ S1 (modal      │   │ S3 CandidateInsp. │   │
            │   │ variant) over  │   │ S4 AgenomeInsp.   │   │
            │   │ S0             │   │ (drawer over S2/S6)│  │
            │   └───────────────┘   └───────────────────┘   │
            └──────────────────────────────────────────────┘
```

---

## 2 · Navigation model

Doppl uses a **single-spine, drill-down** navigation model — there is no left nav rail of sibling sections. The spine is: **Home → (Launch) → Watch → Payoff**, with **inspectors as lateral drill-ins** and **replay as a mode of Watch**.

### 2.1 Why no persistent sidebar nav

The product is a focused observatory shown on a projector in a 10-minute window. A sidebar of competing destinations would steal attention from the organism. Instead:

- **Forward motion** is via large, contextual CTAs (`New Run`, `Open`, `Replay`, `Reveal Winner`).
- **Backward motion** is via a single `← Back to Runs` affordance in the `AppShell` top-left, plus browser back.
- **Lateral motion** (into evidence) is via **clicking nodes/cards in S2**, which open S3/S4 drawers — you never leave the observatory.

### 2.2 Navigation surfaces (where the user can move from)

| Surface | Lives in | Moves you | Persona |
|---------|----------|-----------|---------|
| `← Back to Runs` | `AppShell` top-left | any screen → S0 | both |
| Brand/logo (`Doppl`) | `AppShell` top-left | → S0 | both |
| Run row `Open` / `Replay` | S0 list | → S2 (live) / S6 (replay) | both (operator can also resume control) |
| `New Run` CTA | S0 header | → S1 | operator only |
| Node / `CandidateCard` click | S2/S6 graph + panels | → S3 drawer | both |
| Node / `AgenomeCard` click | S2/S6 graph + panels | → S4 drawer | both |
| `Reveal Winner` / `BestIdeaPanel` expand | S2/S6 | → S5 | both |
| Cross-links inside S3 (`LineagePathTrace`, parent chips) | S3 drawer | → S4 drawer (swap) | both |
| `ReplayScrubber` seek | S6 only | time-travel within S6 | both |
| `StopButton` | `RunHeader`, S2 live only | stays on S2, transitions run state | operator only |

### 2.3 Breadcrumb / wayfinding

No multi-level breadcrumb (depth is shallow). Wayfinding is carried by:

- The **`RunHeader`** (always shows *which run* + LIVE/REPLAY badge + generation counter) — this is the "you are here in the run" anchor.
- The **`ModeBanner`** — the unmistakable LIVE vs REPLAY signal (projector rule: live-vs-replay legible at a glance).
- **Drawer titles** — `CandidateInspector` and `AgenomeInspector` show the entity ID + status badge in their header so an open drawer never feels context-less.

---

## 3 · AppShell (the global frame)

`AppShell` is the persistent outermost component. It wraps every routed view and hosts the overlay portal. It is **calm chrome around a vivid organism** (visual direction) — deliberately quiet so the lineage graph is the focal point.

### 3.1 Regions

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ░ AppShell · TopChrome (h≈56px, sticky)                                       │
│ [← Back to Runs]  ◆ Doppl        [ModeBanner slot]        [conn ●] [⚙ theme]  │
├─────────────────────────────────────────────────────────────────────────────┤
│ ░ RunHeader slot (only present on S2 / S5 / S6 — absent on S0 / S1)           │
│  "Quantum error-correction → supply chains"  [● LIVE] Gen 4/6  ⚡812/2000  ♥   │
│                                                              [■ Stop]          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│                       ░ Outlet (the routed screen) ░                          │
│                                                                               │
├─────────────────────────────────────────────────────────────────────────────┤
│ ░ AppShell · StatusBar (h≈28px) — last-event age · seq high-water · build     │
└─────────────────────────────────────────────────────────────────────────────┘
   ░ OverlayPortal (z-top): S3/S4 drawers · S1 modal · toasts · ErrorState modal
```

### 3.2 AppShell sub-regions

| Region | Always present? | Contents | Notes |
|--------|-----------------|----------|-------|
| **TopChrome** | yes | `← Back to Runs`, brand, `ModeBanner` slot, connection dot, theme/reduced-motion toggle | Sticky. Connection dot reflects SSE EventSource state (connected / reconnecting / polling-fallback). |
| **RunHeader** | only S2/S5/S6 | `title` · LIVE/REPLAY badge · `GenerationCounter` · `RunEnergyGauge` · `HealthIndicator` · `StopButton` | The "you are here in the run" anchor. See `06-lineage-graph.md` + component spec doc. |
| **Outlet** | yes | the routed screen (S0/S1/S2/S5; S6 = S2 in replay) | Single child route. |
| **StatusBar** | yes | last-event age, sequence high-water mark (`sequenceThrough`), build/version | Quiet, monospaced (JetBrains Mono). Doubles as the resync/health telltale. |
| **OverlayPortal** | yes (empty until used) | S3/S4 drawers, S1 modal, toasts, blocking `ErrorState` | Renders above Outlet with a scrim; keeps the observatory mounted behind it. |

### 3.3 AppShell states

- **default** — TopChrome + StatusBar only (e.g., on S0/S1).
- **in-run** — RunHeader present; `ModeBanner` shows LIVE or REPLAY.
- **degraded** — a thin `DegradedState` ribbon appears below RunHeader (e.g., `novelty-degraded`, `Langfuse-off`, `provider-failure`, `all-culled`). It never blocks; it annotates. See `08-states-...md`.
- **disconnected/reconnecting** — connection dot amber + StatusBar shows "resyncing from seq N"; the SSE reducer resumes from `lastEventId`.
- **reduced-motion** — toggle in TopChrome (and OS-respected); liveness animations downgrade to instantaneous state changes. Status still legible via shape+icon+label+color.

---

## 4 · Global chrome details

### 4.1 `ModeBanner` (LIVE / REPLAY) — the most important global signal

Mandated by the projector/accessibility rules: **live vs replay must be unmistakable at a glance.**

- **LIVE** — color: cyan/electric; icon: ● filled pulsing dot; label: `LIVE`; placed in TopChrome center AND mirrored as the `RunHeader` badge. Subtle breathing animation (respects reduced-motion → static).
- **REPLAY** — color: amber/violet (distinct hue + texture, not just a different color); icon: ⏮ / diagonal-hatch fill; label: `REPLAY`; **plus** a full-width hatched ribbon edge so it reads on a projector even peripherally. Never pulses (nothing is happening live).
- **completed-live** — when a live run hits `run.completed`, the banner flips to `COMPLETE` (steady, no pulse) but stays LIVE-family colored to signal "this just happened live," distinct from REPLAY of an old run.

```
LIVE:    [ ●  LIVE ]   cyan, breathing
REPLAY:  ▓▓[ ⏮ REPLAY · recorded run · no live calls ]▓▓   amber/violet, hatched, static
COMPLETE:[ ✔  COMPLETE ]  cyan-family, static
```

### 4.2 `RunHeader` (run-scoped chrome)

Composed of, left→right: `title` → LIVE/REPLAY badge (`StatusBadge` family) → `GenerationCounter` (`Gen 4/6`) → `RunEnergyGauge` (`⚡ 812 / 2000 doppl_energy`, draining light metaphor) → `HealthIndicator` (♥ current gen · candidates-in-flight · last-event age · caps consumed — the continue-vs-switch signal) → `StopButton` (operator-only, LIVE only).

### 4.3 Connection + health telltales

The operator's "continue live or switch to replay?" decision (the fallback ladder, ARCHITECTURE §17) is driven by **two** always-visible chrome signals:

- TopChrome **connection dot** — transport health (SSE EventSource up/reconnecting/polling).
- `RunHeader` **`HealthIndicator`** — runtime health from `GET /runs/:id/health` (last-event age, candidates in flight, caps consumed).

---

## 5 · Page-hierarchy diagram (ASCII)

```
AppShell  (TopChrome · RunHeader-slot · Outlet · StatusBar · OverlayPortal)
│
├─ S0 · Runs Home  [route: /]
│   ├─ RunsList (rows: StatusBadge · title · GenerationCounter · best-idea preview · ⚡ · Open/Replay)
│   ├─ "New Run" CTA  ───────────────────────────────► S1
│   └─ EmptyState (no runs yet) / LoadingState / ErrorState
│
├─ S1 · Run Launcher  [route: /runs/new  OR  modal over /]
│   └─ RunLauncherForm
│        ├─ PromptSourcePicker (prepared set ▢ | live prompt ▢)
│        ├─ SubtypeToggle (cross_domain_transfer ✓ · zeitgeist_synthesis ✓)  [both on by default]
│        ├─ CapsControl (population · generations · energyBudget · spawnDepth · toolCalls · wallClock)
│        │     └─ HARD-MAX enforcement (slider ceilings reject overrides above validated maxima)
│        ├─ ModelProfileSelect
│        ├─ scoringPolicyVersion (display)
│        └─ [Start]  ──────────────────────────────────► S2 (live)
│
├─ S2 · Organism View  [route: /runs/:runId]     ◄══════════════╗
│   ├─ RunHeader (title · LIVE badge · GenerationCounter · RunEnergyGauge · HealthIndicator · Stop)
│   ├─ GenerationTimeline (stepper: Gen 0 ▸ Gen 1 ▸ … current)
│   ├─ LineageGraph (React Flow) ── node types:                   ║
│   │     GenerationNode·AgenomeNode·CandidateNode·CriticNode·     ║
│   │     CheckNode·ScoreNode·WinnerNode  + LineageLegend          ║
│   ├─ FitnessOverTimeChart (Recharts) + GenerationComparison      ║
│   ├─ EnergyMeter (per-agenome) · RunEnergyGauge (run budget)     ║
│   ├─ ActivityTicker (live SSE event feed)                        ║
│   ├─ BestIdeaPanel (best-so-far) ──"Reveal Winner"──► S5         ║
│   │                                                              ║
│   ├─ ▸ click CandidateNode/CandidateCard ──► S3 (drawer overlay) ║
│   ├─ ▸ click AgenomeNode/AgenomeCard ─────► S4 (drawer overlay)  ║
│   └─ states: LoadingState·EmptyState·ErrorState·DegradedState·   ║
│             LIVE·REPLAY                                          ║
│                                                                  ║
├─ S6 · Replay Mode  [route: /runs/:runId/replay]  ════════════════╝  (== S2 + REPLAY)
│   └─ S2 layout, reskinned:
│        + ModeBanner = REPLAY (persistent hatched ribbon)
│        + ReplayScrubber (play/pause · seek · speed · seq position)
│        − StopButton (hidden; nothing live to stop)
│        (same S3/S4 drawers, same panels, time-travel clock)
│
├─ S3 · CandidateInspector  [overlay; deep-link: /runs/:runId?candidate=:cid]
│   └─ Drawer over S2/S6:
│        subtypePayload · CriticGauntletPanel(ReviewRow×mandate) ·
│        SubtypeCheckPanel(CheckRow) · NoveltyMeter · FitnessBreakdown ·
│        EnergyMeter · LineagePathTrace · trace links (Langfuse)
│        ▸ parent/agenome chips ──► S4 (swap drawer)
│
├─ S4 · AgenomeInspector  [overlay; deep-link: /runs/:runId?agenome=:aid]
│   └─ Drawer over S2/S6:
│        systemPrompt · personaWeights · toolPermissions[] ·
│        decompositionPolicy · spawnBudget · parentIds[] (fusion/mutation) ·
│        mutationMeta · EnergyMeter · candidates produced · StatusBadge
│        ▸ candidate chips ──► S3 (swap drawer)
│
└─ S5 · Final Idea / Payoff  [route: /runs/:runId/final]
    └─ FinalIdeaProof / BestIdeaPanel (expanded):
         winning CandidateIdea · CriticGauntletPanel (replayable) ·
         SubtypeCheckPanel (executable transfer check live OR replay-backed) ·
         GenerationComparison (gen-0 baseline → winner) · LineagePathTrace
         inherits LIVE-COMPLETE or REPLAY mode from origin
```

---

## 6 · Entry points + transitions between screens

### 6.1 Entry points (how a user first lands)

| Entry | Lands on | Notes |
|-------|----------|-------|
| App open / brand click | **S0 · Runs Home** | The default home. |
| Deep link `/runs/:runId` | **S2** (live if running) or **S6** (if run is terminal — auto-redirect to `/replay`) | If the run is `completed/stopped/failed`, S2 has no live stream → redirect to S6. |
| Deep link `/runs/:runId/replay` | **S6 · Replay Mode** | Always replay, even for a running run (read-only time-travel of events so far). |
| Deep link `/runs/:runId/final` | **S5 · Final Idea** | Only valid once a `selected` best exists; else redirect to S2/S6 with a toast. |
| Deep link `/runs/:runId?candidate=:cid` | **S2/S6 with S3 drawer open** | Drawer hydrates from `GET /runs/:id/candidates/:cid`. |
| Deep link `/runs/new` | **S1** (page variant) | For projector clarity / sharable launch. |
| Demo fallback ladder | operator manually picks a prepared run row on S0 → `Open`/`Replay` | Manual, not auto (ARCHITECTURE §17). |

### 6.2 Transition graph

```
                      ┌─────────────────────────────────────────────┐
                      │                                             │
   (app open)         │           ┌──── Open (live) ────► S2 ◄──┐    │
        │             ▼           │                            │    │
        └────────► S0 Runs Home ──┼──── Replay ─────────► S6 ──┘    │ (Back to Runs
                      │  ▲        │                                 │  from anywhere)
            New Run   │  │ Back   └──── (terminal run auto) ──► S6   │
                      ▼  │                                          │
                  S1 Launcher ── Start ──► S2 ──────────────────────┘
                                            │
              ┌── click CandidateNode/Card ─┤
              ▼                             ├── click AgenomeNode/Card ──┐
        S3 Candidate ◄── swap (parent) ─────┤                           ▼
        Inspector   ──── swap (candidate) ──┴──────────────────► S4 Agenome
              │     (drawers over S2 OR S6; ESC / scrim / X = close)     Inspector
              │                             │
              ▼ (close)                     ▼ (close)
            back to S2/S6 graph viewport (unchanged)

        S2 (run.completed) ──"Reveal Winner"──► S5 Final Idea (LIVE-COMPLETE mode)
        S6 (scrubbed to end)──"Reveal Winner"──► S5 Final Idea (REPLAY mode)
        S5 ──"Replay the gauntlet"──► S6 (seeked to the winner's scoring sequence)
        S2 ──[■ Stop]──► S2 (run → stopping → stopped; banner flips; Reveal Winner if a best exists)
```

### 6.3 Transition rules

- **Start (S1→S2)** is **idempotent from the UI** (USER_FLOWS "Configure And Start"): a double-click on `Start` must not create two runs; the button disables + shows a spinner until `POST /runs` returns a `runId`, then routes to `/runs/:runId`.
- **Live→terminal** (run completes/stops/fails on S2): the screen does **not** navigate away. The `ModeBanner` flips (LIVE→COMPLETE / STOPPED / FAILED), the `StopButton` disappears, and `BestIdeaPanel`'s `Reveal Winner` becomes the primary CTA. The operator/reviewer keeps the same viewport.
- **Terminal-run open** (S0 `Open` on a completed run): redirect to S6 (replay) since there is no live stream — but keep the URL honest (`/runs/:id/replay`).
- **Inspector open/close never navigates** — it's a query-param mutation (`?candidate=` / `?agenome=`) so it's deep-linkable and back-button-friendly without unmounting S2/S6.
- **S5 ↔ S6 round-trip**: "Replay the gauntlet" from S5 opens S6 seeked to the winner's `fitness.scored` sequence so the audience sees exactly the adversarial gauntlet replay (EVALUATION_CRITERIA demo evidence #5).

---

## 7 · URL / route sketch

React Router (or TanStack Router) over React 19 + Vite. Routes are **shallow and run-scoped**; inspectors are query params, not nested routes, so they overlay without remounting.

```
/                               S0 · Runs Home
/runs/new                       S1 · Run Launcher (page variant; modal variant lives at / with ?new=1)
/runs/:runId                    S2 · Organism View (LIVE if running; redirects to ./replay if terminal)
/runs/:runId/replay             S6 · Replay Mode  (S2 + REPLAY banner + ReplayScrubber)
/runs/:runId/final              S5 · Final Idea / Payoff (redirect → :runId if no selected best yet)

  ── overlay query params (apply on /runs/:runId and /runs/:runId/replay) ──
?candidate=:cid                 opens S3 · CandidateInspector drawer
?agenome=:aid                   opens S4 · AgenomeInspector drawer
?new=1                          opens S1 modal over S0   (on / only)
&t=:sequence                    (S6 only) deep-link the ReplayScrubber to a sequence position
&speed=2x                       (S6 only) deep-link replay speed
```

### 7.1 Route ⇄ backend binding (read-only; ARCHITECTURE §11)

| Route | REST/SSE it binds to | Mutation? |
|-------|----------------------|-----------|
| `/` (S0) | `GET /runs` | — |
| `/runs/new` (S1) | `GET /model-routes` (for `ModelProfileSelect`) → `POST /runs` on Start | **only** mutation: `POST /runs` |
| `/runs/:id` (S2) | `GET /runs/:id`, `GET /runs/:id/lineage`, `GET /runs/:id/stream` (SSE), `GET /runs/:id/health` | `POST /runs/:id/stop` (operator) |
| `/runs/:id/replay` (S6) | `GET /runs/:id/replay`, `GET /runs/:id/lineage` | — (read-only) |
| `/runs/:id/final` (S5) | `GET /runs/:id` + `GET /runs/:id/candidates/:winnerCid` | — |
| `?candidate=:cid` (S3) | `GET /runs/:id/candidates/:cid` | — |
| `?agenome=:aid` (S4) | derived from `GET /runs/:id/lineage` node payload (+ candidate refs) | — |

> Invariant (ARCHITECTURE §12, §14): **the UI never mutates authoritative state except via `POST /runs` and `POST /runs/:id/stop`.** Every other route is a projection read. Reviewer mode hides both POST affordances.

---

## 8 · What persists across screens

Three persistence tiers: **URL** (shareable, survives reload), **view-store** (Zustand, in-memory session state), and **server-cache** (TanStack Query + SSE reducer). Nothing the UI holds is authoritative — the event log is (ARCHITECTURE §4).

### 8.1 Persists in the URL (survives reload + deep-linkable)

- Current `runId` and which screen (`/`, `/replay`, `/final`).
- Open inspector (`?candidate=` / `?agenome=`) — so a projected screen can be re-opened to the same evidence.
- Replay position + speed (`&t=`, `&speed=`) on S6.

### 8.2 Persists in the view-store (Zustand; per session, NOT per run unless noted)

| State | Scope | Notes |
|-------|-------|-------|
| `LineageGraph` viewport (zoom / pan / fit) | per `runId` | Closing an inspector returns to the **same** viewport. Switching runs resets. |
| Selected node / highlighted lineage path | per `runId` | The `LineagePathTrace` highlight stays lit when you open S3/S4. |
| `GenerationTimeline` focused generation | per `runId` | Drives which tier the graph centers on. |
| Theme + **reduced-motion** preference | global | Survives across runs and reloads (localStorage-backed). |
| Reviewer-mode flag (read-only) | global session | Hides Stop / New Run / Launcher. |
| `ActivityTicker` scroll-lock ("follow latest" vs "pinned") | per `runId` | So inspecting an old event doesn't yank you to live tail. |
| Replay play/pause/speed (mirrored to URL) | per `runId` (S6) | Source of truth for the scrubber clock. |

### 8.3 Persists in server-cache (TanStack Query + SSE reducer)

- The **sequence-keyed SSE reducer** holds the live projection built from `run.*` events, keyed by per-run `sequence`; on reconnect it resyncs from `lastEventId` (ARCHITECTURE §4, §11). This is what S2 renders.
- `GET /runs/:id/lineage` carries `sequenceThrough` (the event high-water mark the graph was built to) — shown in the StatusBar so live vs cached is auditable.
- Query cache for `GET /runs`, candidate detail, health — invalidated on relevant SSE events.

### 8.4 What does NOT persist (deliberately)

- **Mode is not a stored preference** — LIVE vs REPLAY is derived from the route + run status, never a toggle the user can get "stuck" in. (Prevents the failure state "reviewers confuse replay for live," USER_FLOWS.)
- **No cross-run inspector memory** — opening S2 for a new run starts with no drawer.
- **No client-side run state** beyond the projection — a hard reload reconstructs everything from REST + SSE resync.

---

## 9 · Representative dummy data (prototype with no backend)

Use this fixture set across S0–S6 so the clickable prototype is internally consistent. (Fuller fixtures live in `09-dummy-data.md`.)

### 9.1 Runs list (S0 `GET /runs`)

```json
[
  { "id": "run_8fK2", "title": "Quantum error-correction → supply-chain routing",
    "status": "running", "mode": "LIVE",
    "generation": { "current": 4, "max": 6 },
    "energy": { "spent": 812, "budget": 2000 },
    "bestIdeaPreview": "Surface-code-style redundancy applied to multi-depot rerouting",
    "subtypes": ["cross_domain_transfer"], "lastEventAgeMs": 1400 },

  { "id": "run_3pQ9", "title": "Zeitgeist: AI-native B2B onboarding in 2026",
    "status": "completed", "mode": "REPLAY",
    "generation": { "current": 5, "max": 5 },
    "energy": { "spent": 1870, "budget": 2000 },
    "bestIdeaPreview": "Thesis: onboarding collapses into a single agentic 'first value' loop",
    "subtypes": ["zeitgeist_synthesis"], "winnerCandidateId": "cand_77x" },

  { "id": "run_0aZ1", "title": "Prepared demo · CRISPR gene-editing → firmware patching",
    "status": "stopped", "mode": "REPLAY",
    "generation": { "current": 2, "max": 6 },
    "energy": { "spent": 540, "budget": 2000 },
    "bestIdeaPreview": "Guide-RNA specificity → targeted hotfix addressing",
    "subtypes": ["cross_domain_transfer", "zeitgeist_synthesis"] }
]
```

### 9.2 Launcher defaults (S1 `RunLauncherForm`)

```json
{ "promptSource": "prepared",
  "preparedSetId": "set_transfer_demo",
  "livePrompt": "",
  "subtypes": { "cross_domain_transfer": true, "zeitgeist_synthesis": true },
  "caps": { "maxPopulation": 20, "maxGenerations": 6, "energyBudget": 2000,
            "maxSpawnDepth": 3, "maxToolCalls": 40, "wallClockTimeoutMs": 480000 },
  "capsHardMax": { "maxPopulation": 30, "maxGenerations": 8, "energyBudget": 4000,
                   "maxSpawnDepth": 4, "maxToolCalls": 80, "wallClockTimeoutMs": 600000 },
  "modelProfile": "balanced", "scoringPolicyVersion": "sp_v0.3" }
```

### 9.3 Run header / health (S2 `GET /runs/:id` + `/health`)

```json
{ "runId": "run_8fK2", "title": "Quantum error-correction → supply-chain routing",
  "mode": "LIVE", "status": "running",
  "generation": { "current": 4, "max": 6 },
  "energy": { "spent": 812, "budget": 2000, "unit": "doppl_energy" },
  "health": { "currentGeneration": 4, "candidatesInFlight": 3,
              "lastEventAgeMs": 1400, "capsConsumed": { "generations": 0.66, "energy": 0.41 } },
  "sequenceThrough": 1487 }
```

### 9.4 Inspector deep-link payloads (S3 / S4)

```json
// S3  ?candidate=cand_77x
{ "id": "cand_77x", "agenomeId": "agen_4b", "subtype": "cross_domain_transfer",
  "status": "selected", "title": "Surface-code redundancy → depot rerouting",
  "novelty": { "score": 0.71, "method": "cosine-nn" },
  "fitness": { "total": 4.2, "policyVersion": "sp_v0.3" },
  "critics": ["factual_grounding", "novelty_prior_art", "feasibility", "falsification", "subtype_specific"] }

// S4  ?agenome=agen_4b
{ "id": "agen_4b", "status": "reproduced", "parentIds": ["agen_2a", "agen_1c"],
  "energySpent": 180, "candidatesProduced": 2, "mutationMeta": { "fields": ["personaWeights.rigor"] } }
```

> Status values above (`running`, `selected`, `reproduced`, `skipped`, etc.) are the canonical lifecycle states from ARCHITECTURE §3; render them with the shape+icon+label+color `StatusBadge` system defined in `03-design-system.md` — never color alone.

---

## 10 · Cross-doc handshake (so the rest of the kit stays consistent)

- **Screens** named here (S0–S6) are detailed visually in `04-screens-S0-S2.md` (S0/S1/S2) and `05-screens-S3-S6.md` (S3/S4/S5/S6).
- **Components** referenced (`AppShell`, `RunHeader`, `ModeBanner`, `LineageGraph`, `ReplayScrubber`, the Inspectors, etc.) get full prop/state specs in `03-design-system.md`.
- **Status encoding** (shape+icon+label+color, colorblind-safe) is owned by `03-design-system.md`; this doc only references it.
- **Lineage graph** node/edge types are owned by `06-lineage-graph.md`.
- **Motion** (spawn / drain / pulse / cull / fuse / mutate / advance, reduced-motion) is owned by `07-motion-and-liveness.md`.
- **States** (default/loading/empty/error/degraded/live/replay) per screen are owned by `08-states-...md`; the enumerations here are the IA-level summary.
- **Dummy data** master set is `09-dummy-data.md`; section 9 here is a starter subset.

No screen, route, component, or status name in this doc may diverge from `../../ARCHITECTURE.md` §3/§10/§11/§12 + Appendix A. Where this doc adds UI-only concepts (route shapes, drawer-vs-page, mode derivation), they are projections of the architecture, never new authoritative state.
