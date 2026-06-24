# /tdd brief — ds_component_port_to_production_tsx

## Feature
Port the remaining Doppl design-system components from `docs/doppl-design-system/components` (`.jsx` + `.d.ts` sources) into `apps/web/src/components/ds/` as production **TS-strict `.tsx`**, and reconcile the already-ported `StatusBadge` + `ModeBanner` against the DS source. Components: **Button, Meter, SystemState shells (EmptyState/LoadingState/ErrorState/DegradedState), CandidateCard, AgenomeCard, ActivityTicker, HealthIndicator, RunEnergyGauge**. Each is a function component with an exported `<Name>Props` interface, styled with inline `CSSProperties` referencing `var(--token)` only (no raw hex/px), honoring the five DS rules. This builds the component vocabulary FV.1+ (router + screens) consume; nothing is mounted into a route yet.

## Use case + traceability
- **Task ID:** FV.0
- **Architecture sections it implements:** `ARCHITECTURE.md §12` (frontend dashboard — status uses shape/label/icon in addition to color, high-contrast/projector-legible, the panel vocabulary)
- **Related context:**
  - Phase plan: `docs/planning/frontend-v2-phase-plan.md` (FV.0 row + "Reuse inventory" — DS tokens + StatusBadge/ModeBanner already ported).
  - DS kit: `docs/doppl-design-system/` — read `readme.md` (manifest + design guide) + `SKILL.md` first. Components are `.jsx`+`.d.ts` **design references** under `components/{core,feedback,cards,observatory}/`; **hand-translate to TS-strict `.tsx`** — do NOT import the prototype `.jsx`. Tokens live in `docs/doppl-design-system/tokens/` and are already mirrored into `apps/web/src/styles/tokens/`.
  - **The five DS rules (root `CLAUDE.md` design rules — enforced every slice):** (1) status = shape+icon+label+color, never color alone (`StatusBadge`); quantities use `Meter` (length is truth, number shown); (2) LIVE vs REPLAY unmistakable (`ModeBanner`); (3) dark observatory, one accent "living cyan", no gradient decoration, no emoji; (4) motion meaningful + honor `prefers-reduced-motion`; (5) machine truth verbatim — snake_case ids in JetBrains Mono, **scores normalized 0–1**.
  - Existing ports to reconcile: `apps/web/src/components/core/StatusBadge.tsx` (+ `core/status-map.ts`, exhaustive over frozen domain enums — `apps/web/LESSONS` §3) and `apps/web/src/components/feedback/ModeBanner.tsx`.
  - Existing component + test conventions to mirror: `apps/web/src/components/demo/RunHealthPanel.tsx` (interface-first props, `const CSSProperties` token styles) and `apps/web/test/unit/panels/CandidateInspector.test.tsx` (Vitest + `@testing-library/react` + happy-dom; the `no-raw-hex` adherence regex test).

## Acceptance criteria (what "done" means)
- [ ] Each target component is a production `.tsx` under `apps/web/src/components/ds/` with an exported `<Name>Props` interface, TS-strict (no `any`), function-component style. Components: `Button`, `Meter`, `EmptyState`, `LoadingState`, `ErrorState`, `DegradedState`, `CandidateCard`, `AgenomeCard`, `ActivityTicker`, `HealthIndicator`, `RunEnergyGauge`.
- [ ] **Rule 1 (StatusBadge):** the reconciled `StatusBadge` encodes status as **glyph/shape + label + color** — never color alone; an accessible non-color signal (the glyph + the text label) is present in the DOM. Status maps stay **exhaustive over the frozen domain enums** (`status-map.ts`; unknown → neutral handler, never a crash).
- [ ] **Rule 1/5 (Meter):** `Meter` renders a `value` in **0–1**, the **numeric value is shown**, and the bar **length encodes the value** (length is truth); a `degraded` state is visually distinct + labeled (never silent).
- [ ] **Rule 2 (ModeBanner):** the reconciled `ModeBanner` renders LIVE (accent/breathing) vs REPLAY (warning/hatched/static) unmistakably, with a text label (not color alone) and the correct top z-layer token.
- [ ] **Rule 3/5 adherence:** no raw hex/px in `ds/` — colors + spacing + motion are `var(--token)` only (enforced by an adherence regex test over `apps/web/src/components/ds/`); no emoji; one accent.
- [ ] **Rule 4 (motion):** any animation uses a named `var(--motion-*)` token (no hardcoded durations); the global `prefers-reduced-motion` guard in `tokens/base.css` covers the keyframes (assert structurally — components reference the tokens).
- [ ] `apps/web/src/components/ds/index.ts` barrel exports every ported component (the canonical DS import surface) + re-exports the reconciled `StatusBadge` + `ModeBanner`.
- [ ] All web unit tests pass (`pnpm -C apps/web test` / `pnpm test:unit`); `/preflight` clean (`pnpm lint && pnpm typecheck && pnpm test`).
- [ ] Backend: **none** — pure presentation; consumes frozen contracts read-only; **no contract field changes**.

## Wiring / entry point (Step 7.5)
**none — wiring lands in FV.1 (app shell + router) + FV.2+ (the DS screens consume `ds/` components).** FV.0 ships the component vocabulary only; nothing is mounted into a route this slice. The consumption surface is `apps/web/src/components/ds/index.ts` (the barrel FV.1+ import from). Confirm the barrel exports resolve (a trivial import smoke in a test counts) — but do NOT add a route or screen here (that is FV.1/FV.2 and would jump scope).

## Files expected to touch
**New (under `apps/web/src/components/ds/`):**
- `Button.tsx`, `Meter.tsx` — core primitives (from `ds/components/core/`)
- `EmptyState.tsx`, `LoadingState.tsx`, `ErrorState.tsx`, `DegradedState.tsx` — system-state shells (from `ds/components/feedback/SystemState.jsx`)
- `CandidateCard.tsx`, `AgenomeCard.tsx` — cards (from `ds/components/cards/`)
- `ActivityTicker.tsx`, `HealthIndicator.tsx`, `RunEnergyGauge.tsx` — observatory (from `ds/components/observatory/`)
- `index.ts` — barrel export (the canonical DS import surface)
- Test files under `apps/web/test/unit/components/ds/` (one per component or grouped — implementer's call) + the `ds/`-scoped adherence regex test

**Modified (reconcile against DS source):**
- `apps/web/src/components/core/StatusBadge.tsx` (+ `core/status-map.ts` if drift found) — reconcile vs `ds/components/core/StatusBadge.jsx`
- `apps/web/src/components/feedback/ModeBanner.tsx` — reconcile vs `ds/components/feedback/ModeBanner.jsx`

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)
Tests in `apps/web/test/unit/components/ds/` (`// @vitest-environment happy-dom`, `@testing-library/react`):

1. **`test_status_badge_encodes_shape_and_label`** — Asserts: `StatusBadge` renders a non-color signal (glyph + visible status label) for a representative status; not color-alone. Why: DS rule 1 / §12 accessibility (shape/label/icon in addition to color).
2. **`test_status_map_unknown_status_neutral`** — Asserts: an unknown/unmapped status resolves to the neutral handler, never throws. Why: `status-map.ts` exhaustive-over-frozen-enums (`apps/web/LESSONS` §3).
3. **`test_meter_value_0_1_and_number_shown`** — Asserts: `Meter` with `value=0.42` shows the number AND the bar length encodes 0.42 (length-is-truth); a value outside 0–1 is clamped/handled, not rendered raw. Why: DS rule 1/5 (scores normalized 0–1, length is truth).
4. **`test_meter_degraded_state_labeled`** — Asserts: `degraded` Meter is visually distinct + carries a text label (tells the truth about degraded data). Why: DS rule 5.
5. **`test_mode_banner_live_vs_replay_distinct`** — Asserts: LIVE vs REPLAY render distinct labels/tokens (not color alone) and the correct z-layer. Why: DS rule 2 / §12 live-replay indicator.
6. **`test_button_variants_render`** — Asserts: each `variant` (primary/secondary/ghost/danger) + `disabled` render with token classes/styles, `onClick` fires when enabled. Why: core primitive contract.
7. **`test_system_state_shells_render`** — Asserts: EmptyState/LoadingState/ErrorState/DegradedState each render their title/label + (ErrorState) an `onRetry` affordance. Why: §12 degraded-data honesty (never a blank/fabricated panel).
8. **`test_card_and_observatory_components_render`** — Asserts: CandidateCard/AgenomeCard/ActivityTicker/HealthIndicator/RunEnergyGauge render with representative props (CandidateCard composes StatusBadge + Meter; selected gets the winner glow; energy reflects spent/budget). Why: §12 panel vocabulary.
9. **`test_no_raw_hex_or_px_in_ds`** (adherence) — Asserts: every `.ts`/`.tsx` under `src/components/ds/` contains no raw hex color and no hardcoded px/duration — `var(--token)` only. Why: DS rule 3/4/5 (token-only; mirror the existing `no_raw_hex` panel test).
10. **`test_ds_barrel_exports_resolve`** — Asserts: `import * as ds from '…/components/ds'` exposes every ported component (the FV.1+ consumption surface). Why: Step 7.5 entry-point smoke.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** **none.** Pure presentation; consumes frozen `@doppl/contracts` read-only; no contract surface touched.
- **Orchestrator doc rows to write hot (Step 9 routing):** none expected. If a DS-port convention emerges (e.g. "DS components hand-translate `.jsx`→`.tsx`, token-only, exhaustive status maps"), flag it as a `apps/web/LESSONS` convention candidate at Step 9 (orchestrator writes).
- **shared-contract seam (shared-contract) model touched?** No — no contract model is touched; no schema-snapshot test required.

## Things to flag at Step 2.5
1. **Where do the reconciled `StatusBadge` + `ModeBanner` live?** (a) MOVE them into `ds/` (single canonical home, update existing imports across the app); (b) reconcile **in place** under `core/`/`feedback/` and re-export from `ds/index.ts`. My default vote: **(b) reconcile-in-place + re-export** — zero churn to existing imports (the Phase-D dashboard still imports from `core/`/`feedback/`), and `ds/index.ts` still becomes the one canonical import surface for FV.1+. A later consolidation move is cheap if wanted.
2. **`SystemState`: four separate `.tsx` files vs one aggregate object export.** The DS source exports `SystemState = { EmptyState, LoadingState, ErrorState, DegradedState }`. My default vote: **four separate `.tsx` files** (EmptyState/LoadingState/ErrorState/DegradedState) + the `ds/` barrel re-exporting them — matches the one-component-per-file port pattern + tree-shaking; the barrel can still group them.
3. **`CriticGauntletPanel` (in the DS kit's `observatory/`) — in scope?** It is NOT in FV.0's named target list; the plan reuses the existing tested `CriticGauntletPanel` logic re-skinned in **FV.5**. My default vote: **OUT of FV.0** — port only the 11 named components; CriticGauntletPanel is FV.5's re-skin of existing logic.
4. **Barrel export style for `ds/index.ts`.** My default vote: **named re-exports** (`export { Button } from './Button'` …) — explicit, tree-shakeable, matches the existing app's import style (no namespace-object wrapper).
5. **Commit shape — one bundled commit, or split primitives from composites?** None of these touches a safety invariant, so bundling is allowed. My default vote: **one commit if it stays grok-able; split into 2 (primitives: Button/Meter/StatusBadge/ModeBanner/SystemState — then composites: cards/observatory) only if the diff gets large.** Flag at Step 7.5 if splitting.

## Dependencies + sequencing
- **Depends on:** P6/P7/PD web layer (the tested data + tokens + StatusBadge/ModeBanner ports already on this branch). The DS tokens are already mirrored into `apps/web/src/styles/tokens/`.
- **Blocks:** FV.1 (app shell/router) + FV.2–FV.9 (every DS screen imports from `ds/`). Runs **in parallel with Phase FB** (backend-independent).

## Estimated commit count
**1–2.** A bundled DS-component port (same code area, shared context — the 5 DS rules + token usage, no safety invariant) is one logical unit per the bundling criteria; it MAY split into 2 (primitives → composites) if the diff grows past a one-sitting review. Each ends in a `feat(web)` commit.

## Lessons-logged candidates anticipated
- **Convention candidate** — "DS components are hand-translated `.jsx`→TS-strict `.tsx` (never import the prototype), token-only (`var(--token)`, no raw hex/px), with exhaustive status maps over frozen domain enums; `ds/index.ts` is the canonical import surface."
- **Future TODO — operational** — a `prefers-reduced-motion` test helper (happy-dom media-query stub) if motion-behavior assertions are wanted beyond the structural token check.
- **Architecture-doc note candidate** — none expected (pure presentation; §12 already pins the shape/label/icon + projector-legibility requirements the port satisfies).
