# Session phase-d-007 — PD.7 final-idea proof panel gap-closure (+ PD.8a Finding)

- **Date:** 2026-06-23
- **Phase / track:** Phase D (demo) · track `phase-d`
- **Predecessor:** `docs/sessions/phase-d-001-2026-06-22-demo-boot-spine-replay-loop.md`
- **Successor:** [phase-d-008](phase-d-008-2026-06-23-web-api-wiring-reconciliation.md) (PD.8c live re-run + PD.14/15/16 web↔API wiring + reconciliation)
- **Round:** Phase-D round 3 (sealed by the orchestrator at `61f0cf0`); team cycled at the clean PD.7 boundary (lead at WARN, user-approved).

## Why this session existed

Final-stretch round 3: close PD.7 (the §12 final-idea proof panel's two remaining acceptance gaps) → then PD.8 (§16 rehearsals). PD.7 landed; PD.8 was split (8a creds-free e2e + fixture + config-boot; 8b runbook + .env + remaining rehearsals); PD.8a was dispatched, explored, and **stood down at the lead cycle with zero commits** — but its exploration surfaced a blocking Finding (below) that must ride into the next round.

## What was built

### PD.7 — final-idea proof panel wiring (landed `1277cd1`, task #46 → completed)

Two display gap-closures on the already-built/mounted `FinalIdeaPanel`. ZERO new contract surface; 1 commit; non-safety (preserves emit-only/read-only/energy-success-only via reused selectors).

**Files modified:**
- `apps/web/src/panels/FinalIdeaPanel.tsx` — `+mode?`/`+runStatus?` optional props; terminal zero-survivors branch (via `isRunTerminal`); a "transfer evidence" `ProofSection` (mode-derived live/replay rung label, colorblind-safe ▶/⏮+text, + the winner's `evidenceRefs` rendered via the shared `EvidenceRefLink`).
- `apps/web/src/panels/finalIdeaData.ts` — `+evidenceRungLabel(mode)` pure helper.
- `apps/web/src/routes/Dashboard.tsx` — thread `mode={store.getMode()}` + `runStatus={runStatus}` into the existing mount.
- `apps/web/test/unit/panels/FinalIdeaPanel.test.tsx` — +7 unit tests (Vitest).
- `apps/web/test/e2e/dashboard-smoke.spec.ts` — extended happy path (rung label + `AIRS 2003` ref).

**Verification:** web unit 168/168 (37 files) · e2e 4/4 (chromium) · typecheck/lint/format clean (slice files).

### PD.8a — creds-free e2e demo smoke + fixture + config-boot (task #47, ABANDONED, zero commits)

Explored only (no tests/code written) — stood down at the team cycle. Brief `docs/briefs/phase-d-013-PD.8a-credsfree-e2e-smoke-fixture.md` is committed in the orchestrator's round-3 seal; the fresh team re-dispatches. **The exploration surfaced a blocking Finding — see Open follow-ups #1.**

## Decisions made

- **PD.7 label source = run MODE** (`store.getMode()`), not a per-`CheckResult` field — confirmed the frozen `CheckResult` carries no live/replay discriminator, so mode is the only zero-new-surface source; a presentation of the run mode, not a re-judgement (rule #6 emit-only).
- **PD.7 terminal signal = `runStatus?: RunEventType`** classified with the existing `isRunTerminal` (single terminal-truth source); props optional so the 6 existing panel tests stay green unchanged.
- **PD.7 renders the winner's `evidenceRefs` via the shared `EvidenceRefLink`** — realizing the LESSON-7 reuse on the final-idea surface.

## Decisions explicitly NOT made (deferred to the fresh team)

- **PD.8a "creds-free" shape** — placeholder provider-key env values (recorded/replay calls no provider, rule #7; preserves §15 fail-fast + its test) **vs** a §15 boot-policy change making `assertProviderCredentials` recorded-mode-aware (would weaken the existing fail-fast test). My Step-2.5 vote was placeholder creds. Lead/user input pending.
- **The `selected`-winner projection bridge** (Open follow-up #1) — resolution option (a) fold into PD.8a / (b) new prerequisite slice / (c) re-scope acceptance #2. Lead's call.

## TDD compliance

**Clean.** PD.7 was test-first: 7 RED tests written + Step-2.5-reviewed (APPROVED) before implementation; RED confirmed (4 behavior tests failed for the right reason, 9 guards/existing green); GREEN; full suite + e2e green. No violations. PD.8a wrote no code (exploration only) — N/A.

## Reachability

- **PD.7 `FinalIdeaPanel` (mode/runStatus/evidence rung):** reachable from the production shell `apps/web/src/routes/Dashboard.tsx` (sole caller, line ~216) — both new props passed at the mount; the §16 `dashboard-smoke.spec.ts` e2e drives the live rung label end-to-end in the real App. No tested-but-unwired gaps.

## Open follow-ups

1. **🚩 BLOCKING FINDING (carry into the next round — re-dispatch of PD.8a depends on it; user-invested; architecture-adjacent).** The §12 final-idea winner has **no runtime/projection producer**:
   - The kernel records the winner ONLY as `run.completed.finalIdeaRef` = best `scored ∧ ¬culled` survivor (`runtime/terminal/terminalClassifier.ts:155`; `partialSummary.ts:7,45,98`).
   - NO event/reducer ever sets a candidate status to `'selected'`: the worker appends `candidate.created{status:'created'}` (`generationLoop.ts:458`); reducers map only culled/invalid/rejected (`reducers/entities.ts`, `reducers/lineage.ts`); `run.completed` updates only run status (`reducers/lifecycle.ts:23`).
   - The §12 surface — web `selectWinner` (`status==='selected'`), `projections/replay-summary.ts:75` `selectedCandidateId`, **and the PD.7 panel shipped this session** — all key off `status:'selected'`, unreachable from a real run (the real-run integration test asserts only `finalIdeaRef`, `compose-runtime.test.ts:193-197`).
   - **Impact:** PD.8a acceptance #2 (`final_idea_projection_resolves` requiring a `status:'selected'` node) cannot pass from a real-run-captured fixture; the §12 panel is winnerless on every real completed run; PD.7's terminal branch will render "No surviving idea — run completed" on a successful run (wrong).
   - **Proposed fix:** a projection bridge (zero new contract surface, rule #2 derived) — lineage-graph + replay-summary mark the candidate whose id == `run.completed.finalIdeaRef` as `selected`. Recommended as a new prerequisite slice PD.8a depends on (also independently fixes PD.7 on real runs). Routed to the orchestrator at Step-2.5 (in its inbox).
2. **PD.8a re-dispatch** from the committed brief `phase-d-013` (creds-free e2e + fixture capture + config-boot smoke) — fresh team. Step-2.5 design defaults already drafted (loop-capable fake capture; plain integration tests; two files; assert projection + cite web e2e).
3. **Pre-existing prettier drift (orchestrator-owned, not PD.7):** 3 committed PD.5 files fail repo-wide `pnpm -C apps/web format:check` — `src/components/demo/OperatorPromptPanel.tsx`, `test/unit/components/demo/operatorPromptForm.test.ts`, `test/unit/data/operatorPromptClient.test.ts`. Will surface RED at `/orchestrate-end`/`phase-exit` preflight unless fixed. Orchestrator accepted ownership.

## Step-9 categorized list (PD.7 — already routed hot to the orchestrator)

- **Architecture-doc note** (§12/§17): the final-idea panel labels the transfer-evidence rung live/replay (mode-derived) + reflects terminal zero-survivors + realizes the LESSON-7 `EvidenceRefLink` reuse.
- **Convention candidate** (LESSON §11, orchestrator wrote hot): the final-idea panel labels the rung from the run MODE, never a new event field — zero-surface presentation, not a re-judgement (rule #6).
- **Cross-doc invariant change:** NONE (no `@doppl/contracts`/Appendix-A field, no new event type, no new route).
