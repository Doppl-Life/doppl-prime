# /tdd brief — live_replay_mode_indicator

## Feature
The **live/replay mode indicator** — port the prototype's `ModeBanner` to TS-strict, deriving the banner state from the run-store's `mode` (P7.2: live|replay) + the run's current status, rendered with the **accessible** treatment (shape/label/pattern + color, **never color alone**) and **persistently visible** so a room never mistakes a replay for a live run. In replay mode the screen is clearly marked **REPLAY** and shows the original timestamps/order.

## Use case + traceability
- **Task ID:** P7.4 (live/replay mode indicator, REQ-UX-002)
- **Architecture sections it implements:** `ARCHITECTURE.md §12` (a persistently-visible live/replay mode indicator using shape+label+icon+color, not color alone; replay clearly marked; §17 fallback ladder — the operator may fall back live→replay mid-session).
- **Design source:** prototype `components/feedback/ModeBanner.{jsx,d.ts,prompt.md}` — port to TS-strict; the linter's `ModeBanner` prop is `mode ∈ {live|replay|complete|stopped|failed}` (live = breathing, replay = hatched per §12). **Builds on P7.2** (`getMode()` live|replay + the run's status from the store, `2d43ac7`) + **P7.3** (the design tokens + accessible-status conventions, `65a988c`). Design-touching → the prototype is in place. **Unit-only** (happy-dom).

## Acceptance criteria (what "done" means)
- [ ] `ModeBanner` ported TS-strict (`apps/web/src/components/feedback/ModeBanner.tsx`) implementing the prototype's `mode ∈ {live|replay|complete|stopped|failed}` prop
- [ ] The banner state is **derived** from the run-store `mode` (live|replay) + the run's status: `replay` when mode=replay; else by status (running/completing→`live`, completed→`complete`, stopped/stopping→`stopped`, failed→`failed`) — updates if the operator falls back live→replay mid-session
- [ ] Live vs replay is **unambiguous** via shape/label/pattern + color (**never color alone**); **replay** is clearly marked and (replay mode) the original timestamps/order are shown
- [ ] The component is **persistently visible** (top banner, per the prototype's z-banner layer) — P7.4 provides the component + the derivation; the global mount across all panels wires in the P7.14 shell
- [ ] Adherence-clean (var() tokens, no raw hex/px); no `apps/api` import (rule #9)
- [ ] Unit tests pass (happy-dom — derivation + render + not-color-alone + a11y); **count reported**; `/preflight` (web) clean

## Wiring / entry point (Step 7.5)
**none — global mount in P7.14.** P7.4 provides `ModeBanner` + a `deriveMode(store)` helper; the persistent top-banner mount across all panels is wired in the **P7.14 dashboard shell**. Exercised now against the store's `mode`/status (injected fixtures). So: *first consumer — the P7.14 shell (persistent mount); derivation reads the P7.2 store.*

## Files expected to touch
**New:**
- `apps/web/src/components/feedback/ModeBanner.tsx` — the TS-strict port + the `deriveMode(mode, runStatus) → {live|replay|complete|stopped|failed}` helper
- `apps/web/test/unit/components/ModeBanner.test.tsx`

**Modified:** none expected (consumes P7.2 store types + P7.3 tokens). Stage only `apps/web/...`, never `-A` (two-impl worktree).

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)
**`apps/web/test/unit/components/ModeBanner.test.tsx`** (happy-dom, `spec(§12)`):
1. **`test_derive_mode_from_store_and_status`** — replay-mode → `replay`; live+running → `live`; completed → `complete`; stopped → `stopped`; failed → `failed`. *(Positive guard.)* Why: §12 derivation.
2. **`test_replay_clearly_marked`** — replay renders a clear "REPLAY" label (+ shows original timestamps/order). Why: REQ-UX-002.
3. **`test_not_color_alone`** — live vs replay differ by label/pattern, not only color. Why: §12 / forbidden #4.
4. **`test_mode_updates_on_live_to_replay_fallback`** — a mode change live→replay updates the banner. Why: §17 fallback ladder.
5. **`test_no_apps_api_import`** — structural (rule #9, positive-guarded).

## Cross-doc invariant impact
- **Model field changes:** none (read-only consumer). **§2.5-seam:** none.
- **Orchestrator doc rows (Step 9):** an `apps/web` LESSONS entry only if it surfaces something beyond §1–§3 (likely not — it applies the established conventions). I author hot if so.

## Things to flag at Step 2.5
1. **Banner-state derivation mapping.** My default vote: `replay` overrides; else running/completing→`live`, completed→`complete`, stopped/stopping→`stopped`, failed→`failed`. Confirm the status→state mapping.
2. **Port the ModeBanner visual vs compose StatusBadge.** My default vote: **port the prototype's `ModeBanner`** (it has its own live-breathing vs replay-hatched treatment per §12 — a distinct feedback component, not a StatusBadge) — keep not-color-alone (label + pattern + color). Confirm.
3. **Global-mount scope.** My default vote: P7.4 provides the component + `deriveMode` (tested in isolation); the persistent across-all-panels mount is **P7.14** (shell). Confirm the boundary.

## Dependencies + sequencing
- **Depends on:** **P7.2** (`2d43ac7` — store mode + run status), **P7.3** (`65a988c` — tokens + accessible conventions), the prototype (`7c0d34c`). Design-touching (prototype in place). Independent of apps/api.
- **Blocks:** P7.14 (shell mounts it persistently). Small slice.

## Estimated commit count
**1.** Small feature slice (one component + derivation). Not safety-invariant. Reviewers: code-quality = phase-boundary; no security-reviewer (presentational).

## Lessons-logged candidates anticipated
- Likely none new (applies apps/web §1–§3); flag if the live-breathing/replay-hatched motion surfaces a reusable pattern.

## How to invoke
> `demo-web-implementer` session is oriented — skip `/session-start`; jump to `/tdd`. cwd `apps/web/`. Stage only `apps/web/...`.
1. **Read this brief + skim** the prototype `components/feedback/ModeBanner.*`.
2. **Run `/tdd live_replay_mode_indicator`.**
3. **Step 2.5** — answer the 3 questions (esp. Q1 derivation mapping), send the write-up + coverage map.
4. **Step 9** — surface anything beyond apps/web §1–§3.
