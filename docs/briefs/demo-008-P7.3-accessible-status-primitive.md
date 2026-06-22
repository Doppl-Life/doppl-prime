# /tdd brief — accessible_status_primitive

## Feature
The dashboard's **accessible status primitive + design-token foundation**, built **FROM the committed `docs/doppl-design-system/` prototype** (`7c0d34c`): adopt the prototype's CSS design tokens into `apps/web`, port its `StatusBadge` component to TS-strict, and build a `status-map` that renders **every frozen domain status** with **shape + icon + text label + colorblind-safe color (never color alone)**. A single shared `StatusBadge` maps each domain status enum (agenome / candidate / check / run / generation / subtype) to a fixed glyph+icon+label so the same status looks identical everywhere; unknown/unmapped values render a **distinct neutral indicator** (never throw/blank); status is **programmatically determinable** (label/title to assistive tech). This is the **first design slice** — it establishes the token + primitive + layout foundation all P7 panels build on.

## Use case + traceability
- **Task ID:** P7.3 (accessible status primitive — shape + label + icon + colorblind-safe color)
- **Architecture sections it implements:** `ARCHITECTURE.md §12` (status uses **shape/label/icon in addition to color**, colorblind-safe palette, high-contrast theme, projector-legible fonts — the dashboard is a first-class acceptance surface shown to a room).
- **Design source (authoritative for the UI):** the prototype at `docs/doppl-design-system/` —
  - `components/core/StatusBadge.{jsx,d.ts,prompt.md}` — port to TS-strict; `StatusBadgeProps = {domain?, status, size?, showLabel?, pulse?, reason?}` (implement verbatim).
  - `tokens/*.css` (colors/typography/fonts/spacing/base/elevation/motion) — the **CSS custom-property** token set (`--status-*`, `--check-*`, `--subtype-*`, `--fg-*`, `--bg-*`, `--text-*`, `--font-*`, `--space-*`, `--glow-*`); high-contrast via the `.hc` class; projector floor 13px.
  - `guidelines/status-agenome.card.html`, `status-candidate-check.card.html`, `status-edges-subtypes.card.html` — the status→glyph/color mappings.
  - `SKILL.md`/`readme.md` — usage contract: **COPY tokens + REIMPLEMENT components in TS-strict** (do NOT import the `.jsx` directly); consume tokens via `var(--token)`; no Tailwind; no build step. `_adherence.oxlintrc.json` = the design-adherence rules (no raw hex, no raw px, font-lock to Inter/JetBrains-Mono, StatusBadge prop/enum shape).
- **Related context:** the **frozen domain status enums are the AUTHORITY** (the dashboard renders real statuses): `AgenomeStatus` (7), `CandidateStatus` (8), `CheckStatus` (3), `RunStatus` (8), `GenerationStatus` (8), `Subtype` (2) — consumed via the P7.1 `contracts.ts` seam. The status-map covers EVERY frozen value (see the drift reconciliation below). Read-only consumer (rule #9); no `apps/api` import, no secret.

## Acceptance criteria (what "done" means)
- [ ] The prototype's CSS tokens are adopted into `apps/web` (copied under `apps/web/src/styles/tokens/` + imported once at the app root) and consumed via `var(--token)` — high-contrast (`.hc`) + projector-legible font tokens available app-wide
- [ ] `StatusBadge` is ported to TS-strict (`apps/web/src/components/core/StatusBadge.tsx`) implementing `StatusBadgeProps` verbatim ({domain?, status, size?, showLabel?, pulse?, reason?})
- [ ] Every status renders with **shape (glyph) AND text label AND icon** + a colorblind-safe color — **never color alone**; the glyph is `aria-hidden`, the label/`title` carry the status to assistive tech (programmatically determinable)
- [ ] A single shared `status-map` maps **every value of the frozen domain enums** (AgenomeStatus·CandidateStatus·CheckStatus·RunStatus·GenerationStatus·Subtype) to a fixed {glyph, label, colorToken} — exhaustively (a test iterates each enum's values and asserts a mapping exists)
- [ ] **Unknown/unmapped status → a distinct NEUTRAL indicator** (never throws, never renders blank)
- [ ] **Drift reconciliation (prototype vs frozen contract — frozen wins):** (a) agenome `'mutated'` from the prototype is OMITTED (not a frozen AgenomeStatus value — mutation is a reproduction mode); (b) candidate `'culled'` IS mapped (frozen CandidateStatus has it; reuse the cull glyph/color) though the prototype's candidate table omitted it; (c) `generation` is added as a domain mapping for the frozen GenerationStatus 8-state (encodings derived consistently with the prototype's visual language — see Step-2.5 Q3)
- [ ] **Adherence rules followed:** no raw hex / no raw px in the component (tokens via `var()` only), fonts limited to the token families — matching `_adherence.oxlintrc.json` (pinned by a structural test; wiring the oxlint config into preflight = Step-2.5 Q4)
- [ ] Unit tests pass (status-map exhaustiveness + StatusBadge render contract, happy-dom); **count reported**; `/preflight` (web) clean

## Wiring / entry point (Step 7.5)
**none — wiring lands in P7.4+ panels.** `StatusBadge` + the tokens + `status-map` are the shared primitive every panel consumes: the mode indicator (P7.4), lineage nodes (P7.7), candidate/agenome inspectors (P7.10), critic gauntlet (P7.11), etc. The app root imports the tokens (so they're live app-wide); the StatusBadge is rendered by the panels. So: *first consumers — P7.4 mode indicator + all P7.5+ panels; the token import is wired at the app root now.*

## Files expected to touch
**New:**
- `apps/web/src/styles/tokens/` — the adopted prototype token CSS (`colors.css`, `typography.css`, `fonts.css`, `spacing.css`, `base.css`, `elevation.css`, `motion.css`) + an import barrel (and wire the import at the app root / `main.tsx` or a top `styles.css`)
- `apps/web/src/components/core/StatusBadge.tsx` — the TS-strict port (StatusBadgeProps verbatim; shape+icon+label+color; aria-hidden glyph + title)
- `apps/web/src/components/core/status-map.ts` — frozen-enum → {glyph, label, colorToken} mapping (exhaustive over the domain enums) + the unknown→neutral fallback
- `apps/web/test/unit/components/status-map.test.ts`, `apps/web/test/unit/components/StatusBadge.test.tsx`

**Modified:**
- the app root (`apps/web/src/main.tsx` or App) — import the token CSS once so tokens are live app-wide

> **Drift note (orchestrator):** the tracker's P7.3 file line says `src/ui/StatusIndicator.tsx` + `src/ui/theme.ts` + `src/ui/status-map.ts`, but FROM the prototype the names/locations are `components/core/StatusBadge.tsx` (the design-system name the adherence linter checks) + **CSS tokens** (not a TS `theme.ts`). I'll reconcile the `apps/web/CLAUDE.md` module-layout (currently `components/{lineage,run,evidence}`) to the prototype's categories (`components/{core,cards,feedback,observatory}`) when this lands — see Step-2.5 Q1.

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)

**`apps/web/test/unit/components/status-map.test.ts`** (`spec(§12)`):
1. **`test_every_frozen_status_has_a_mapping`** — iterate every value of `AgenomeStatus`/`CandidateStatus`/`CheckStatus`/`RunStatus`/`GenerationStatus`/`Subtype` (from `@doppl/contracts`); each maps to a `{glyph, label, colorToken}` with all three present. Why: §12 exhaustive + future-proof (a new enum value fails loudly). *(Positive guard.)*
2. **`test_mapping_never_color_alone`** — every mapping has a non-empty glyph AND label (color is never the sole encoding). Why: §12 / forbidden #4.
3. **`test_unknown_status_neutral_indicator`** — an unmapped status string → the distinct neutral indicator (no throw, no blank). Why: §12 robustness.
4. **`test_drift_reconciliation`** — agenome `'mutated'` is NOT a mapped agenome status (omitted); candidate `'culled'` IS mapped; `generation` domain covers all 8 GenerationStatus values. Why: frozen-contract authority over the prototype.
5. **`test_color_tokens_are_var_refs_not_raw_hex`** — every `colorToken` is a `var(--...)` reference, never a raw hex (adherence). Why: `_adherence.oxlintrc.json` no-raw-hex.

**`apps/web/test/unit/components/StatusBadge.test.tsx`** (happy-dom, `spec(§12)`):
6. **`test_renders_shape_icon_label`** — StatusBadge renders the glyph + label (showLabel) for a given domain+status; structure present. Why: §12 shape+icon+label.
7. **`test_glyph_aria_hidden_status_in_title`** — the glyph is `aria-hidden`; the status is exposed via text label / `title` (programmatically determinable). Why: §12 a11y.
8. **`test_unknown_status_renders_neutral_not_throw`** — an unknown status renders the neutral indicator without throwing. Why: §12 robustness.
9. **`test_no_apps_api_import`** — structural: the component imports nothing from `apps/api`. Why: rule #9 (positive-guarded).

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** none (read-only consumer of the frozen status enums).
- **§2.5-seam touched?** No (consumes frozen enums; defines UI internals).
- **Orchestrator doc rows to write hot (Step 9):** (1) **reconcile the `apps/web/CLAUDE.md` module-layout** to the prototype categories (`components/{core,...}` + `src/styles/tokens/`) — I write it; (2) likely an `apps/web` **LESSONS** entry (the design-token adoption + frozen-enum-authoritative status-map + drift-reconciliation pattern); (3) record the **prototype-vs-contract status drift** (agenome 'mutated' / candidate 'culled' / generation domain) as a noted reconciliation (the prototype is a design ref, the contract is authority).

## Things to flag at Step 2.5
1. **Module layout.** My default vote: **adopt the prototype's component categories** under `apps/web/src/components/{core,cards,feedback,observatory}` (+ `src/styles/tokens/`) since the whole P7 UI mirrors the prototype + the adherence linter references those paths; I'll update the `apps/web/CLAUDE.md` layout to match. Flag if you'd rather keep the tracker's `src/ui/` + `components/{lineage,run,evidence}`.
2. **Token adoption — copy vs import-from-docs.** My default vote: **COPY** `tokens/*.css` into `apps/web/src/styles/tokens/` (per SKILL.md "copy assets"; `docs/` is a reference artifact, not an app source root the bundler should reach into) + import once at the app root. Flag if you'd rather `@import` directly from `docs/doppl-design-system/`.
3. **Generation-domain encodings (drift gap).** My default vote: add a `generation` domain mapping for the frozen GenerationStatus 8-state (pending/running/verifying/scoring/reproducing/completed/failed/skipped) using the prototype's visual language (e.g. run-like glyphs: running ●, verifying/scoring/reproducing as phase glyphs, completed ✔, failed △, skipped –). Confirm the generation glyph set (or keep it minimal + reuse run-state glyphs).
4. **Adherence-linter wiring.** My default vote: **follow the adherence RULES now** (no raw hex/px, token-only, font-lock — pinned by RED #5 + a structural component test); **wiring `_adherence.oxlintrc.json` into `apps/web`'s preflight is a separate infra step** (defer to a follow-up / P7.14 polish — it's an oxlint config, not the slice's core). Confirm defer-the-wiring.
5. **StatusBadge scope — full prototype parity vs P7.3 core.** My default vote: port the **full StatusBadgeProps** (incl. `pulse`/`reason`/`size`) but keep motion minimal + `prefers-reduced-motion`-safe; the live pulsing choreography is exercised later (P7.7/P7.4). Confirm the prop parity.

## Dependencies + sequencing
- **Depends on:** the **design-system prototype** (`7c0d34c`, committed), **P7.1** (`contracts.ts` seam for the frozen enums — `38749ac`). Frozen status enums (P0). **First design slice — it was gated on the prototype (now in place).**
- **Blocks:** P7.4 (mode indicator — uses the primitive), and all P7.5+ panels (consume StatusBadge + tokens). Establishes the design foundation for the phase.

## Estimated commit count
**1.** The design foundation (tokens + StatusBadge + status-map) — one coherent unit (larger, like the P7.1 bootstrap, but the foundational design slice). **Not a safety-invariant slice** (read-only UI; rule-#9 no-apps-api-import structural, pinned by RED #9). **Step-8 reviewers:** code-quality = phase-boundary; security-reviewer not needed (no trust boundary — folds no untrusted input; it's a presentational primitive over already-typed statuses).

## Lessons-logged candidates anticipated
- **Convention candidate (apps/web)** — "build the dashboard UI FROM the design-system prototype: COPY its CSS tokens (consume via `var()`, no raw hex/px — adherence) + PORT its components to TS-strict (don't import the `.jsx`); the status-map is **exhaustive over the FROZEN domain enums** (the contract is authority, the prototype is the design ref) — reconcile drift by frozen-wins (omit prototype extras, add frozen-only statuses, unknown→neutral); status is shape+icon+label+color, never color alone, glyph `aria-hidden` + label/title to AT."
- **Architecture-doc note candidate** — none (consumes §12).
- **Future-TODO** — wire `_adherence.oxlintrc.json` into apps/web preflight (P7.14 polish); the live status motion/pulse choreography (P7.4/P7.7).

## How to invoke
> The `demo-web-implementer` session is oriented (P7.1/P7.2 ran in it) — skip `/session-start`; jump to `/tdd`. cwd `apps/web/`. Two-impl staging rule still holds (stage only `apps/web/...`, never `-A`).

1. **Read this brief end-to-end + skim the prototype** (`docs/doppl-design-system/`: `components/core/StatusBadge.*`, `tokens/*.css`, `guidelines/status-*.card.html`, `SKILL.md`). The UI is built FROM the prototype; the FROZEN enums are the authority for which statuses exist.
2. **Run `/tdd accessible_status_primitive`.**
3. **Step 0 (Restate)** — confirm the restatement matches the Feature line.
4. **Step 2.5** — answer the 5 design questions (esp. Q1 layout + Q3 generation encodings + Q4 adherence-wiring), send the write-up + per-acceptance-bullet coverage map.
5. **Step 9** — surface the LESSONS candidate + the prototype-vs-contract drift reconciliation (I record it + update the apps/web/CLAUDE.md layout).
