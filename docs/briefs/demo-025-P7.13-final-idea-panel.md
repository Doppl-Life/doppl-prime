# /tdd brief — final_surviving_idea_proof_panel

## Feature
The **final surviving-idea proof panel** (§12) — the capstone. Identifies the **selected winner** (the `candidate` node with `status:'selected'` in the `LineageGraphProjection`) and renders it as a **defensible proof**: the candidate's idea (title/summary/claims) PLUS in-tier links to its **lineage node, critic reviews, subtype-checks, fitness score-components, energy, and traces** — aggregating the evidence the prior panels (P7.7–P7.12) expose, so the final idea is **defensible via critic + check evidence** (project-level acceptance criterion). All links resolve IN-TIER (no external href). This is a first-class acceptance surface shown to a room.

## Use case + traceability
- **Task ID:** P7.13 (final surviving-idea proof panel)
- **Architecture sections:** `ARCHITECTURE.md §12` (final-idea proof panel — links to lineage/critics/checks/score/energy/traces; accessible), `§9`/`§4` (EvidenceRef + trace links resolve in-tier), `§8` (fitness score-components).
- **Related context:** the **aggregation capstone** — reuses the winner from `getLineage` (P7.7: selected-winner = candidate+`status:'selected'`, LESSONS apps/web §5) + `getCandidate` (P7.10) + the event-derived selectors (P7.11 reviews, P7.12 checks, P7.8 fitness, P7.9 energy) for the winner's candidateId/agenomeId. Same §6 + §8 emit-only-DISPLAY discipline (the panel SHOWS the proof; the selection was the kernel/judge's, never re-derived by the UI). Reuses the P7.10 `EvidenceRefLink`. Unit-first.

## Acceptance criteria
- [ ] **Winner identification:** the panel finds the selected winner = the `LineageGraphProjection` node with `type:'candidate'` + `status:'selected'` (from `getLineage`); if no winner yet (run in progress), a graceful "no final idea yet" affordance — never a fabricated winner
- [ ] Renders the **winner candidate's idea** (title, summary, claims) via `getCandidate(runId, winnerCandidateId)`
- [ ] **Proof links (in-tier):** links/sections to the winner's **lineage node** (dataRef), **critic reviews** (P7.11 selector for the candidateId), **subtype-checks** (P7.12 selector), **fitness score-components** (the winner's `FitnessScore.components`, §8), **energy** (the winner's agenome energy, P7.9), and **traces** (`langfuseTraceId`/`langfuseObservationId` rendered as in-tier references — NEVER an external href, §9/§4/rule #9)
- [ ] **Emit-only / never re-derive the decision (rule #6):** the panel DISPLAYS the winner the kernel/judge selected (the lineage `status:'selected'`) — it never re-ranks candidates or derives its own winner from scores/critiques. Pinned by a test that the displayed winner === the lineage's selected node (no client re-selection)
- [ ] **Defensibility:** the panel surfaces the critic + check evidence for the winner so the idea is defensible (the reviews + checks are reachable from the proof) — REQ-level acceptance
- [ ] Adherence-clean (var() tokens, no hex); no apps/api import (rule #6); no secret; accessible (rule #4)
- [ ] Unit tests pass (happy-dom + injected runClient + seeded lineage/events fixtures); count reported; `/preflight` (web) clean

## Wiring / entry point (Step 7.5)
**none — mounted by the P7.14 shell.** Fed by `getLineage` + `getCandidate` + the event list at integration. Exercised now against a seeded LineageGraphProjection (with a selected-winner node) + candidate/critic/check/score/energy fixtures.

## Files expected to touch
**New:**
- `apps/web/src/panels/FinalIdeaPanel.tsx` — the proof panel (winner + idea + proof links/sections)
- `apps/web/src/panels/finalIdeaData.ts` — pure `selectWinner(lineage)` + `gatherProof(lineage, candidate, events)` (aggregates the reused selectors for the winner)
- `apps/web/test/unit/panels/{finalIdeaData,FinalIdeaPanel}.test.{ts,tsx}`

**Modified:** none expected (reuses the already-seamed contracts + the P7.8–P7.12 selectors + P7.10 EvidenceRefLink). If a trace-ref render helper is shared, flag at 2.5.

If implementation needs files beyond this, **flag at Step 2.5**.

## RED test outline
1. **`test_select_winner_from_lineage`** — `selectWinner(lineage)` returns the node with type:candidate + status:'selected'; no such node → null (graceful). Why: §12 / LESSONS §5.
2. **`test_renders_idea_and_proof_links`** — renders the winner's title/summary/claims + sections linking lineage/critics/checks/score-components/energy. Why: §12 defensibility.
3. **`test_traces_in_tier`** — langfuseTraceId/observationId + evidenceRefs render as in-tier references (EvidenceRefLink / data-* attrs), NEVER an external href. Why: §9/§4/rule #9.
4. **`test_emit_only_no_re_selection`** — the displayed winner === the lineage's selected node; the panel never re-ranks/derives its own winner from scores/critiques. Why: rule #6.
5. **`test_no_winner_graceful`** — no selected node (run in progress) → "no final idea yet" affordance, no fabricated winner. Why: §12 partial-data.
6. **`test_no_apps_api_import`** — structural (rule #6).

## Cross-doc invariant impact
- **Model field changes:** none (reuses already-seamed contracts read-only). **§2.5-seam:** none.
- **Orchestrator doc rows (Step 9):** likely none (all models already in the seam from P7.8–P7.12). Possible §8 emit-only note covers it.

## Things to flag at Step 2.5
1. **Winner source.** Default: the `LineageGraphProjection` selected-winner node (`type:candidate`+`status:'selected'`) from `getLineage` — the backend (P6.3) already determines the winner; the lean ViewState doesn't carry a derived 'selected' status. Confirm (vs deriving from events — no clean candidate.selected event exists).
2. **Proof aggregation.** Default: a pure `gatherProof` reuses the P7.11/P7.12/P7.8/P7.9 selectors for the winner's candidateId/agenomeId (no duplication) + links the lineage node + traces; render sections, not embedded full panels (the shell composes the full panels). Confirm the link-vs-embed boundary.
3. **Traces render.** Default: langfuseTraceId/observationId render as in-tier reference text/data-* (the trace is an authoritative observation id, resolved in-tier), NEVER an external Langfuse URL (rule #9 — no secret/external link in the client). Confirm.

## Dependencies + sequencing
- **Depends on:** P7.7 (lineage/winner), P7.10 (getCandidate + EvidenceRefLink), P7.11 (reviews selector), P7.12 (checks selector), P7.8 (fitness components), P7.9 (energy) — all landed. Reuses §6/§8. Independent of apps/api.
- **Blocks:** P7.14 (shell mounts it), P7.15 (Playwright traverses start → live → final-idea links resolve — the smoke's terminal assertion).

## Estimated commit count
**1.** Feature slice (the proof panel + winner/aggregation selectors). Not safety-invariant (read-only display; the never-re-derive-the-winner is a rule-#6 DISPLAY discipline pinned by T4). Step-8: code-quality phase-boundary; security optional (traces-in-tier / no external href is the rule-#9 display pin, T3).

## Lessons-logged candidates anticipated
- Covered by §5 (winner = candidate+selected) + §6/§8 (events-derived emit-only) + §7 (EvidenceRef in-tier). Likely nothing new — possible "traces render in-tier (langfuse ids), never an external URL (rule #9)" folds into §7. I author hot if it adds.

## How to invoke
> web session oriented — `/tdd`. cwd `apps/web/`. Stage only `apps/web/...`. (Round-3 web slice 8 — the capstone proof panel; reuses §5/§6/§7/§8 + the P7.8–P7.12 selectors.)
1. **Run `/tdd final_surviving_idea_proof_panel`.**
2. **Step 2.5** — answer the 3 questions (esp. Q1 winner-source, Q3 traces-in-tier), send the coverage map.
3. **Step 9** — surface anything beyond apps/web §1–§8.
