# Team Handoff phase-d-001 — Phase-D lead-cycle (finish the demo)

**Date:** 2026-06-23
**Track:** phase-d (Phase D — final demo/integration phase). Worktree: `../Capstone-phased` (branch `phase-d`).
**Why this handoff:** LEAD cycled at WARN (73%). The remaining lead-heavy work (the cody merge + e2e smoke + user report) needs full budget. Teammates cycled at the same time (clean — round-3 sealed).
**Resume:** the user runs `/team-start phase-d` (launch it from inside `../Capstone-phased` if possible). This doc IS the orient.
**Round-seal at handoff:** `61f0cf0` (origin/phase-d). PD.1–PD.7 DONE.

## State — Phase D is ~80% done
All 5 BUILD tracks (contract/kernel/verifier/selection/demo) are complete + on cody. Phase D wires them into the runnable demo. Done + on `phase-d`:
- PD.3 boot spine + kernel stop-path · PD.1/PD.2 prepared-replay capture+seed · PD.4 fallback-ladder + cap-override safety · PD.9 live OpenRouter gateway (opt-in) · **PD.10 = the HEADLINE Option-B feature** (operator's problem → generation, rule-#5 isolated + output-validated → graceful agenome.failed) · PD.5 operator-prompt panel + run-config · PD.6 mode/health · PD.7 final-idea proof panel.
- The "type a problem → organism evolves against it" path is wired end-to-end (live + replay). ZERO new contract surface across all of Phase D.

## ⚠️ FIRST RESUME ITEM — §12 winner projection-bridge (RESOLVED by lead → option b; just BUILD it)
**Finding (orch-verified, demo-headline-breaking):** the §12 final-idea winner (candidate `status:'selected'`) has NO projection producer. The kernel DOES record the winner — `run.completed.finalIdeaRef` (`terminalClassifier.ts:155`) — but NO reducer/projection marks that candidate `'selected'`; `replay-summary.ts:75` + `lineage-graph.ts:73` only READ a `'selected'` status that no real run produces. IMPACT: every real/recorded completed run is WINNERLESS — the §12 surface (replay-summary, web `selectWinner`, the shipped PD.7 panel `1277cd1`) shows no winner; PD.7's terminal branch renders "No surviving idea" on a SUCCESSFUL run. The headline "your problem → final surviving idea" can't show a winner on any real run.
**DECISION (lead — option b; this is a §10-CONFORMANCE BUG FIX, not a product fork, so already decided):** build a PROJECTION BRIDGE as a small PREREQUISITE slice BEFORE PD.8a — `lineage-graph` + `replay-summary` mark the candidate whose id == `run.completed.finalIdeaRef` as `'selected'`. ZERO new contract surface (§10 already defines "selected winner = candidate node status 'selected'"; the projection just never produced it). In-track (projections territory). It independently fixes the shipped §12 surface + PD.7; then PD.8a #2 can assert a `'selected'` node from a real-run fixture. (Rejected: (a) fold into PD.8a = bloat; (c) ship winnerless = broken headline.)
**Q1 (creds-free smoke):** use placeholder provider-key VALUES (recorded/replay calls no provider → keys unused; keep §15 boot fail-fast INTACT — do NOT weaken to truly-empty-env).
**Details for the fresh team:** ledger `phase-d-006` (orch wrote the diagnosis there), brief `phase-d-013`, the impl's PD.8a Step-2.5 message.

## Pending work (in order)
1. **Build the §12 winner projection-bridge slice (option b — DECIDED above).** Do NOT re-escalate to the user; it's a settled §10-conformance bug fix.
2. **PD.8a** (creds-free e2e smoke + real fixture capture + config-boot smoke) → **PD.8b** = the **USER'S EXPLICIT DELIVERABLE**: `DEMO_RUNBOOK.md` (step-by-step boot→run guide, both creds-free replay AND live paths) + `.env.example` (derived from the REAL loadConfig env allowlist; every var REQUIRED/OPTIONAL + placeholders, no secrets — rule #4). Scope locked in ledger `phase-d-006` + the lead directives.
3. **`/phase-exit PD`** (audit fan-out).
4. **phase-d→cody MERGE** — LEAD-owned + **USER sign-off** (cody is at `d7b290a`; expect a clean-ish merge — check cody hasn't advanced; reconcile LESSONS/ARCH §5/§6/§12/§13/§14/§17 notes from ledger; preflight green before push).
5. **RUN the creds-free e2e smoke** to validate the demo boots + runs end-to-end (the user asked for this).
6. **Final report + hand the user the DEMO_RUNBOOK.**

## Resume prompts (cwd-HARDENED — Agent spawns inherit the lead's cwd + Bash cwd RESETS each call; use absolute paths + `git -C <wt>` + `pnpm -C <wt/pkg>`; branch-check before commit)
**Orchestrator** (`phase-d-api-orchestrator`, team `phase-d`): worktree `/Users/dreddy/Documents/GauntletAI/Capstone-phased` (branch phase-d, HEAD 61f0cf0). Author from the reconciled tracker + ledger `phase-d-006`. FIRST: register + `/orchestrate-start`. Sequence: resolve selected-winner Finding (lead-escalated) → PD.8a → PD.8b (runbook/.env) → `/phase-exit PD` → STOP for the lead cody-merge.
**Implementer** (`phase-d-api-implementer`, area api, team `phase-d`): same worktree; wears the web hat for web slices (read apps/web/CLAUDE.md). ABSOLUTE paths + `git -C` + `pnpm -C` (cwd does NOT persist); branch-check == phase-d before any commit. FIRST: register + `/session-start`. Wait for dispatch.

## Notes
- `.env.example` does NOT exist yet (PD.8b builds it). The runbook + e2e smoke are PD.8 deliverables the user explicitly requested.
- Langfuse export stays Phase-D-deferred (rule-#2 projection); judge stays problem-free (rule #6). Both are documented decisions — don't reopen without cause.
