# phase-d-004 — Orchestrator routing ledger (Phase-D round 2)

**Date:** 2026-06-22 · **Role:** phase-d-api-orchestrator · **Track:** phase-d (demo) · **Worktree:** `Capstone-phased` (branch `phase-d`)
**Predecessor:** `phase-d-002` (round-1 ledger) · **Round sealed via:** the context auto-cycle (impl ACTION 75%, clean boundary after PD.6)

## What this round did (orchestrator framing)

Drove **Phase-D round 2** — the operator demo path + the headline **"your problem → final surviving idea"** feature — across **6 slices** (all test-first, Step-2.5 reviewed; PD.4 + PD.10 security-reviewer INVARIANT CLEAN; web e2e green on chromium). **ZERO new contract surface across all 6.** Three deliverable-map items advanced (operator-entered live prompt, the live gateway, the headline generation-shaping feature). The demo's runnable spine + replay safety net (round 1) means the demo RUNS regardless of the remaining tail.

| Slice | Commit(s) | Brief | Task |
|---|---|---|---|
| PD.4 operator fallback-ladder + demo cap-override (SAFETY) | `303900c` (cap-override) + `e2fc1f0` (ladder) | `phase-d-006` | #40 |
| PD.9 live OpenRouter gateway → `selectGateway` | `da774b1` | `phase-d-007` | #41 |
| PD.10 generation-safety (Option B: problem→generation + output validation) | `8337e59` (input isolation) + `c88bb4a` (output validation) | `phase-d-008` | #42 |
| PD.5a `GET /problem-sets` read route | `65b2496` | `phase-d-009` | #43 |
| PD.5b web `OperatorPromptPanel` (closes PD.5) | `9465013` | `phase-d-010` | #44 |
| PD.6 mode/health surfacing (`RunHealthPanel` + stale flag) | `b61afa5` | `phase-d-011` | #45 |

Round terminal commit: this `/orchestrate-end` (pushed origin/phase-d — track backup).

## Decisions made (load-bearing)

- **Option B (user→lead) — the per-run problem SHAPES generation FOR REAL** (not a recorded label). Accepted the kernel-loop re-engagement + a rule-#5 safety slice (PD.10). The held-out judge stays **PROBLEM-FREE + immutable** (rule #6) — relevance-scoring (judge sees the problem) is DEFERRED as an additive future option (Trims; a rule-#6 human call if ever pursued).
- **Fold the output-validation Finding into PD.10** (lead) — same `population_generator` call site as the input-isolation, so PD.10 became a 2-commit generation-safety slice (input isolation rule-#5; output validation via the gateway discipline → graceful `agenome.failed`).
- **`demo-run-config.ts` DROPPED** (orch, verified) — `POST /runs` already deep-merges a partial `{seed}` against `defaultConfig` (`validateRunConfig` defaults<file<env), so the web POSTs `{seed}` directly; no api config-builder needed.
- **Web-local mirrors, not contract changes:** `ProblemSet` (PD.5b) + `RunHealth` (PD.6) stay web-local Zod mirrors (parallel to the existing RunHealth pattern). PD.6's stale badge is an INLINE component, NOT the frozen-contract-enum-coupled status-map.
- **PD.9 live gateway** = `createLiveGateway` feeds the real OpenRouter adapter into the SAME `createGateway` (discipline inherited); `selectGateway` honest-throws on absent live deps (no silent fake fallback). Lazy: main.ts builds live deps only when `DOPPL_GATEWAY=live`.

## Findings routed

- **PD.9 → output-validation Finding:** the `population_generator` generate call passed NO schema → a malformed real-model output was accepted → crashed the worker mid-run (recovered only by next-boot crash-forward). Folded into PD.10 commit 2 (pass `CandidateContent` → validate/repair/reject → graceful `agenome.failed`; energy #8 + replay #7 preserved).
- **PD.5 premise-Finding (drove Option B):** verified that NO per-run problem reached generation — `RunConfig.seed` was dropped in `composeRuntime.mergePerRunConfig`; the boot `problemSets`/`seedSet` are immutable + unconsumed. Escalated to the user (A recorded-label / B wire-into-generation / C defer); user chose **B**.

## Hot-routing landed this round (orchestrator-written, in the round commit)

- **Lessons §89–§91** (`apps/api/LESSONS.md` + index rows in `apps/api/CLAUDE.md`): §89 demo-convenience-shares-the-authoritative-boundary · §90 live-gateway=adapter-into-the-same-createGateway + honest-throw · §91 per-run-problem-into-generation=wrapUntrusted-DATA + output-validated-via-derived-content-schema.
- **Arch notes** (`ARCHITECTURE.md`): §17 Phase-D status (PD.4/PD.9/PD.10/PD.5/PD.6) + §5 (seed threads into generation), §6 (live gateway + the output-validation discipline), §12/§13 (RunHealthPanel + ModeBanner), §14 (rule-#5 generation isolation).
- **Plan:** PD.4–PD.10 task-level done-markers; round-2 Currently-in-progress seal; this Log entry; Phase-D anchors widened (§5/§6/§14) for PD.9/PD.10; Carry-forward triage (DELETED the consumed PD.4→PD.5/PD.6 working-set + the done bootstrap-wiring item).
- **Briefs authored:** `phase-d-006`…`phase-d-011` (6).

## Carry-forward state (for the next orch — PD.7/PD.8)

- **PD.7/PD.8 working-set:** PD.7 = final-surviving-idea proof panel (wire the P7-built `FinalIdeaProofPanel`/`EvidenceLinks` to the live run — lineage/critics/checks/score/energy/traces, deep-links resolve). PD.8 = §16 rehearsal scripts + `DEMO_RUNBOOK.md` + capture the REAL committed demo fixture (run→dump→commit). PD.8 may want multi-fixture seeding (carry-forward) for the prepared rungs.
- **Two integration carry-forwards for the demo→cody merge (lead-owned):** (i) reconcile the web-local `RunHealth` schema vs the api shape (`currentGeneration`↔`generationCount`; flat↔nested `capsConsumed` — LESSON 34); (ii) wire the EventSource real `'error'` (connection-drop) listener (today payload-validation `onError`→poll only).
- **Cross-track / merge-reconcile (NOT phase-d's to build — lead reconciles at the merge):** `candidate.rejected` emitter (runtime/selection); fake-gateway fixtures stale (gateway-stub); retrieval-FETCH wiring (selection/demo); P2.8 Langfuse-export subscriber; selection-P5 minor items; generation-level crash drain. These persist in the tracker until the phase-end cody merge.
- **Trims:** judge relevance-scoring (additive, rule-#6 human call IF ever pursued).

## Next session target

**PD.7** (final-idea proof panel) → **PD.8** (§16 rehearsals + DEMO_RUNBOOK + real-fixture capture) → **`/phase-exit PD`** (the 6-auditor fan-out + spec coverage) → THEN the **phase-d→cody merge is LEAD-owned, at phase completion + USER sign-off** (do NOT merge to cody from the track).

## Operating notes for a successor orchestrator

- **CWD wrinkle:** phase-d sessions inherit `cwd=Capstone-kernel`; the Bash cwd RESETS each call. Use `pnpm -C /Users/dreddy/Documents/GauntletAI/Capstone-phased/apps/api` (or `apps/web` for web slices — note the area), `git -C .../Capstone-phased`, ABSOLUTE paths, branch-check `== phase-d` before edit/commit. A bare `pnpm test` runs the KERNEL worktree = FALSE GREEN.
- **spec-lint gotcha:** the brief gate reads `§NN` as ARCHITECTURE anchors → write lesson refs as `LESSON NN` (or `LESSON-NN`), never `§NN`, or the lint fails (hit on PD.10's brief — `§38`→`LESSON-38`).
- **Web slices:** the api impl wears the web hat (read `apps/web/CLAUDE.md`); test via `pnpm -C .../apps/web`. The e2e (Playwright) runs if chromium installs, else doc-as-CI (L§10) — pair every panel with a testing-library behavioral unit test for deterministic CI coverage (the PD.5b lesson).
- **cody merge DEFERRED** to phase completion (after PD.7+PD.8 + a CLEAR `/phase-exit PD`) + USER sign-off — push phase-d→origin ONLY; route plan/arch edits to phase-d's copies (reconciled at the merge), not cody.
