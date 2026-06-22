# /tdd brief — subtype_check_evidence_panel

## Feature
The **subtype-check evidence panel** (§12) — renders the allowlisted subtype-check results for a candidate: per `CheckResult` the `checkType` + `status` (passed/failed/skipped) + `score?` + `output?` + `skipReason?` (shown IFF skipped) + `evidenceRefs[]`. Derives from `check.completed` events (§6 pattern). EvidenceRefs render IN-TIER via the P7.10 `EvidenceRefLink`. **Emit-only DISPLAY** (rule #3/#6): the panel SHOWS check outcomes as evidence — it never derives a pass/fail verdict beyond the persisted `status`; a **skipped** check surfaces its `skipReason` transparently (the allowlist fail-safe worked — an unregistered/execution-requiring check returns skipped+reason, never executes). Reachable from a lineage check node.

## Use case + traceability
- **Task ID:** P7.12 (subtype-check evidence panel)
- **Architecture sections:** `ARCHITECTURE.md §12` (subtype-check evidence panel; accessible), `§7` (allowlisted non-executing check-runners; skipped+reason on unregistered), `§4` (results derive from `check.completed` payloads).
- **Related context:** **Builds on P7.2** (events) + **P7.3** (accessible) + **P7.10** (`EvidenceRefLink` reuse) + frozen `CheckResult`/`CheckStatus` (P0.7). Same §6 events-derived pattern; same emit-only-DISPLAY discipline as P7.11 (the dashboard displays evidence, never re-derives a decision — apps/web §8, banked this round). Unit-first.

## Acceptance criteria
- [ ] A pure **`deriveChecksByCandidate(events)`** collects `CheckResult` per `candidateId` from `check.completed` events (validated via frozen `CheckResult`), ordered by first-seen `sequence`
- [ ] Renders each check's **`checkType` + `status` (passed/failed/skipped, via the shared `check`-domain status primitive — shape+label+icon, rule #4) + `score?` + `output?`**; a **skipped check shows its `skipReason`** (transparency — the allowlist returned skipped+reason, never executed; rule #3)
- [ ] Per-check **`evidenceRefs` render IN-TIER** via the P7.10 `EvidenceRefLink` (no external href — §9/§4/rule #9)
- [ ] **Emit-only DISPLAY (rule #3/#6):** the panel shows the persisted check `status` as-is — it never re-derives a pass/fail/verdict from `output`/`score` (the check-runner + kernel are authoritative; the UI displays). Pinned by a test that the rendered status === the persisted `CheckResult.status` (no client re-judgement)
- [ ] Adherence-clean (var() tokens, no hex); no apps/api import (rule #6); no secret; partial-data-safe (zero checks → empty state)
- [ ] Unit tests pass (happy-dom + seeded `check.completed` fixture); count reported; `/preflight` (web) clean

## Wiring / entry point (Step 7.5)
**none — mounted by the P7.14 shell.** Reachable from the P7.7 lineage check node `dataRef` at integration; exercised now against a seeded `check.completed` fixture (passed + failed + skipped+reason).

## Files expected to touch
**New:**
- `apps/web/src/panels/SubtypeCheckPanel.tsx` — the panel (per-check rows)
- `apps/web/src/panels/checkData.ts` — pure `deriveChecksByCandidate(events)` selector
- `apps/web/test/unit/panels/{checkData,SubtypeCheckPanel}.test.{ts,tsx}`

**Modified:**
- `apps/web/src/data/contracts.ts` — add `CheckResult` (+ `CheckStatus` if the runtime enum is needed) to the seam (consumed read-only; the §7 table row is the orchestrator's Step-9 hot-write)

If implementation needs files beyond this, **flag at Step 2.5**.

## RED test outline
1. **`test_derive_checks_by_candidate`** — collects `CheckResult` per candidateId from `check.completed`, ordered by sequence (positive guard). Why: §7/§4.
2. **`test_renders_status_score_output`** — a check renders checkType + status (via the check-domain primitive) + score/output. Why: §12.
3. **`test_skipped_shows_reason`** — a skipped check surfaces its `skipReason` (allowlist fail-safe transparency, rule #3). Why: §7.
4. **`test_evidence_refs_in_tier`** — per-check evidenceRefs via `EvidenceRefLink` (in-tier, no external href). Why: §9/§4/rule #9.
5. **`test_emit_only_status_verbatim`** — the rendered status === the persisted `CheckResult.status`; the panel derives no pass/fail/verdict from output/score (emit-only DISPLAY). Why: rule #3/#6.
6. **`test_no_apps_api_import`** — structural (rule #6).

## Cross-doc invariant impact
- **Model field changes:** none (consumes frozen `CheckResult`/`CheckStatus` read-only). **§2.5-seam:** none.
- **Orchestrator doc rows (Step 9):** the `data/contracts.ts` "Consumed read-only" row gains `CheckResult` (§7) — my hot-write.

## Things to flag at Step 2.5
1. **Checks source.** Default: derive from `check.completed` events (§6), per candidateId. Confirm (no check projection exists).
2. **Skipped transparency.** Default: a skipped check is rendered DISTINCTLY (check-domain 'skipped' glyph) WITH its `skipReason` — skipped is not a failure, it's the allowlist working; never hidden. Confirm.
3. **Emit-only display.** Default: render `status` verbatim; never re-derive pass/fail from `output`/`score` (the check-runner is authoritative — rule #3 allowlisted non-executing). Confirm.

## Dependencies + sequencing
- **Depends on:** P7.2 (events), P7.3 (accessible — `check` status domain), **P7.10** (EvidenceRefLink reuse), frozen `CheckResult`/`CheckStatus` (P0.7). Independent of apps/api. Reuses §6 + §8 (emit-only display).
- **Blocks:** P7.14 (shell mounts it); P7.13 (final-idea panel references check evidence).

## Estimated commit count
**1.** Feature slice (panel + selector). Not safety-invariant (read-only display; the emit-only-status-verbatim is a rule-#3/#6 DISPLAY discipline pinned by T5). Step-8: code-quality phase-boundary; security optional.

## Lessons-logged candidates anticipated
- Covered by §6 (events-derived) + §7 (EvidenceRef in-tier) + §8 (emit-only DISPLAY — banked this round). Likely nothing new.

## How to invoke
> web session oriented — `/tdd`. cwd `apps/web/`. Stage only `apps/web/...`. (Round-3 web slice 7 — after P7.11; reuses §6 + EvidenceRefLink + the emit-only-display discipline.)
1. **Run `/tdd subtype_check_evidence_panel`.**
2. **Step 2.5** — answer the 3 questions, send the coverage map.
3. **Step 9** — surface the contracts-seam CheckResult extension (I write the row).
