# /tdd brief — critic_gauntlet_panel

## Feature
The **critic-gauntlet panel** (§12) — renders the adversarial critic council's reviews for a candidate: per `CriticReview` the `mandate` + `scores` + `critique` + `confidence` + `evidenceRefs[]`, across the 5 critic mandates (factual_grounding / novelty_prior_art / feasibility / falsification / subtype_specific). Derives reviews from `critic.reviewed` events (reuses the §6 events-derived pattern). EvidenceRefs render IN-TIER via the P7.10 `evidenceRef` component. Status/confidence accessible (rule #4); reachable from a lineage critic node's `dataRef`.

## Use case + traceability
- **Task ID:** P7.11 (critic-gauntlet panel)
- **Architecture sections:** `ARCHITECTURE.md §12` (critic-gauntlet panel; accessible), `§7` (critic council — 5 mandates; emit-only reviews), `§4` (reviews derive from `critic.reviewed` payloads).
- **Related context:** **Builds on P7.2** (events) + **P7.3** (accessible) + **P7.10** (`evidenceRef.tsx` in-tier resolver — reuse) + frozen `CriticReview`/`CriticMandate` (P0.6). Same §6 events-derived pure-selector pattern. Unit-first.

## Acceptance criteria
- [ ] A pure **`deriveReviewsByCandidate(events)`** collects `CriticReview` per `candidateId` from `critic.reviewed` events (validated via frozen `CriticReview`), ordered by first-seen `sequence`
- [ ] Renders each review's **`mandate` (the 5-member `CriticMandate`) + `scores` (name→number) + `critique` + `confidence` (∈[0,1])**; the gauntlet shows which of the 5 mandates reviewed the candidate (a mandate with no review degrades gracefully — not all 5 need be present)
- [ ] Per-review **`evidenceRefs` render IN-TIER** via the P7.10 `evidenceRef` component (no external href — §9/§4/rule #9)
- [ ] **Emit-only respected (rule #6):** the panel DISPLAYS reviews — it never derives a winner/selection/score-override from them (critics are evidence, not deciders; the panel shows critique + confidence, not a verdict)
- [ ] Confidence/score accessible (not color-alone, rule #4); reachable from a lineage critic node's `dataRef`
- [ ] Adherence-clean (var() tokens, no hex); no apps/api import (rule #6); no secret; partial-data-safe (zero reviews → empty state)
- [ ] Unit tests pass (happy-dom + seeded `critic.reviewed` fixture); count reported; `/preflight` (web) clean

## Wiring / entry point (Step 7.5)
**none — mounted by the P7.14 shell.** Reachable from the P7.7 lineage critic node `dataRef` at integration; exercised now against a seeded `critic.reviewed` event fixture + the injected event list.

## Files expected to touch
**New:**
- `apps/web/src/panels/CriticGauntletPanel.tsx` — the panel (per-mandate review rows)
- `apps/web/src/panels/criticData.ts` — pure `deriveReviewsByCandidate(events)` selector
- `apps/web/test/unit/panels/{criticData,CriticGauntletPanel}.test.{ts,tsx}`

**Modified:**
- `apps/web/src/data/contracts.ts` — add `CriticReview` (+ `CriticMandate`) to the re-export seam (consumed read-only — like P7.8/P7.9; the table-row extension is the orchestrator's Step-9 hot-write)

If implementation needs files beyond this, **flag at Step 2.5**.

## RED test outline
1. **`test_derive_reviews_by_candidate`** — collects `CriticReview` per candidateId from `critic.reviewed`, ordered by sequence (positive guard). Why: §7/§4.
2. **`test_renders_mandate_scores_critique_confidence`** — a review renders mandate + scores + critique + confidence; a missing mandate (of the 5) degrades gracefully. Why: §12/§7.
3. **`test_evidence_refs_in_tier`** — per-review evidenceRefs render via the P7.10 evidenceRef component (in-tier, no external href). Why: §9/§4/rule #9.
4. **`test_emit_only_no_verdict`** — the panel shows critique/confidence but derives NO winner/selection/score-override from the reviews (rule #6 emit-only display). Why: rule #6.
5. **`test_no_apps_api_import`** — structural (rule #6).

## Cross-doc invariant impact
- **Model field changes:** none (consumes frozen `CriticReview`/`CriticMandate` read-only). **§2.5-seam:** none.
- **Orchestrator doc rows (Step 9):** the `data/contracts.ts` "Consumed read-only" row gains `CriticReview`/`CriticMandate` (§7) — my hot-write. Else apps/web §1–§6/§7.

## Things to flag at Step 2.5
1. **Reviews source.** Default: derive from `critic.reviewed` events (§6 pattern), per candidateId — the lean store holds status not review payloads; confirm (vs a candidate projection — none exists).
2. **Mandate completeness.** Default: render the reviews that exist (a candidate may not have all 5 mandates yet); a mandate with no review shows a "pending/not-reviewed" affordance, never a fabricated verdict. Confirm.
3. **Evidence component reuse.** Default: reuse the P7.10 `evidenceRef.tsx` `EvidenceRefLink` for per-review evidenceRefs (no duplication). Confirm.

## Dependencies + sequencing
- **Depends on:** P7.2 (events), P7.3 (accessible), **P7.10** (evidenceRef component — reuse), frozen `CriticReview`/`CriticMandate` (P0.6). Independent of apps/api. Reuses §6.
- **Blocks:** P7.14 (shell mounts it).

## Estimated commit count
**1.** Feature slice (panel + selector). Not safety-invariant (read-only display; the emit-only/no-verdict is a rule-#6 DISPLAY discipline pinned by T4 — the panel never re-derives a decision). Step-8: code-quality phase-boundary; security optional.

## Lessons-logged candidates anticipated
- Likely covered by §6 (events-derived) + §7 (EvidenceRef in-tier, banked at this round's /orchestrate-end). Possible: "the critic-gauntlet DISPLAYS emit-only reviews — never derives a verdict/winner from critiques (rule #6; critics are evidence)." I author hot if it adds.

## How to invoke
> web session oriented — `/tdd`. cwd `apps/web/`. Stage only `apps/web/...`. (Round-3 web slice 6 — after P7.10; reuses §6 + the P7.10 evidenceRef component.)
1. **Run `/tdd critic_gauntlet_panel`.**
2. **Step 2.5** — answer the 3 questions, send the coverage map.
3. **Step 9** — surface the contracts-seam CriticReview extension (I write the row).
