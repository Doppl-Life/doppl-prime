# Session demo-web-004 — sv5 status-map reconcile (degraded + repairing)

- **Date:** 2026-06-22
- **Track / area:** `demo` / `apps/web` (implementer: demo-web-implementer)
- **Phase:** Phase 7 — Frontend dashboard (round 4 — demo→cody sv5 integration reconcile)
- **Predecessor:** `demo-web-003-2026-06-22-p7.6-7.15-dashboard-complete.md`
- **Successor:** _(none yet — round 4 seals + holds for the lead's cody-push gate)_

## Why this session existed

Round 4 is the demo→cody integration: the merge `da6ef82` landed cody-**sv5** contracts in the tree. sv5 grew two frozen domain enums additively — `GenerationStatus` 8→9 (`degraded`, the `running→degraded→verifying` partial-failure edge) and `CandidateStatus` 8→9 (`repairing`, the `created→repairing→under_review` structured-output repair edge). The dashboard status-map is **exhaustive over the frozen domain enums** (LESSONS apps/web §3); these two new values were unmapped → fell through to the neutral `?` indicator and turned the enum-iteration exhaustiveness guard **RED**. This slice (task #16, brief `docs/briefs/demo-029-P7.3-sv5-status-map-reconcile.md`) adds the two display specs — the web half of the sv2→sv5 reconcile. The four sv5 terminal statuses (`run.cancelled`, `generation.skipped`, `agenome.failed`, `candidate.rejected`) were already mapped (verified); they were not part of this slice.

## What was built

**Files modified:**
- `apps/web/src/components/core/status-map.ts` — added two `StatusSpec`s to `STATUS_MAP`, each in frozen-enum order:
  - `generation.degraded` → `{ glyph:'◓', label:'degraded', colorToken:'var(--warning)' }` (non-pulse), inserted after `running`.
  - `candidate.repairing` → `{ glyph:'↻', label:'repairing', colorToken:'var(--status-review)', pulse:true }`, inserted after `created`.
- `apps/web/test/unit/components/status-map.test.ts` — +3 explicit named tests (`test_generation_degraded_mapped`, `test_candidate_repairing_mapped`, `test_new_specs_color_tokens_are_var_refs`); extended `test_drift_reconciliation` to iterate **both** sv5-grown enums (`GenerationStatus` + `CandidateStatus`), where it previously iterated only `GenerationStatus`.

No files created. No contract / `apps/api` / `ARCHITECTURE.md` / orchestrator-territory file touched.

**Commit:** `87e90d3` — `feat(web): sv5 status-map reconcile — generation.degraded + candidate.repairing (P7.3)`.

## Decisions made

- **`degraded` glyph `◓` over `⚠`.** The brief offered `◓`/`⚠`-class. Chose `◓` (text-presentation, bottom-half moon) because `⚠` (U+26A0) is emoji-presentation-capable — it would render as a colored glyph, overriding the `colorToken` and breaking the monochrome line-glyph aesthetic where color is the redundant 4th channel. `◓` is shape-distinct from `△ failed`. (Orchestrator: "exactly right — and the right reason.")
- **`degraded` token `var(--warning)` over `var(--health-degraded)`** (both `#b5780c` amber). Kept generation-domain token hygiene — `--health-*` is the run-health domain's triad (HealthIndicator); the generation domain already uses semantic/`--status-*`/`--check-*` families (`--warning` is used by `run.stopping`/`stopped`). Non-pulse + amber separates `degraded` from the teal/blue **pulsing** healthy in-flight phases AND from red `failed`.
- **`repairing` = in-flight self-heal family.** `glyph '↻'` (U+21BB, text-presentation, reads "retry/repair in progress", shape-distinct from `◐ under_review`) + `var(--status-review)` (teal in-flight tone, matches `under_review`) + `pulse:true`. Rationale: a structured-output repair (≤1 retry) is **not a failure** (safety rule #8 — a repaired attempt does not debit energy / is not a `provider_call_failed`); it is a routine active self-heal, so it reads as an in-flight phase, not a warning.
- **Test shape = both** (brief flag #3): keep the data-driven enum-iteration exhaustiveness guard (auto-RED's at the next frozen-enum growth) AND add explicit named per-value tests for bisectability.

## Decisions explicitly NOT made (deferred)

- **No StatusBadge happy-dom render test for the two new specs.** The existing `StatusBadge.test.tsx` spot-checks specific statuses + scans `core/` source for raw hex/px; the new specs are covered by the status-map exhaustiveness + no-color-alone + no-raw-hex tests. A per-spec render test was judged redundant; deferred (not needed).
- **No member-set `.snap` re-record on the web side.** None exist — there are zero `.snap` files in `apps/web/test`. The "member-set guard" is the live enum-iteration test, which is data-driven and absorbs frozen-enum growth by reading `GenerationStatus.enum`/`CandidateStatus.enum` directly. (The member-set snapshots the round framing referenced live in `apps/api`/contracts, the backend slice's territory — task #15.)

## TDD compliance

**Clean.** Tests-first throughout: confirmed the existing exhaustiveness/drift guards were RED on `candidate/repairing` + `generation/degraded`; added the 3 named tests + extended the drift test and re-ran to confirm 5 RED; then implemented the two specs → 8/8 GREEN. No safety-invariant code in this slice (display-layer mapping, read-only).

## Reachability

- `generation.degraded` / `candidate.repairing` are reachable via the already-wired path: `STATUS_MAP` → `resolveStatus(domain, status)` (`status-map.ts`) → consumed by `StatusBadge` (`StatusBadge.tsx:44`) → rendered by `CandidateInspector`, `FinalIdeaPanel`, `SubtypeCheckPanel`, `StopControl` (`run/runControl.ts`), and `lineage/nodeTypes.tsx`. The new specs resolve the moment a `degraded`/`repairing` status arrives in a projection payload. **No new wiring** — the brief's Step-7.5 claim holds; no route/component change. No tested-but-unwired gaps.

## Open follow-ups

- **Step-9 categorized list:** all four categories **none** this slice — no safety/critical question, no findings, no deferments (nothing cut), no cross-doc invariant change. Orchestrator confirmed "cross-doc NONE" at SHIP; no hot doc-routing for this slice.
- **Cross-doc invariant audit (multi-track memory check):** no model field added/removed/renamed — consumes frozen `GenerationStatus`/`CandidateStatus` read-only through the existing `data/contracts.ts` seam; the `apps/web/CLAUDE.md` consumed-contracts row is unchanged. Nothing to flag.
- **Lessons-logged candidate** (for the orchestrator to consider; not written here — apps/web territory rule): the brief anticipated a convention note — "an enum-iteration exhaustiveness test over a FROZEN contract enum auto-RED's at the next sv-bump that adds a member; the display status-map absorbs additive enum growth by adding a spec, no contract change — the test IS the member-set guard." May already be covered by apps/web LESSONS §3; flag for the orch to extend §3 or skip.

## How to use what was built

Nothing operational to run. When the kernel emits a generation with `status:'degraded'` or a candidate with `status:'repairing'`, the dashboard now renders the proper accessible badge (shape + label + icon + color) instead of the neutral `?`. To extend the map for a future frozen-enum growth: add the `StatusSpec` to the matching domain in `STATUS_MAP`; the enum-iteration test will tell you (RED) the moment a frozen value is unmapped.
