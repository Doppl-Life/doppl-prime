# Session selection-005 — Phase-5 wiring orchestration + round close-out + /phase-exit P5 CLEAR

> **Orchestrator-side** round doc (companion to the implementer's `selection-003`). Frames the Phase-5
> **wiring** round: resume-merge, brief authoring, Step-2.5 reviews, Step-9 hot-routing, the escalations,
> the `/phase-exit P5` gate, and the cody merge handoff.

- **Date:** 2026-06-22 · **Track:** selection · **Branch:** `track/selection` · **Role:** orchestrator (`selection-ml-orchestrator`)
- **Predecessor:** `selection-002` (orch, Phase-5 logic round) · `selection-003` (impl, wiring round) · `selection-004` (impl, cleanup /session-end)
- **Successor:** _TBD_

## Round shape — the deferred-wiring pass (resume → Phase-5 truly done)

Resumed from handoff `selection-001` (Phase-5 logic code-complete + paused). Both gates cleared (kernel P3 +
verifier P4 merged to cody), so this round **wired selection's deferral seams to the real runtime** + closed
`/phase-exit P5`. Resume `git merge cody` `fb15a7b` pulled P3/P4/demo + contracts sv3→sv5 — **additive only**
(4 terminal event types + 2 status values + a type-aware redaction fix); every core contract selection
consumes was UNCHANGED → **no reconciliation slice, no Finding** (post-merge suite green).

### Slices landed (10 + the resume merge + a mid-round VerifySeam merge)

| Slice | Commit | Note |
|---|---|---|
| W1 score-seam | `6194348` | createScoreSeam: novelty→components→fitness→cull; judge_acceptance candidateId join |
| **P5.8 rule-#7 fix** | `2a65c5a` | **latent jsonb-key-reorder replay defect** caught by W2's round-trip ADD; own safety commit |
| W2 reproduce-seam | `609a811` | createReproduceSeam: allocation(caps-clamp)+assembleSuccessor |
| W3a kernel hook | `207a0a8` | additive `nextPopulation?` + the rule-#1 population clamp (cross-territory kernel) |
| _(VerifySeam merge)_ | `9de3ef6`→merge | verifier P4.12 pulled into track for the real 3-seam wiring |
| W3b-1 successor-threading | `3485220` | reconstruct offspring→re-home; **gen N+1 evolves from gen N** (loop-level e2e) |
| #16 verifier format-fix | `f03a363` | on-loan reformat of 2 verifier test files (unblock repo-wide format:check) |
| W3b-2a boot composition | `5fdd59d` | composeRunWorkerDeps: 3 real seams + single immutable rubric (rule #6) |
| W3b-2b POST /runs trigger | `635c0ee` | additive onRunConfigured → runWorker; **operator-command-to-organism loop closed** (HTTP e2e) |
| W3b-2c per-run config | `beb36b2` | run.configured drives the worker (recorded==executed); caps clamped (rule #1) |
| reachability cleanup | `f07367d` | delete superseded selectParents + dead jaccard barrel export + 2 CQ one-liners |

Suite end-state: **unit 603 · integration 125** · `/preflight` clean (repo-wide) · every slice security-reviewed.

## Decisions made (orchestrator framing)

- **Seam architecture (lesson §64):** the kernel built the loop as pure orchestration over injected `ScoreSeam`/`ReproduceSeam`/verify ports. Wiring = `create<Seam>(deps)` adapters composing the already-unit-pinned selection fns + reading cross-subsystem inputs back from the persisted log (`readByRun`), emitting only via `ctx.append` (rule #2/#4); immutable anchors (policy/rubric) injected from the boot root, validated-not-owned.
- **The round-trip ADD earned its keep:** W2's "persisted child == applyReproduction(persisted event)" integration assertion caught a **real rule-#7 defect** in already-landed P5.8 `mutate.ts` (Object.keys/JSON.stringify provenance is jsonb-key-order-sensitive; Postgres reorders keys → live≠replay). Fixed as a separate `fix:` safety commit (`2a65c5a`) before W2. Track-only (never reached cody).
- **Successor-threading via an additive kernel hook (lesson §71 precedent):** `nextPopulation?` on GenerationLoopDeps (default-absent = unchanged) + the kernel **clamps** the hook's returned population to `maxPopulation` (rule #1 — the hook is a hint). Human-authorized guardrail-lift for that one clamp line.
- **Boot composition single-rubric (rule #6):** ONE `DEFAULT_JUDGE_RUBRIC` wired to BOTH verify (judge) and score (judgeAcceptance) so the candidateId-join's `rubricPolicyVersion` matches.
- **Per-run config honored (human Option B):** `startRun` reads `run.configured` → `composeRunWorkerDeps` merges caps/rngSeed/enabledSubtypes over the boot AppConfig, **clamped** `min(posted, boot)` per cap (rule #1; never raises). Boot keeps the immutables.

## Escalations dispositioned (cat #1/#2/#3/#4 → human via lead)

- **W3 scope (cat #4):** human chose **Option A** — selection builds the boot root + the additive kernel hook + the demo trigger on-branch (cross-territory, manifested).
- **Rule-#1 clamp site (cat #1):** human chose the **kernel clamps the hook** (rule #1 stays kernel-enforced); guardrail-#1 lifted for the clamp line only.
- **Per-run-config deferment (cat #3):** human chose **Option B** (close it now — W3b-2c).
- **Reachability gate (cat #2):** human chose the **cleanup slice** (true CLEAR over a waiver) — removed 2 dead exports.
- **Cross-track Findings:** the P5.8 rule-#7 defect (dispositioned in-cycle); the verifier format-drift (on-loan fix `f03a363`); the kernel `ctx.outcomes`-unused seam observation (banked).

## /phase-exit P5 — VERDICT: CLEAR

All rows pass (reports in `docs/audits/P5-{reachability,security,quality}.md`; arch-drift inline):
preflight clean · acceptance (gen N+1 evolves, e2e-proven) · cross-doc invariants (consume-only) · **reachability CLEAR** (re-run after cleanup: 0 unreachable, 2 accepted-deferred) · **arch-drift CLEAR** (8 §8 anchors, 0 drift) · spec-coverage (§8 tagged; `spec-lint tests` bold-format quirk = known tooling note) · deps clean · **security CLEAR** (0 findings, rules #1/#2/#4/#6/#7/#9 PASS) · code-quality CLEAR (6 minor; 2 folded, 4 documented follow-ups) · session docs · commits verify-only.

## Open follow-ups → cody merge handoff (shared-root-doc edits the lead absorbs at merge)

Per the multi-track carve-out, NOT edited on track/selection:
- **IMPLEMENTATION_PLAN.md (cody):** tick P5.1–P5.11; tick the **Phase-5 box** (/phase-exit P5 CLEAR); Log entry; Carry-forward **DELETE** the per-run-config item (consumed by W3b-2c).
- **ARCHITECTURE.md (cody) §8:** the wiring arch-notes (score path order; reproduce-seam injected-seed; successor-threading = gen N+1 from reconstructed offspring, kernel-clamped; boot single-rubric; per-run config recorded==executed clamped).
- **apps/api/LESSONS.md + CLAUDE.md (cody):** the selection lessons (provisional; **renumber to §74+** on merge — cody is at §73; per-track collision §35/§65).
- **Cross-territory manifest (on-loan, for the leads' merge review):** KERNEL — `generationLoop.ts` (nextPopulation hook + clamp), `runWorker.ts` (forward), `runtime/index.ts` (export); DEMO — `routes/runs.ts` (onRunConfigured), `server.ts` (pass-through); VERIFIER — verify-seam test reformat.
- **Documented follow-ups (NOT this round):** route-max residual (align `buildServer.defaultConfig` with the boot ceiling at the Phase-D production `main.ts`); the 4 remaining P5-quality items (O(N×M) best-candidate scan, GENERATION_ID_PATTERN coupling, startRun safeParse→boot fallback, MVP cull-policy minFitness:0); the Phase-D production boot root (`main.ts` wiring `createStartRun`); the demo/PD replay-recompute consumer of `noveltyScoreOf`.

## This round's terminal commit (track/selection)

Orchestrator round commit sweeps `docs/briefs/selection-011..018` + `docs/audits/P5-{reachability,security,quality}.md` + this doc. No shared-root-doc edits on this branch (they route to cody). Pushed to origin/track/selection.
