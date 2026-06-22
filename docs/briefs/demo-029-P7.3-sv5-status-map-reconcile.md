# /tdd brief — sv5_status_map_reconcile

## Feature
Reconcile the dashboard's accessible **status-map** (the single source of truth mapping every FROZEN domain status to its `{glyph, label, colorToken}` encoding) to the integrated **sv5** contract enums. The status-map is **EXHAUSTIVE over the frozen domain enums** (LESSONS apps/web §3) — sv4 added two values it does not yet cover: **`GenerationStatus:'degraded'`** and **`CandidateStatus:'repairing'`**, both currently falling through to the neutral `?` indicator (and failing the exhaustiveness test). Add the two specs. The four new sv5 terminal **statuses** (`run.cancelled`, `generation.skipped`, `agenome.failed`, `candidate.rejected`) are **already mapped** (verified) — the sv5 reconcile on the web side is exactly these two additions.

## Use case + traceability
- **Task ID:** P7.3 (accessible status primitive — shape + label + icon + colorblind-safe color), sv5-reconcile extension.
- **Architecture sections it implements:** `ARCHITECTURE.md §12` (frontend dashboard — status is shape + label + icon, never color alone; projector-legible acceptance surface). Consumes the frozen `§3` `GenerationStatus`/`CandidateStatus` enums (sv5) read-only.
- **Related context:** the merge `da6ef82` landed cody-sv5 (`@doppl/contracts` now exports the 9-member `GenerationStatus` incl. `degraded` and the 9-member `CandidateStatus` incl. `repairing`). LESSONS apps/web §3 (the status-map is exhaustive over the FROZEN enums; the contract is authority, the design-system prototype is reference; drift reconciled frozen-wins; unknown→neutral). The exhaustiveness test (`test_drift_reconciliation`, iterating `GenerationStatus.enum` / `CandidateStatus.enum`) is **currently RED** on these two values — this slice makes it green.

## Acceptance criteria (what "done" means)
- [ ] `STATUS_MAP.generation['degraded']` is a defined `StatusSpec` — `glyph` + `label:'degraded'` + a `var(--…)` `colorToken` (no raw hex); encodes a partial-failure/recovering phase (the `running→degraded→verifying` §3 edge) distinct from `failed`.
- [ ] `STATUS_MAP.candidate['repairing']` is a defined `StatusSpec` — `glyph` + `label:'repairing'` + a `var(--…)` `colorToken`; encodes the in-flight structured-output repair (`created→repairing→under_review`) — an active/pulsing phase distinct from `under_review`.
- [ ] The exhaustiveness test passes for **all** `GenerationStatus.enum` and `CandidateStatus.enum` values (no frozen status falls to neutral `?`).
- [ ] Both new specs honor the encoding rules: **shape + label + icon, never color alone** (rule #4 / §12); `colorToken` matches `^var\(--[a-z0-9-]+\)$` (the no-raw-hex adherence test); glyph stays `aria-hidden`, status carried in label/`title`.
- [ ] No frozen contract touched; no `apps/api` import; the map's `resolveStatus` unknown→neutral fallback still holds for genuinely-unmapped strings.
- [ ] Unit tests pass (`apps/web/test/unit/components/status-map.test.ts` + `StatusBadge` if its snapshot enumerates the map); `/preflight` clean.

## Wiring / entry point (Step 7.5)
**No new wiring — the two specs extend the already-wired `STATUS_MAP`.** `STATUS_MAP`/`resolveStatus` are consumed by `StatusBadge` (`apps/web/src/components/core/StatusBadge.tsx`), which renders across the dashboard panels (lineage nodes, candidate inspector, run controls). The new specs are reachable through the existing `resolveStatus(domain, status)` call the moment a `degraded`/`repairing` status arrives in a projection payload — no route/component change.

## Files expected to touch
**Modified:**
- `apps/web/src/components/core/status-map.ts` — add `generation.degraded` + `candidate.repairing` to `STATUS_MAP`.
- `apps/web/test/unit/components/status-map.test.ts` — the exhaustiveness assertions already cover this (they iterate the enums); add explicit `degraded`/`repairing` presence + encoding assertions if not already implied.

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)
In `apps/web/test/unit/components/status-map.test.ts`:
1. **`test_generation_degraded_mapped`** — Asserts: `STATUS_MAP.generation['degraded']` is defined with a non-empty glyph + label + a `var(--…)` colorToken. Why: §12 exhaustive-over-frozen-enum (LESSONS §3); the `running→degraded` §3 edge.
2. **`test_candidate_repairing_mapped`** — Asserts: `STATUS_MAP.candidate['repairing']` is defined likewise. Why: §12 / §3 `created→repairing` repair edge.
3. **`test_drift_reconciliation` (extend existing)** — Asserts: the enum-iteration over `GenerationStatus.enum` AND `CandidateStatus.enum` finds every value mapped (the currently-RED assertion). Why: §12 exhaustiveness, frozen-wins.
4. **`test_new_specs_color_tokens_are_var_refs`** — Asserts: the two new `colorToken`s match `^var\(--…\)$`, no raw hex. Why: rule #4 / §12 design-token adherence (shape+label+icon, never color-only).

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** none. CONSUMES the frozen `GenerationStatus`/`CandidateStatus` enums read-only (already sv5 in tree).
- **Orchestrator doc rows to write hot (Step 9 routing):** none. The `apps/web/CLAUDE.md` cross-doc row for the consumed contracts is unchanged (the enums are read through the existing seam).
- **§2.5-seam model touched?** No — display-layer mapping only; defines no Appendix-A shape.

## Things to flag at Step 2.5
1. **`degraded` encoding.** My default vote: a **warning-toned, non-pulsing** spec (a degraded generation is a partial-failure state, not actively healthy) — e.g. glyph `◓`/`⚠`-class, `colorToken: var(--warning)` — visually distinct from `failed` (`△`/danger) and from healthy `running`. Implementer picks the exact glyph from the design vocabulary; the test pins presence + token-form, not the specific glyph.
2. **`repairing` encoding.** My default vote: an **active/pulsing** spec (`pulse:true`) toned like the other in-flight phases (`under_review`/`scoring`), distinct enough to read as "self-healing in progress" — e.g. `colorToken: var(--status-review)` or a repair-specific token if one exists in the design system.
3. **Test shape — extend the existing exhaustiveness test or add explicit per-value tests?** My default vote: **both** — keep the enum-iteration exhaustiveness guard (catches the next frozen-enum growth automatically) AND add the two explicit named tests for clarity/bisectability.

## Dependencies + sequencing
- **Depends on:** the merge `da6ef82` (sv5 enums in tree — landed).
- **Blocks:** the demo→cody integration preflight (web side green).
- **Parallel with:** demo-028 (backend sv5 projection reconcile) — independent code area, no shared file.

## Estimated commit count
**1.** Two small display-spec additions to one module, no safety invariant, one logical unit (one `feat(web): sv5 status-map reconcile` commit). Trivially bisectable.

## Lessons-logged candidates anticipated
- **Convention candidate** — "An enum-iteration exhaustiveness test over a FROZEN contract enum auto-RED's at the next sv-bump that adds a member — the status-map (display) absorbs additive enum growth by adding a spec, no contract change; the test is the member-set guard." (May already be covered by apps/web §3 — flag if it extends it.)
