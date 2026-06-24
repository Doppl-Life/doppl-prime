# /tdd brief — final_idea_proof_panel_wiring

## Feature
PD.7 — close the two remaining acceptance gaps on the **already-built + already-mounted** `FinalIdeaPanel` (the §12 room-facing proof surface): (1) **distinguish the transfer evidence rung** — label the winner's check / prior-art evidence as **live allowlisted (non-executing)** vs **replay-backed**, and render the winner's `evidenceRefs` via the shared `EvidenceRefLink` (the one LESSON-7 reuse not yet realized); (2) **terminal / zero-survivors correctness** — when the run is terminal with NO selected winner, reflect the run's failed/terminal state instead of the in-progress "appears once selected" affordance (never fabricate an idea). Read-only over projections + events; preserves emit-only (rule #6) + read-only (rule #2); ZERO new contract surface. The panel render, its live-wiring in the shell, the lineage deep-link, and the §16 happy-path e2e all already exist (P7.13 + P7.14) — this is a tight gap-closure, not a rebuild.

## Use case + traceability
- **Task ID:** PD.7
- **Architecture sections it implements:** `ARCHITECTURE.md §12` (frontend dashboard — final-surviving-idea proof panel, colorblind-safe acceptance surface), `ARCHITECTURE.md §9` (evidence refs render IN-TIER — never an external href), `ARCHITECTURE.md §17` (the demo "your problem → final surviving idea" acceptance surface). Web hat (the api impl wears it — read `apps/web/CLAUDE.md`; test via `pnpm -C apps/web`).
- **Related context — what ALREADY EXISTS (satisfied-by-P7; VERIFY green, do NOT rebuild):**
  - `apps/web/src/panels/FinalIdeaPanel.tsx` — renders the kernel/judge `status:'selected'` winner (via `selectWinner`) + proof sections: lineage (a real `<button>` → `onSelectLineageNode`), fitness components, energy, critic reviews, subtype checks, in-tier traces. Graceful no-winner + load-error states. EMIT-ONLY (never re-ranks — LESSON 8).
  - `apps/web/src/panels/finalIdeaData.ts` — pure `selectWinner` + `gatherProof` (reuses the P7.9/P7.11/P7.12 selectors + `winnerFitness`/`winnerTraces`). `deriveEnergyByAgenome` sums `energy.spent.actual` ONLY → energy DISPLAYED is success-only (rule #8; LESSON 6).
  - `apps/web/src/panels/evidenceRef.tsx` — the shared `EvidenceRefLink` (in-tier `data-*`, no `<a href>`; LESSON 7). Already reused by CandidateInspector / SubtypeCheckPanel / CriticGauntletPanel — **NOT yet by FinalIdeaPanel** (this brief realizes that reuse).
  - `apps/web/src/routes/Dashboard.tsx` — **already MOUNTS** `<FinalIdeaPanel runId lineage events runClient onSelectLineageNode={setSelectedCandidateId} />` (live-wired: `getLineage` + the SSE/getEvents FoldState + `getCandidate`). The lineage button drives `activeCandidateId` → CandidateInspector / CriticGauntlet / SubtypeCheck. The shell already computes `runStatus = selectRunStatus(state, observedRunId)` (`RunEventType | undefined`) + has `store.getMode()` (`'live'|'replay'`, LESSON 2 — carried, never folded).
  - `apps/web/test/e2e/dashboard-smoke.spec.ts` — the §16 happy-path: "start → live events fold → **final-idea links resolve**" (asserts the winner heading + the critic-reviews/subtype-checks/fitness/energy sections render). Already seeds a `prior_art` evidenceRef fixture. → PD.7 acceptance #1/#6 are this e2e; keep it green, extend for the two new behaviors.
  - `apps/web/test/unit/panels/FinalIdeaPanel.test.tsx` — covers renders-idea+proof, traces-in-tier (no href), no-winner-graceful (getCandidate NOT called), load-failure, no-apps/api-import, no-raw-hex. → extend, don't replace.
- **Out of scope (stays a carry-forward, NOT PD.7):** the `LineageGraph` interactive node-click `onSelect` (carry-forward (b) — the graph node-click→inspector is unwired; the shell defaults to the winner, the e2e traverses the winner-default). PD.7's "resolvable links" are the FINAL-IDEA panel's links (already wired); the lineage-graph interactivity is a separate P7.7 polish item.

## Acceptance criteria (what "done" means)

**NEW behavior (the PD.7 delta — the only code to write):**
- [ ] **Transfer-evidence rung labeled** — the proof panel labels the winner's check / prior-art evidence as **"live allowlisted (non-executing)"** vs **"replay-backed"**, derived from the run mode (`'live'|'replay'`) threaded from the shell (zero new contract surface — NOT a new event/field). The label is colorblind-safe (shape/icon/text, not color alone — rule #4 / §12).
- [ ] **Winner `evidenceRefs` rendered via the shared `EvidenceRefLink`** (the prior-art / transfer evidence) — realizing the LESSON-7 "reused by … final-idea" reuse; renders in-tier (`data-*`, no `<a href>`); empty `evidenceRefs` → a graceful "—" (no crash).
- [ ] **Terminal / zero-survivors correctness** — when `winner === null` AND the run is terminal (`runStatus ∈ {run.completed, run.failed, run.stopped}` via the threaded run status / `isRunTerminal`), the panel reflects the terminal state ("no surviving idea — run {completed/failed/stopped}"), NOT the in-progress "appears once a candidate is selected" copy. When `winner === null` and the run is NOT terminal → the existing in-progress affordance is UNCHANGED. Never fabricates a winner in either case.
- [ ] The new props are **OPTIONAL** (default `undefined` → today's behavior) so existing FinalIdeaPanel tests stay green without change; the shell threads the real values.

**Preserved invariants (pin with a test; must not regress):**
- [ ] **Emit-only (rule #6):** the panel still DISPLAYS the kernel/judge `status:'selected'` winner — the new evidence-rung label/refs add NO re-ranking, no re-derived verdict (the live/replay label is a presentation of the run mode, not a re-judgement).
- [ ] **All displayed evidence derived from persisted events/projections** (rule #2/#7) — no model call, no re-embed, no re-score added; `getCandidate` stays the only fetch (and still NOT called when there's no winner).
- [ ] **Energy shown = successful productive spend only** (rule #8) — a `provider_call_failed` event contributes NOTHING to the displayed energy (only `energy.spent` does).

**Satisfied-by-P7 (VERIFY green — cite, do NOT rebuild):**
- [ ] Final-idea renders the winner + resolvable links (lineage button resolves to the candidate evidence panels) — existing unit + the dashboard-smoke e2e.
- [ ] Every evidence deep-link resolves end-to-end (the §16 Playwright happy-path) — `dashboard-smoke.spec.ts` stays green (extended for the terminal-zero-survivors + label cases where browsers install; doc-as-CI otherwise — LESSON 10).
- [ ] Forbidden-pattern clean: no `apps/api/**` import; no raw hex; no `<a href>`/external URL on evidence; no color-only status.
- [ ] `/preflight` clean (web: typecheck + lint + Vitest + e2e smoke).

## Wiring / entry point (Step 7.5)
`apps/web/src/routes/Dashboard.tsx` ALREADY mounts `<FinalIdeaPanel>` for `observedRunId` in the live-run view. PD.7 threads two new OPTIONAL props from the shell into that existing mount: the run **mode** (`store.getMode()`) for the evidence-rung label, and the run **terminal status** (`selectRunStatus(state, observedRunId)`, classified via `isRunTerminal`) for the zero-survivors branch. No new mount, no new route — the panel is already reachable and the e2e already drives it. Confirm at Step 7.5 that both props are passed at the call site (not just accepted by the component).

## Files expected to touch
**New:** none (the panel + the shared EvidenceRefLink already exist).

**Modified:**
- `apps/web/src/panels/FinalIdeaPanel.tsx` — add two OPTIONAL props (`mode?: RunMode`; `runStatus?: RunEventType` — or a derived `runTerminal?: boolean`, Step-2.5 Q3); render the evidence-rung label + the winner `evidenceRefs` via `EvidenceRefLink`; branch the no-winner state on terminal-vs-in-progress.
- `apps/web/src/routes/Dashboard.tsx` — pass `mode={store.getMode()}` + the run-terminal status into the existing `<FinalIdeaPanel>` mount.
- `apps/web/test/unit/panels/FinalIdeaPanel.test.tsx` — extend (the new RED tests below).
- `apps/web/test/e2e/dashboard-smoke.spec.ts` — extend the happy-path with the label assertion (+ optionally a terminal-zero-survivors case); doc-as-CI if browsers absent.
- *(maybe)* `apps/web/src/panels/finalIdeaData.ts` — only if a small pure helper for the evidence-rung label/source is cleaner than inlining (Step-2.5 Q2).

If implementation needs files beyond this list (e.g. a CheckResult field genuinely carries a live/replay discriminator), **flag at Step 2.5** before GREEN.

## RED test outline (Step 2)
Vitest unit — `apps/web/test/unit/panels/FinalIdeaPanel.test.tsx` (extend; testing-library + fixtures — deterministic-in-CI per LESSON 10):

1. **`test_evidence_rung_labeled_live`** — winner + a passed check, `mode="live"` → the evidence rung renders the "live allowlisted (non-executing)" label (text/shape, not color-only). Why: §17 / acceptance #2; rule #4.
2. **`test_evidence_rung_labeled_replay`** — same fixture, `mode="replay"` → the rung renders "replay-backed". Why: §17 — the labeled state is unambiguous on the projector.
3. **`test_winner_evidence_refs_render_in_tier`** — winner whose `CandidateIdea.evidenceRefs` includes a `prior_art` ref → it renders via `EvidenceRefLink` (the kind/label/`data-*` present) with NO `<a>`/`[href]`. Why: §9 / LESSON 7 (in-tier, the final-idea reuse).
4. **`test_no_evidence_refs_graceful`** — winner with empty `evidenceRefs` → a graceful "—", no crash. Why: partial-data robustness.
5. **`test_terminal_zero_survivors_reflects_failed`** — no selected winner + `runStatus="run.failed"` → renders a TERMINAL "no surviving idea — run failed" affordance, NOT the in-progress copy; `getCandidate` NOT called. Why: §12 acceptance #3 — reflect terminal state, never fabricate.
6. **`test_no_winner_in_progress_unchanged`** — no winner + `runStatus=undefined` (run live/in-progress) → the EXISTING in-progress affordance ("appears once a candidate is selected"). Why: backward-compat — the terminal branch must not swallow the in-progress case.
7. **`test_energy_excludes_failed_calls`** — events include `provider_call_failed` + `energy.spent` → displayed energy reflects ONLY the `energy.spent.actual` (failed call contributes nothing). Why: rule #8 success-only DISPLAYED.

> Existing tests (renders-idea+proof, traces-in-tier, no-winner-graceful, load-failure, no-apps/api-import, no-raw-hex) MUST stay green unchanged — the new props are optional. The visual layout is e2e/design-review, not unit.

Playwright e2e — `dashboard-smoke.spec.ts` (extend; doc-as-CI if browsers absent):
8. **`final_idea_evidence_rung_label`** — the happy path additionally asserts the final-idea evidence rung shows the live/replay label for the run. Why: §16/§17 end-to-end.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** **none.** ZERO new contract surface — the live/replay label derives from the existing run `mode`; the terminal branch reads the existing `RunEventType` run status; `evidenceRefs` is an existing `CandidateIdea` field; `EvidenceRefLink` exists. No `@doppl/contracts` / Appendix-A change, no new event type, no new route.
- **Orchestrator doc rows to write hot (Step 9 routing):** likely an **Architecture-doc note** (§12/§17): the final-idea proof panel labels the transfer-evidence rung live-vs-replay (mode-derived) + reflects terminal zero-survivors; realizes the LESSON-7 `EvidenceRefLink` reuse in the final-idea surface. **No cross-doc invariant row** (no model field changed).
- **§2.5-seam (shared-contract) model touched?** No.

## Things to flag at Step 2.5
1. **Where does the live-vs-replay label come from?** Options: (a) derive from the run **mode** (`'live'|'replay'`, threaded from `store.getMode()`); (b) a per-`CheckResult` field on the frozen contract. My default vote: **(a) mode-derived** — it's zero-new-contract-surface and matches the run-wide live/replay framing (a replay run's evidence IS replay-backed; a live run's allowlisted check IS the live non-executing check). **Confirm the frozen `CheckResult` shape at Step 2.5** — if it already carries a live/replay discriminator, prefer reading that verbatim (still zero-surface); otherwise mode-derived. Do NOT add a contract field (forbidden — rule, PD's zero-new-surface).
2. **Render the winner `evidenceRefs` in the proof panel, given CandidateInspector already shows them?** My default vote: **yes, render them in the proof panel** via `EvidenceRefLink` — the §12 final-idea panel is the room-facing self-contained acceptance surface (the "transfer evidence rung"), and it realizes the LESSON-7 promised reuse; the inspector duplication is acceptable (different framing). Keep it a compact link-not-embed section.
3. **Terminal signal shape: pass `runStatus?: RunEventType` and classify inside, or pass a derived `runTerminal?: boolean` + a terminal label?** My default vote: **pass `runStatus?: RunEventType`** and classify with the existing `isRunTerminal` inside the panel (single source of terminal truth — LESSON 4; lets the copy name which terminal). Keep the prop optional (default `undefined` = in-progress) so existing tests don't change.
4. **Confirm the `LineageGraph` `onSelect` interactivity stays OUT of PD.7?** My default vote: **out** — it's carry-forward (b) (a P7.7 polish item, NOT blocking; the e2e traverses the winner-default). PD.7's "resolvable links" = the final-idea panel's links, already wired.

## Dependencies + sequencing
- **Depends on:** PD.6 (the mounted live-wired shell — landed `b61afa5`); the P7.13 FinalIdeaPanel + P7.14 shell + the shared `EvidenceRefLink` (all landed); `store.getMode()` + `selectRunStatus`/`isRunTerminal` (P7.2/P7.5 — landed).
- **Blocks:** PD.8 (the §16 rehearsal scripts — the evidence-walkthrough rehearsal confirms the proof-panel deep-links resolve; PD.8's `DEMO_RUNBOOK.md` references the final-idea acceptance surface).

## Estimated commit count
**1.** A single bundled display gap-closure (evidence-rung label + EvidenceRefLink reuse + terminal-zero-survivors state) — same component, same test file, shared context, NO safety invariant touched (the slice PRESERVES emit-only/read-only/energy-success-only, verified by reused selectors — it does not change them). Bisectable as one logical unit. Not bundled with any other slice.

## Lessons-logged candidates anticipated
- **Convention candidate** — "the final-idea proof panel labels the transfer-evidence rung from the run MODE (live = live allowlisted non-executing; replay = replay-backed), never from a new event field — zero-surface presentation, not a re-judgement (rule #6)."
- **Architecture-doc note candidate** — §12/§17: the §12 final-idea panel reflects terminal zero-survivors (no fabricated idea) + labels the evidence rung live/replay; realizes the LESSON-7 `EvidenceRefLink` reuse on the final-idea surface.
- **Future TODO — operational** — the `LineageGraph` interactive `onSelect` (carry-forward (b)) remains the last final-idea/lineage interactivity polish; lands with the live producer / a P7.7 follow-up if pursued.

## How to invoke
1. Read this brief end-to-end — especially "Things to flag at Step 2.5" (the label source is the load-bearing design decision).
2. Run `/tdd final_idea_proof_panel_wiring` in the implementer session (`apps/web/` hat — test via `pnpm -C apps/web`).
3. Step 0 (Restate) — confirm the gap-closure framing (the panel/mount/e2e EXIST; this closes #2 evidence-rung labeling + #3 terminal state).
4. Step 2.5 — ping back with answers to the 4 design questions (or take defaults).
5. Step 9 — surface anything beyond the anticipated lessons-logged candidates.
