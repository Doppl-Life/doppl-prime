# /tdd brief — s0_runs_home_screen

## Feature
Build the **S0 Runs Home** screen at the `/` route (replacing FV.1's interim Dashboard mount): `runClient.listRuns()` → a grid of **minimal run cards** (a `StatusBadge` domain=`run` + the snake_case `runId` in mono + the `sequenceThrough` count), with per-card actions derived from status (live → **Open live** `/runs/:id`; completed/stopped → **Replay** `/runs/:id/replay` + **Final idea** `/runs/:id/final`; failed/cancelled → **Replay** partial), a **New Run** CTA → `/launch`, and the DS Empty/Loading/Error states. To keep the working demo's start-a-run path alive (FV.1 made `/launch` redirect to `/`, which would loop with the New Run CTA), FV.2 **repoints `/launch`** to interim-mount the existing Dashboard launcher view (`runId=""`) until FV.3 builds the dedicated S1. Cards are **machine-truth-minimal** — `RunSummary` carries only `{runId, status, sequenceThrough}`, so cards show exactly that (no fabricated title/energy/winner — DS rule 5; enrichment is a future TODO).

## Use case + traceability
- **Task ID:** FV.2
- **Architecture sections it implements:** `ARCHITECTURE.md §12` (frontend dashboard — the panel/screen vocabulary, status as shape+icon+label, projector-legibility), `ARCHITECTURE.md §11` (backend API & flows — `GET /runs` = `listRuns`, read-only)
- **Related context:**
  - Phase plan: `docs/planning/frontend-v2-phase-plan.md` (FV.2 row — `listRuns` → run cards + actions Open live/Replay/Final idea; New Run CTA → `/launch`; empty/loading/error; "Backend: EXISTS").
  - FV.1 (`0c670d9`): the router + AppShell + `RunClientProvider`/`useRunClient`; `/` currently interim-mounts Dashboard, `/launch` interim-redirects to `/` (FV.2 changes BOTH). The route table is in `apps/web/src/app/routes.tsx`; nav via `useNavigate`.
  - FV.0 (`9a6be17`): the `ds/` vocabulary — `StatusBadge`, `Button`, `EmptyState`/`LoadingState`/`ErrorState` (from `ds/index.ts`). **No run-card ds component exists** → FV.2 composes a new `RunCard` from `StatusBadge` + `Button`.
  - **Data:** `RunSummary` = `{runId: string, status: string|null, sequenceThrough: number}` (web-local Zod, `apps/web/src/data/runClient.ts:102`); `listRuns(): Promise<RunSummary[]>`. **No title/energy/best-candidate fields** — the DS S0 prototype's rich cards are aspirational; FV.2 cards are minimal (Step-2.5 Q1).
  - `StatusBadge` domain=`run` maps all 8 `RunStatus` values (`status-map.ts:77` — configured/running/completing/completed/stopping/stopped/failed/cancelled; null → neutral '?'). Confirmed complete.
  - The existing `RunListPanel` (single replay action, mounted in Dashboard's `runId=""` view) is SUPERSEDED by S0 but stays reachable via the `/launch` interim Dashboard mount (Step-2.5 Q3 — don't orphan it; apps/web LESSONS 96 dead-code-by-reachability).
  - Layer rule #9 (frontend): read-only over projections; commands/nav only; no contract mutation.

## Acceptance criteria (what "done" means)
- [ ] A `RunsHomeScreen` component mounts at `/` (replacing FV.1's interim Dashboard mount in `routes.tsx`); on mount it calls `useRunClient().listRuns()` and renders the result.
- [ ] A `RunCard` (new, composed from `ds/` primitives) renders per run: `StatusBadge` (domain=`run`, the run's status — shape+icon+label, never color alone, rule #4 a11y) + the `runId` in JetBrains Mono (DS rule 5 machine-truth) + the `sequenceThrough` count. **Minimal fields only** (no fabricated title/energy/winner — `RunSummary` carries no more).
- [ ] **Per-card actions derived from status** (`Button`s wired to `useNavigate`): live (`running`/`completing`) → "Open live" → `/runs/:id`; terminal-with-possible-winner (`completed`/`stopped`) → "Replay" → `/runs/:id/replay` + "Final idea" → `/runs/:id/final`; `failed`/`cancelled` → "Replay" (partial) → `/runs/:id/replay`; `configured` → minimal/none (Step-2.5 Q5).
- [ ] A **New Run** CTA (`Button` primary) → `navigate('/launch')`.
- [ ] **`/launch` repointed** (in `routes.tsx`) from the FV.1 redirect-to-`/` to interim-mounting the existing Dashboard launcher view (`runId=""`) — so the New Run flow reaches a working start-a-run launcher (and `RunListPanel` stays reachable) until FV.3 builds the dedicated S1. **Preserves the demo** (`/` runs-home → New Run → `/launch` launcher → start → `/runs/:id`).
- [ ] **States:** loading → `LoadingState`; error → `ErrorState` + retry (re-calls `listRuns`); empty (no runs) → `EmptyState` ("No runs yet") + the New Run CTA. Never a blank screen (DS rule 5 honesty).
- [ ] web unit suite green (S0 render + listRuns + nav + states tests added); `/preflight` clean. **Backend: EXISTS** (read-only `listRuns`); **ZERO contract surface**.

## Wiring / entry point (Step 7.5)
`apps/web/src/app/routes.tsx` — the `/` route swaps from the interim Dashboard to `<RunsHomeScreen/>`; the `/launch` route swaps from `Navigate to /` to the interim Dashboard launcher (`runId=""`). `RunsHomeScreen` uses `useRunClient()` + `useNavigate()`. Confirm the demo path is reachable: `/` lists runs → a card action navigates to the right `/runs/:id[/replay|/final]` → New Run reaches the `/launch` launcher.

## Files expected to touch
**New:**
- `apps/web/src/routes/RunsHomeScreen.tsx` — the S0 screen (listRuns + states + New Run CTA)
- `apps/web/src/components/run/RunCard.tsx` — the per-run card (StatusBadge + runId + sequence + status-derived action Buttons)
- Test files: `apps/web/test/unit/routes/RunsHomeScreen.test.tsx` + `apps/web/test/unit/components/run/RunCard.test.tsx`

**Modified:**
- `apps/web/src/app/routes.tsx` — `/` → `RunsHomeScreen`; `/launch` → interim Dashboard(`runId=""`)
- `apps/web/test/e2e/dashboard-smoke.spec.ts` — the gated smoke's entry may need the `/` → New Run → `/launch` nav (keep green)

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)
Tests in `apps/web/test/unit/routes/RunsHomeScreen.test.tsx` + `components/run/RunCard.test.tsx` (`// @vitest-environment happy-dom`, `MemoryRouter` + `RunClientProvider` fake + a LocationProbe for nav):

1. **`test_loads_and_renders_run_cards`** — Asserts: `listRuns` called on mount; a card per run shows the `runId` + a `run`-domain `StatusBadge` (glyph+label, not color alone) + `sequenceThrough`. Why: §12 screen + §11 listRuns.
2. **`test_empty_state_with_new_run_cta`** — Asserts: `listRuns`→`[]` renders `EmptyState` ("No runs yet") + the New Run CTA. Why: DS honesty, never blank.
3. **`test_loading_then_ready`** — Asserts: a pending `listRuns` shows `LoadingState`, then the cards. Why: state machine.
4. **`test_error_state_retry`** — Asserts: a rejected `listRuns` shows `ErrorState`; clicking retry re-calls `listRuns`. Why: degraded honesty.
5. **`test_open_live_navigates`** — Asserts: a `running` card's "Open live" → location `/runs/:id`. Why: nav wiring.
6. **`test_replay_and_final_navigate`** — Asserts: a `completed` card's "Replay" → `/runs/:id/replay`, "Final idea" → `/runs/:id/final`. Why: nav wiring + status-derived actions.
7. **`test_failed_card_replay_partial`** — Asserts: a `failed` card offers "Replay" → `/runs/:id/replay` (no "Final idea"). Why: status-derived action set.
8. **`test_new_run_cta_navigates_to_launch`** — Asserts: the New Run CTA → `/launch`. Why: start-a-run entry.
9. **`test_launch_route_mounts_interim_launcher`** — Asserts: `/launch` renders the interim Dashboard launcher (a start affordance is present), NOT a redirect to `/`. Why: the demo-continuity repoint (start-a-run reachable).
10. **`test_status_badge_not_color_alone`** — Asserts: each card's status carries a glyph + text label (a11y). Why: §12 / rule #4 / DS rule 1.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** NONE — read-only over `listRuns`; consumes the web-local `RunSummary` + frozen contracts; no contract surface.
- **Orchestrator doc rows to write hot (Step 9 routing):** likely just a `apps/web/LESSONS` convention candidate (S0 cards are machine-truth-minimal off `RunSummary`; the `/launch` repoint preserves start-a-run; status-derived card actions). An `ARCHITECTURE.md §12` note only if the screen behavior warrants it (the multi-route note from FV.1 already covers S0). Orchestrator writes hot.
- **shared-contract seam model touched?** No.

## Things to flag at Step 2.5
1. **Card richness — minimal vs enriched.** My default vote: **MINIMAL** — `RunSummary` has only `{runId, status, sequenceThrough}`, so cards show exactly that (machine-truth, DS rule 5; no fabricated title/energy/winner). Fetching per-run enrichment (title/energy/best-candidate via RunStateView/RunHealth/lineage) is an N+1 cost + needs backend support → a future TODO (Carry-forward), NOT FV.2. Show the real minimal data honestly.
2. **`/launch` repoint (demo continuity).** My default vote: **repoint `/launch` to interim-mount the existing Dashboard launcher (`runId=""`)** so the New Run CTA reaches a working start-a-run flow (and `RunListPanel` stays reachable). The alternative (keep `/launch`→`/` + embed the launcher in S0) muddies S0. FV.3 then builds the dedicated S1 at `/launch`.
3. **`RunListPanel` — orphan-remove vs keep-reachable.** My default vote: **keep it reachable** via the `/launch` interim Dashboard mount (don't remove it this slice — FV.3's S1 supersedes the launcher view and can retire it then). Avoids a dead-code reachability finding (apps/web LESSONS 96) while keeping FV.2 focused on S0.
4. **Reviewer-mode New Run CTA hiding.** The DS fixture notes "operator-only — hide in reviewer mode." My default vote: **always show the New Run CTA** — no reviewer-mode context exists in FV.1/FV.2; a role/mode gate is a future concern (Carry-forward), not FV.2.
5. **`configured`-status card actions.** My default vote: a `configured` (not-yet-started) run shows the status badge but **no Open/Replay action** (nothing to observe yet) — or "Open live" if the kernel transitions it quickly; default to **no action** (minimal, honest) — flag if the demo needs otherwise.

## Dependencies + sequencing
- **Depends on:** FV.1 (`0c670d9`, the router + AppShell + `useRunClient`) + FV.0 (`9a6be17`, the `ds/` primitives). Backend `listRuns` (EXISTS). Backend-independent of Phase FB.
- **Blocks:** none hard, but it's the home screen every later FV screen returns to (the wordmark links `/`). FV.3 (S1 Launcher) replaces the `/launch` interim mount this slice sets up.

## Estimated commit count
**1–2.** S0 screen + RunCard + the routes repoint is one coherent slice (same area, shared context, no safety invariant). MAY split into 2 (RunCard component → the screen + routes wiring) if the diff grows; flag at Step 7.5. Each ends in a `feat(web)` commit.

## Lessons-logged candidates anticipated
- **Convention candidate** — "S0 cards render machine-truth-minimal off `RunSummary` (`{runId, status, sequenceThrough}` — no fabricated title/energy/winner; DS rule 5); per-card actions are status-derived (live→Open, terminal→Replay/Final); a screen-replacement slice must preserve the demo's start path (repoint `/launch` to the interim launcher rather than orphaning it)."
- **Future TODO — operational** — enrich `listRuns`/`RunSummary` (or lazy per-card fetch) with title/energy/best-candidate for the rich S0 cards; a reviewer-mode gate for the New Run CTA.
- **Architecture-doc note candidate** — none expected (FV.1's §12 multi-route note already frames S0).
