# Session verifier-001 — Phase 4 verifier council & checks (first verifier-track session)

- **Date:** 2026-06-21
- **Phase:** Phase 4 (Verifier council & checks) — `ARCHITECTURE.md §7`
- **Track:** `verifier` (worktree `Capstone-verifier`, branch `track/verifier`)
- **Predecessor session:** `kernel-001-2026-06-21-freeze-bundle.md` (the kernel freeze bundle that forked this track)
- **Successor session:** `verifier-002-2026-06-21-p4-check-adapters-grounding-live-rerun.md` (P4.9/P4.10/grounding/P4.11)

## Why this session existed

The kernel freeze bundle (P1+P2) merged to integration (`e638d81`), unblocking the verifier
fork. This session built the **buildable-now** slice of Phase 4 — the safety pins + load-bearing
evidence/judge mechanisms that depend only on frozen contracts (P0) + the gateway stub (P2.9) +
the event-store append path (P1.3), with **no P3/P5/retrieval dependency**. The remaining P4 work
(P4.7 critic rotation, P4.9/P4.10 grounding adapters, P4.11 live-rerun) is P3/retrieval/demo-gated
and was deliberately not attempted.

## What was built

Six slices landed (5 commits — P4.5 bundles the registry + run-harness as one safety mechanism):

### Files created

| File | Slice | Purpose |
|---|---|---|
| `src/verifier/isolation/candidate-as-data.ts` | P4.4 | `assembleIsolatedRequest` — the single no-bypass injection-isolation chokepoint (candidate as sentinel-wrapped DATA; instruction candidate-independent) + `ISOLATION_DATA_FRAMING` |
| `src/check-runners/registry.ts` | P4.5 | Closed boot-fixed `CHECK_RUNNER_REGISTRY` (non-executing descriptors) + parallel frozen `CHECK_RUNNER_IMPLS` pure-fn map; re-exports `resolveCheckAdapter` |
| `src/check-runners/run-check.ts` | P4.5 | `runCheck` harness — resolve → `check.started` → run-or-skip → exactly one validated `check.completed` |
| `src/verifier/judge/rubric.ts` | P4.3 | `loadJudgeRubric` (full-5-axis-set + `immutableToAgents` re-assert, field-identifying error) + deep-frozen `DEFAULT_JUDGE_RUBRIC` |
| `src/verifier/council/critic-call.ts` | P4.6 | `runCriticCall` — per-mandate: started marker → isolation-seam request → gateway.call → assemble+validate `CriticReview` → reviewed/rejected; `serializeCandidate` |
| `src/verifier/council/run-council.ts` | P4.6 | `runCouncil` (iterate injected mandate set → `CriticReview[]`) + `MANDATE_INSTRUCTIONS` |
| `src/verifier/judge/judge-call.ts` | P4.8 | `runJudge` — load immutable rubric → seam request (`final_judge`) → gateway → per-axis validate → deterministic weighted acceptance metric → `judge.review_started` marker; `JudgeModelOutput`/`JudgeAcceptance` |
| `test/unit/verifier/isolation/candidate-as-data.test.ts` | P4.4 | 8 unit |
| `test/unit/check-runners/registry.test.ts` · `run-check.test.ts` | P4.5 | 5 unit |
| `test/integration/check-runners/run-check.test.ts` | P4.5 | 4 integration (real PG) |
| `test/unit/verifier/judge/rubric.test.ts` | P4.3 | 8 unit |
| `test/unit/verifier/council/critic-call.test.ts` · `run-council.test.ts` | P4.6 | 7 unit |
| `test/integration/verifier/council/run-council.test.ts` | P4.6 | 4 integration (real PG) |
| `test/unit/verifier/judge/judge-call.test.ts` | P4.8 | 8 unit |
| `test/integration/verifier/judge/run-judge.test.ts` | P4.8 | 2 integration (real PG) |

### Commits (branch `track/verifier`)

| Hash | Slice | Tests |
|---|---|---|
| `860567f` | P4.4 prompt-injection isolation seam | +8 unit |
| `89ab697` | P4.5 check-runner allowlist registry + run harness | +5 unit +4 integration |
| `82d9339` | P4.3 held-out-judge rubric-load + default rubric | +8 unit |
| `2c52c32` | P4.6 critic council orchestrator | +7 unit +4 integration |
| `96e762c` | P4.8 held-out judge runner | +8 unit +2 integration |

Final suite: **68 unit / 28 integration** (started 32 unit / 18 integration; +36 unit, +10 integration).

### Files modified

- none (all slices are new files; consumed frozen contracts + existing event-store/gateway only).

## Decisions made

- **P4.4 Q1–Q4 (defaults):** one module importing the frozen sentinel (no `sentinel.ts`); system-message data-framing; generic `assembleIsolatedRequest({role,instruction,candidate,schema?,maxTokens?})` core (role-general — serves critic + judge); thread `schema`/`maxTokens` omit-if-undefined. +1 test (8 vs 7) for the threading.
- **P4.5 Q1–Q5 (defaults):** separate frozen `CHECK_RUNNER_IMPLS` pure-fn map parallel to the descriptor registry (rule #3 — no code on the descriptor); `unregistered_adapter` + new `execution_required` fixed skip reasons (never the untrusted id); `check.started` payload `{adapterId,checkType,candidateId}` actor `check_runner`; runCheck builds both envelopes via `store.append`; +1 `EXECUTION_REQUIRING_ADAPTER_ID` descriptor (placeholder) to demonstrate the registered-but-no-impl skip path.
- **P4.3 Q1–Q4 (defaults):** full-axis-set check = `length===5 && Set===5 members`; frozen in-code `DEFAULT_JUDGE_RUBRIC` (deep-frozen); `immutableToAgents` re-assert read through an `unknown`-typed local (a real runtime check, not dead code the `z.literal(true)` narrowing elides); load+validate only.
- **P4.6 Q1–Q5 (defaults) + a metadata reconciliation:** council sets trusted `{id,candidateId,mandate}` (deterministic id `critic-review:{runId}:{candidateId}:{mandate}`), model fills evidence via a permissive strip-parse `CriticModelOutput`; closed `MANDATE_INSTRUCTIONS`; canonical candidate serialization. **Brief over-specification corrected (orchestrator-confirmed):** `critic.reviewed` payload is the strict `CriticReview` (no providerMeta slot) — so the provider-call handle rides `envelope.correlationId ← providerMeta.gatewayRequestId` (+ `langfuseTraceId`), full `ProviderMeta` deferred to P3's `EnergyEvent` (rule #8). **Blessed PROVISIONAL** pending P3 `correlationId` semantics.
- **P4.8 Q1–Q4 (defaults):** per-axis `JudgeModelOutput` + **test-local** fake gateway (did NOT touch the shared cross-track `fixtures.ts`); marker actor `selection_controller` (the 7-role union has no `judge` member); `JudgeAcceptance = {axisScores, acceptanceMetric, policyVersion}`; **the runner computes the weighted aggregate itself** (model supplies axis scores only — rule #6 + replay); acceptance metric = `Σ over rubric.axes of axisScores×weights` (energy_efficiency excluded — it is selection's FitnessScore component, not a judge axis).

## Decisions explicitly NOT made (deferred)

- **P4.7 critic-set rotation, P4.9/P4.10 grounding check adapters, P4.11 live-rerun** — P3/retrieval/demo-gated; not attempted this session. The mandate set (P4.7) and the check descriptor+impl pairs (P4.9/P4.10) are injected/registered later.
- **Energy debit + `fitness.scored` persistence** — P3 kernel ledger (rule #8) + selection P5 own these; the verifier slices emit markers + RETURN their evidence/acceptance.
- **Production `final_judge` fake fixture → per-axis** — deferred to P3 judge-wiring (current shared `fixtures.ts` `{score:3}` left untouched).

## TDD compliance

**Clean — no violations.** Every slice followed RED (confirmed failing for the right reason — missing module/export) → Step-2.5 orchestrator review (APPROVED before GREEN) → GREEN → full suite → security-reviewer → commit. One latent test bug (a bogus `DEFAULT_JUDGE_RUBRIC` import from `@doppl/contracts` in the P4.8 test — that const is app-level) was caught at RED and removed before GREEN. Integration slices ran against the **real** testcontainers Postgres (no load-bearing mocks on the truth path).

## Reachability

All slices are pure mechanisms / runners whose first production callers are later phases (named-deferral, lesson 20 pattern). No silent tested-but-unwired gaps — each is the deliverable surface, exercised end-to-end where it persists:

| Feature | Reachable from / entry point |
|---|---|
| P4.4 `assembleIsolatedRequest` | First consumers P4.6 council (`critic-call.ts`) + P4.8 judge (`judge-call.ts`) — both wired this session; the no-bypass chokepoint |
| P4.5 `runCheck` / registry | First callers P4.9/P4.10 (register descriptor+impl pairs) + P3 verifying phase; exercised end-to-end via the real-PG integration test |
| P4.3 `loadJudgeRubric` / `DEFAULT_JUDGE_RUBRIC` | First consumers P4.8 `runJudge` (wired this session) + P3 boot (loads the const once) |
| P4.6 `runCouncil` | First consumer P3 verifying phase (per-candidate, P4.7-rotated mandate set); exercised end-to-end via real-PG integration |
| P4.8 `runJudge` | First consumers selection P5 (folds `JudgeAcceptance` into `fitness.scored`) + P3 scoring phase; exercised end-to-end via real-PG integration |

## Open follow-ups (Step-9 categorized — already routed hot to the orchestrator)

- **Convention candidates** → orchestrator banking as LESSONS §27 (app-layer isolation chokepoint — already written), §28-pending (closed descriptor-registry + parallel impl-map), §29-pending (immutable-anchor load path), §30-pending (gateway-routed evidence producer owns identity), §31-pending (judge runner computes its own aggregate).
- **Architecture-doc notes** (orchestrator writes hot at `/orchestrate-end`): §7/§14 name the isolation chokepoint module; §7 name the check registry + run-harness; §7/§14 name `loadJudgeRubric`/`DEFAULT_JUDGE_RUBRIC`; §7 name the council modules; **§4/§13 PROVISIONAL** — the LLM-event metadata convention `providerMeta.gatewayRequestId → envelope.correlationId` (+ `langfuseTraceId`), flagged for cross-track reconciliation if P3/P6 pin `correlationId` differently; §4/§7 — the held-out judge emits under `selection_controller` + the no-`judge.reviewed`/acceptance-rides-`fitness.scored` seam.
- **Carry-forward consumed:** the held-out-judge-LOAD pointer is **P4-CONSUMED** (P5 portion still open) — P4.3 + P4.8 enforce no-agent-write + full-axis-set + `immutableToAgents:true` before scoring.
- **Cross-track carry-forward (→ selection P5):** P5 folds the returned `JudgeAcceptance` into `FitnessScore.components` (agreed key e.g. `judge_acceptance` + per-axis breakdown) and persists `fitness.scored` (the rule-#7 replay home). The OPEN `components` record is the designed seam — no frozen-contract gap.
- **P4.3 [low] (security-reviewer) → consumed by P4.8:** the rubric-source-provenance obligation (`loadJudgeRubric` fed ONLY the immutable const, no agent-derived path) is honored + pinned by `runJudge`'s default + `test_rubric_source_is_immutable_default_only`.
- **Future TODO (P3-wiring):** production `final_judge` fake fixture → per-axis; P4.7 rotation feeds the council its per-generation mandate set deterministically under the run seed; P4.9/P4.10 grounding adapters persist retrieval outcomes into the originating event (rule #7).
- **Cross-doc invariant changes this session: NONE** — every slice consumes frozen contracts; all flagged `NONE` at Step 9 (orchestrator confirmed). No Appendix-A change.

## Phase status

Phase 4 is **PARTIAL** (P3-blocked). Shipped: P4.3, P4.4, P4.5, P4.6, P4.8. Remaining (gated): P4.7, P4.9, P4.10, P4.11. The `/phase-exit P4` gate stays **OPEN** — orchestrator's call at `/orchestrate-end`.
