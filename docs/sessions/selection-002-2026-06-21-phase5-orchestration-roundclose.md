# Session selection-002 — Phase 5 orchestration + round close-out

> **Orchestrator-side** session doc (companion to the implementer's `selection-001`). The orchestrator's
> framing of the Phase-5 round: brief authoring, Step-2.5 reviews, Step-9 hot-routing, the cross-track
> judge-seam escalation, and the round close-out routing.

- **Date:** 2026-06-21
- **Track:** selection · **Branch:** `track/selection` · **Role:** orchestrator (`selection-ml-orchestrator`)
- **Predecessor:** `selection-001-2026-06-21-phase5-selection-scoring-reproduction.md` (implementer, same round)
- **Successor:** `selection-003-2026-06-22-phase5-selection-wiring.md` (implementer — the W1→W3b-2b wiring pass)

## Round shape

Phase 5 (selection / scoring / reproduction, §8) built end-to-end at the unit/deterministic level — **10
implementer slices**, all RED→Step-2.5→GREEN→Step-9, every slice security-reviewed CLEAN. Forked from the
cody freeze-merge; mid-round pulled the **Option-A judge-output amendment** (see Decisions). Suite climbed
**50 → 268** (apps/api unit) + contracts 175.

| Slice | Task | Commit | Notes |
|---|---|---|---|
| novelty embed + cosine | P5.2 | `4a690f2` | rule-#7 replay seam (embed/recompute split) |
| novelty degrade + energy-efficiency | P5.3+P5.4 | `d2335b4` | bundle; deterministic lexical fallback; success-only |
| bounded mutation + RNG | P5.8 | `3acb121` | rule-#7 live mutate / replay applyMutation |
| critic-scores component | P5.5-critic | `df8b899` | numeric-only (rule #5/#6 text-independence) |
| held-out-judge acceptance | P5.5-judge | `d10854d` | rule-#6 load validation; completes P5.5 |
| policy-versioned fitness scorer | P5.6 | `c767f88` | composes 5 components; NaN-integrity |
| weak-lineage cull + parent selection | P5.7 | `9fd104d` | lineage.culled; order-independent seeded tie-break |
| two-level fusion | P5.9 | `94ca2fe` | gateway synthesis; rule-#5 both-dir; fail-loud replay |
| reproduce dispatcher + degenerate | P5.10 | `134ddd1` | mode-keyed replay dispatch; shared SelectionEmitter |
| heuristic allocation + successor | P5.11 | `d38b6e2` | rule-#1 caps-clamp-as-hint; runtime handoff |
| implementer session doc | — | `4be9fbc` | `selection-001` |

P5.1 (ScoringPolicy/FitnessScore/NoveltyScore/ReproductionEvent contracts) was **satisfied-via-P0** (frozen
in P0.8/P0.9) — verified at orient; no brief authored. First build slice was P5.2.

## Decisions made (orchestrator framing)

- **Held-out-judge output seam (cross-track Finding → human Option A).** Authoring P5.5 surfaced a real
  frozen-contract gap: no `JudgeResult` model + no `judge.reviewed` terminal event for the held-out judge's
  acceptance output (only `FinalJudgeRubric` [input] + the `judge.review_started` marker existed). Escalated
  as a Finding (cat #2 broken-premise + #4 load-bearing cross-track). Human ratified **Option A** — a frozen
  `JudgeResult` + `judge.reviewed` + schemaVersion 3 (P0.16), authored cross-track on the contract track,
  merged to cody, pulled into this worktree at `19e0833` (verified: contracts 175 + apps/api unit 170 green,
  the 4 then-landed slices survive schemaVersion 3). P5.5-judge + P5.6→P5.11 unblocked.
- **Bundle/atomize:** P5.3+P5.4 bundled (both derived read-only fitness-component inputs, non-invariant).
  Everything else SOLO — each carried a safety pin (rule #1/#5/#6/#7) or emitted an authoritative event.
  P5.10/P5.11 **split** (not bundled) at the Phase-5 finish line: P5.11 depends on P5.10's dispatcher,
  carries rule-#1, and the implementer's context was climbing (WARN at P5.11 dispatch).
- **Replay-faithfulness is structural throughout (rule #7):** every stochastic/provider op persists its
  outcomes and reconstructs zero-RNG + zero-gateway — embed/recompute (P5.2), live-mutate/replay-apply
  (P5.8), fuse/applyFusion (P5.9), mode-keyed applyReproduction (P5.10), deterministic allocation (P5.11).
- **Selection-decides / kernel-emits-lifecycle seam** (P5.7 → P5.10/P5.11): selection emits its own domain
  events (novelty.scored, fitness.scored, lineage.culled, agenome.fused/reproduced) + returns flags
  (zeroSurvivors); lifecycle terminals (generation.completed), agenome state transitions, energy debit, the
  per-run RNG seed, and successor gen-N+1 minting are the **kernel's** (P3 deferral, named first-consumers).

## Decisions explicitly NOT made (deferred)

- **`/phase-exit P5` full gate** — DEFERRED (timing routed to the human via the lead). Phase-5 acceptance
  criteria are met at the code/unit level, but the arch-drift + reachability + spec-coverage auditor fan-out
  needs the P3/P4 runtime+verifier wiring (gated on merge). The track is deliberately deferral-seam'd, so the
  gate would over-approximate to the accumulated track diff with end-to-end reachability unverifiable.
  Recommendation: seal + tick tasks now; run `/phase-exit P5` after P3/P4 merge enables end-to-end.
- **Runtime/verifier wiring** — the P3 generation loop is the named first-consumer of every selection
  surface (supplies the seed/emitter/newId, applies state transitions, mints gen N+1, emits the generation
  lifecycle); real-Postgres integration tests ride that P3 slice. Cross-track, not in scope here.

## Open follow-ups → routed at this close-out (integration handoff to lead → cody)

All shared-root-doc edits route to the integration checkout (cody) per the multi-track carve-out — NOT
committed on `track/selection`. Full apply-ready content in the close-out handoff message:
- **IMPLEMENTATION_PLAN.md (cody):** tick P5.1 (via-P0) + P5.2–P5.11; Log entry; Carry-forward triage
  (DELETE held-out-judge-LOAD [consumed] + IDs-opaque selection-side; ADD contract-track NaN-test pointer);
  Phase-5 box gated on `/phase-exit P5`.
- **ARCHITECTURE.md (cody):** the §8/§5/§7/§3/§14 selection arch-notes (formulas, fusion contract, dispatch
  rule, caps-clamp-as-hint, etc.).
- **apps/api/LESSONS.md + CLAUDE.md index (cody):** the curated selection convention lessons, provisionally
  numbered from §33 (per-track numbering; renumber-on-merge to the next free cody slot).

## This round's terminal commit (track/selection)

Orchestrator round commit sweeps the 10 `docs/briefs/selection-00N-*.md` (the per-slice design-decision
audit trail) + this orchestrator session doc. No shared-root-doc edits on this branch (they route to cody).
