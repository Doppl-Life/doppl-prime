# phase-d-006 — Orchestrator routing ledger (Phase-D round 3)

**Date:** 2026-06-23 · **Role:** phase-d-api-orchestrator · **Track:** phase-d (demo) · **Worktree:** `Capstone-phased` (branch `phase-d`)
**Predecessor:** `phase-d-004` (round-2 ledger) · **Round sealed via:** the LEAD's context cycle (lead WARN 73%, user-approved) at the clean PD.7 boundary
**Impl session doc this round:** `phase-d-005-…` (PD.7)

## What this round did (orchestrator framing)

Drove **Phase-D round 3** — **PD.7** (the final-surviving-idea proof panel) — to a clean seal, then **split + staged PD.8** before the lead cycled the team. One slice landed (`1277cd1`); the round closed early on the lead's own context cycle, not at a work ceiling.

| Slice | Commit | Brief | Task |
|---|---|---|---|
| PD.7 final-idea proof panel (transfer-evidence rung label + terminal zero-survivors) | `1277cd1` | `phase-d-012` | #46 (completed) |

PD.8a was authored + dispatched (brief `phase-d-013`, task #47) but the dispatch **crossed the lead's cycle decision in flight** → zero commits → **cleanly reverted** (task #47 deleted; brief committed for the fresh team).

## Key pre-orient finding (PD.7 was far smaller than framed)

PD.7's tracker "Files:" predicted NEW `apps/web/src/demo/FinalIdeaProofPanel.tsx` + `EvidenceLinks.tsx` — that path **doesn't exist**. The real surfaces shipped in **P7.13/P7.14**: `apps/web/src/panels/FinalIdeaPanel.tsx` (built), already **mounted + live-wired** in `Dashboard.tsx` (lineage + events + runClient + `onSelectLineageNode`), and the §16 `dashboard-smoke.spec.ts` already asserts "start → live events → final-idea links resolve." So PD.7 was **NOT** a build or a mount — it was a tight **2-gap closure**:
1. **Transfer-evidence rung label** — live ("live allowlisted (non-executing)") vs replay ("replay-backed"), **mode-derived** (the frozen `CheckResult` carries no live/replay discriminator → mode is the only zero-surface source) + render winner `evidenceRefs` via the shared `EvidenceRefLink` (the one unrealized LESSON-7 reuse).
2. **Terminal zero-survivors** — a terminal run (`run.completed/failed/stopped`) with no selected winner reflects the terminal state, never the in-progress affordance, never a fabricated idea.

Everything else (panel/mount/links/e2e/emit-only) was satisfied-by-P7 (cited in the brief; verified green, not rebuilt). ZERO new contract surface; new props optional (existing tests unchanged).

## Decisions made (load-bearing)

- **PD.7 authored against the REAL surfaces**, not the stale tracker paths (file-path drift flagged to the lead — routine, folded into the brief).
- **PD.8 SPLIT** (orch scoping — not a scope cut; all deliverables still land): **PD.8a** = the load-bearing creds-free TDD (e2e smoke + real fixture capture + config-boot smoke); **PD.8b** = docs + .env + remaining rehearsals. Split justified by size + the deterministic-test-vs-docs distinction + a clean cycle boundary under the WARN trajectory.
- **3 USER deliverables** (lead-relayed) folded into the PD.8 briefs: (1) DEMO_RUNBOOK step-by-step (creds-free recorded/replay path AND live low-cap path, honest about which needs what); (2) `.env.example` **single-sourced from the real `loadConfig`/`envSchema` allowlist** (REQUIRED vs OPTIONAL, placeholders only — rule #4); (3) an automated **creds-free end-to-end smoke** (boot real stack migrate→seed→start vs real PG + RECORDED gateway → terminal + final-idea renders; in-slice test-first AND runbook-invokable). The lead asked to be **flagged at PD.8a's Step-2.5** (user invested).

## Hot-routing landed this round (orchestrator-written, in this round commit)

- **Lesson §11** (`apps/web/LESSONS.md` + index row in `apps/web/CLAUDE.md` + `pin:`): final-idea panel labels the transfer-evidence rung from the run MODE — zero-surface presentation, not a re-judgement (rule #6); terminal zero-survivors from the run-level `RunEventType`; new props optional.
- **Arch note** (`ARCHITECTURE.md §12`): the final-idea proof panel's rung-label (mode-derived) + in-tier `evidenceRefs` + terminal-zero-survivors behavior; ZERO new contract surface.
- **Plan:** PD.7 task-level done-marker (`1277cd1`); round-3 Currently-in-progress seal; round-3 Log entry; PD.8-split + 3-user-deliverable framing.
- **Round hygiene:** prettier-fixed 3 pre-existing PD.5 files (`OperatorPromptPanel.tsx`, `operatorPromptForm.test.ts`, `operatorPromptClient.test.ts`) — format drift on `b5014fc` that was blocking whole-repo `format:check` (impl correctly left them; out of its slice).
- **Briefs authored:** `phase-d-012` (PD.7, consumed) + `phase-d-013` (PD.8a, READY for re-dispatch).

## Carry-forward state (Step 5.5 triage)

Triage walked: the Carry-forward items are **cross-track merge-reconcile** (NOT phase-d's to build — the lead reconciles them at the cody merge), exactly as the phase-d-004 ledger noted ("persist in the tracker until the phase-end cody merge"). All **KEEP**; the struck-through `[DONE]` bootstrap-wiring item carries its own "prune at the cody reconcile" marker. No DELETE/INLINE/DEFER/SPREAD this round (lean seal under the lead cycle). The **PD.8 working-set** is captured in Currently-in-progress + this ledger (not duplicated into Carry-forward).

- **Now newly relevant to PD.8a:** the stale shared `createFakeGateway` fixtures (`population_generator` + `final_judge`) — PD.8a's fixture capture uses a **loop-capable bespoke fake** (the `main-boot.test.ts` pattern), NOT `createFakeGateway` as-is; fixing the shared fixtures stays OUT of PD.8a (gateway-stub/selection territory).

## ⚠️ BLOCKING FINDING + RESOLUTION (post-handoff — the fresh team's FIRST work item)

**Finding (surfaced at PD.8a Step-2.5, verified by the orch):** the §12 final-idea `status:'selected'` winner has **NO runtime/projection producer.** The kernel records the winner ONLY as `run.completed.finalIdeaRef` (= the best `scored ∧ ¬culled` survivor, `terminalClassifier.ts:155`); NO event/reducer sets a candidate to `'selected'` (grep of `apps/api/src/event-store/reducers` = nothing), yet `replay-summary.ts:75` + `lineage-graph.ts:73` + web `selectWinner` + the shipped PD.7 panel (`1277cd1`) all key off `'selected'`. **Impact:** the entire §12 final-idea surface is **winnerless on every real completed run** (only hand-built fixtures show a winner); PD.7's terminal branch renders "No surviving idea — run completed" on a SUCCESSFUL run — the demo HEADLINE can't show a winner on a real/recorded run, and PD.8a acceptance #2 can't pass.

**✅ DECISION (lead, 2026-06-23 — lead's call, NOT a user product fork; user informed): (b) — a small PREREQUISITE projection-bridge slice.** The winner IS derivable: `lineage-graph` + `replay-summary` mark the candidate whose id == `run.completed.finalIdeaRef` as `'selected'`. **ZERO new contract surface** — a §10-conformance BUG FIX (§10 already says "selected winner = candidate node status 'selected'"; the projection just never produced it), in-track (projections territory). Rejected (a) fold-into-PD.8a (bloats it) + (c) defer (ships the headline winnerless on real runs). **It independently fixes the shipped §12 surface (PD.7) on real runs**, so it's bisectable + high-value on its own.

**Q1 (PD.8a creds-free), confirmed:** placeholder provider-key **VALUES** (recorded/replay calls no provider → keys unused; **§15 boot fail-fast stays INTACT** — do NOT make `assertProviderCredentials` recorded-mode-aware / weaken to truly-empty-env; the brief forbids weakening that test).

## Next session target (fresh team)

**FIRST: the projection-bridge slice (decision b)** — `lineage-graph` + `replay-summary` mark the `finalIdeaRef` candidate `'selected'` (zero contract surface, §10-conformance, test-first; fixes PD.7's §12 surface on real runs) → **then re-dispatch `phase-d-013` (PD.8a)** — creds-free e2e smoke + real fixture capture (`fixtures/replay/` is only `.gitkeep` — none exists) + config-boot smoke (now PD.8a #2/#8 assert a REAL selected winner end-to-end; Q1 = placeholder creds) → **author + dispatch `phase-d-014` (PD.8b)** — DEMO_RUNBOOK + .env.example (single-sourced from `loadConfig`/`envSchema`) + remaining §16 rehearsals → **`/phase-exit PD`** → THEN the **lead-owned** phase-d→cody merge + USER sign-off (the lead runs the creds-free e2e smoke before/after). Do NOT merge to cody from the track.

## Operating notes for the successor orchestrator

- **CWD wrinkle:** phase-d sessions inherit `cwd=Capstone-kernel`; the Bash cwd RESETS each call. Use `pnpm -C /Users/dreddy/Documents/GauntletAI/Capstone-phased/apps/{api,web}`, `git -C .../Capstone-phased`, ABSOLUTE paths, branch-check `== phase-d` before edit/commit. A bare `pnpm test` runs the KERNEL worktree = FALSE GREEN.
- **spec-lint gotcha:** the brief gate reads `§NN` as ARCHITECTURE anchors → write lesson refs as `LESSON NN`, never `§NN`. (`phase PD has no Spec anchors: line` note is cosmetic — the tracker header reads "Phase D" not "PD"; the subset check is skipped, not failed.)
- **PD.8a is READY** — brief `phase-d-013` (spec-lint PASS @76b5fb4a); build on the existing `apps/api/test/integration/boot/main-boot.test.ts` harness (real PG, loop-capable fake to terminal); the boot entry is `main.ts` (NOT a `boot-demo.ts`). Step-2.5 Q1 (fixture-capture gateway = loop-capable bespoke fake) + Q4 (assert the final-idea PROJECTION at the api tier + cite the existing `dashboard-smoke.spec.ts` for the render) are load-bearing — **flag the lead at Step-2.5**.
- **Web-slice note:** the api impl wears the web hat (read `apps/web/CLAUDE.md`); test via `pnpm -C .../apps/web`; pair every panel with a behavioral testing-library unit test (deterministic CI regardless of the e2e — LESSON 10).
- **cody merge DEFERRED** to phase completion (after PD.8 + a CLEAR `/phase-exit PD`) + USER sign-off — push phase-d→origin ONLY; route plan/arch edits to phase-d's copies (reconciled at the merge), not cody.
