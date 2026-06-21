# contract-003 — Phase-0 freeze AMENDED (2nd): held-out-judge output seam (JudgeResult + judge.reviewed)

- **Date:** 2026-06-21
- **Phase:** Phase 0 (shared contracts & event model) — re-amended (P0.16); freeze re-sealed at schemaVersion 3
- **Track:** `contract` (worktree `Capstone-contract`, branch `track/contract`)
- **Predecessor:** [contract-002-2026-06-21-p0-payload-map-entities-lineage-judge-surface.md](contract-002-2026-06-21-p0-payload-map-entities-lineage-judge-surface.md)
- **Successor:** _(none yet — after merge to cody, verifier P4.8 + selection P5.5 build against the seam)_
- **Mode:** single operator on the contract track (no contract team registered; verifier/selection/kernel/demo teams live in their own worktrees)

## Why this session existed

Cross-track contract amendment, **human-ratified Option A**, surfaced by the **selection track** as a blocker. The held-out judge's INPUT was frozen (P0.15 `FinalJudgeRubric` + the `final_judge` `ModelRole` + the `judge.review_started` operation-start marker) but its ACCEPTANCE OUTPUT had no frozen model and no terminal event type. P4.8 (verifier, producer) was to "persist the judge event" and P5.5 (selection, consumer) to "read the persisted judge event" — but nothing was defined to persist or read. That broke the §2.5 verifier→selection seam (LESSONS §20), judge replay-faithfulness, and §8 explainability, and transitively blocked the P5 scoring chain (P5.5→P5.6→P5.7→P5.9/10/11). The held-out judge is the anti-reward-hacking anchor (rule #6), so its output deserves a first-class, policyVersioned, replay-faithful persisted record. Amended BEFORE verifier/selection build against it (LESSONS §19 playbook, 2nd application).

## What was built

### Files created
- `packages/contracts/src/verifier/judge-result.ts` — `JudgeResult`: strict 7-field {id, candidateId, axisScores, acceptance, rubricPolicyVersion, providerMeta, langfuseTraceId?}. Mirrors `NoveltyScore` (the authoritative-scoring sibling). `axisScores`=`z.record(FinalJudgeAxis, z.number())` (exhaustive+closed over the 5 axes); `acceptance`=`z.number()`; `rubricPolicyVersion`=`string.min(1)` (= `FinalJudgeRubric.policyVersion` typing); `providerMeta`=shared `ProviderMeta` (required).
- `packages/contracts/test/verifier/judge-result.test.ts` — 11 behavioral tests (RED-first).

### Files modified
- `src/events/event-type.ts` — added terminal `judge.reviewed` to the closed `RunEventType` (36→37; not a marker).
- `src/version.ts` — `CURRENT_SCHEMA_VERSION` 2→3.
- `src/events/payload-map.ts` — `judge.reviewed`←`JudgeResult` in `HIGH_TRAFFIC_PAYLOAD_MAP` (6→7); doc-comment fixes incl. "7 narrowed models".
- `src/__schema-snapshots__/field-sets.ts` — `JudgeResult` field-name set.
- `src/test-fixtures/index.ts` — `validJudgeResult` + `validJudgeReviewedEnvelope` + 2 `CANONICAL_FIXTURES` entries (`JudgeResult`, `payload:judge.reviewed`).
- `src/index.ts` — barrel export `./verifier/judge-result`.
- Tests: `test/__schema-snapshots__/{field-sets,payload-map-field-sets,contract-surface}.test.ts`, `test/events/{event-type,payload-map,envelope}.test.ts`, `test/test-fixtures/fixtures-valid.test.ts` — count bumps (37 / 7 / v3), `fitness_scored_payload_links_judge`, the judge marker/terminal split, envelope v3 forward-compat.

Full suite **163 → 175** (+12).

### Commits (this round, on `track/contract`)
_(Not yet committed — working tree prepared; awaiting user direction on commit + merge-to-cody. Planned, mirroring P0.1-amend's two-commit split:)_
| Planned | Type | What |
|---|---|---|
| code | `feat(contracts)` | JudgeResult + judge.reviewed + schemaVersion 3 + payload narrowing + snapshots/fixtures (P0.16) |
| docs | `docs(tasks)` | Phase-0 re-seal: ARCHITECTURE Appendix-A/§7/§8 + CLAUDE.md cross-doc + IMPLEMENTATION_PLAN P0.16/Log + LESSONS §20 + brief/session |

## Decisions made (ratified via the human conduit)
- **`axisScores` = `z.record(FinalJudgeAxis, z.number())`** (vs an explicit 5-field strictObject). Derives the closed axis set from the single-source `FinalJudgeAxis` (lesson §5). Verified empirically against the pinned **Zod 4.4.3**: an enum-keyed record is exhaustive (rejects a missing axis) + closed (rejects an unknown axis) → rule #6 defense-in-depth at the persist boundary. ⚠ This is Zod-v4-version-dependent (not v3) — a Zod major bump must re-run the contract tests (banked in lesson §20 + the CLAUDE.md row).
- **`FitnessScore` UNCHANGED** (vs adding a reference field). Fitness references `judge.reviewed` by the shared `candidateId` join + the named `components.judge_acceptance` signal, exactly as it references `novelty.scored` — the precedent deliberately rejected a `noveltyScoreId` field. Pinned by `fitness_scored_payload_links_judge` (a `judgeResultId` field is strict-rejected).
- **`acceptance` = scalar `z.number()`** (becomes `components.judge_acceptance`); permissive range (the 0-5/0-1 scale is a runtime/scoring concern, lesson §6, like `NoveltyScore.score`). **`providerMeta` required** (every gateway-routed judge call has provenance; replay reads it) + a separate optional `langfuseTraceId` (mirrors `ModelGatewayResponse`). No `runId`/`generationId` on the model (envelope-level, like Novelty/Fitness).
- **`judge.reviewed` is a terminal lifecycle type, NOT a marker** — it narrows to a model and is the §2.5 seam; the marker/terminal split (`judge.review_started`=generic, `judge.reviewed`=narrowed) is pinned.

## Verification
- `/preflight`: **format ✓ (pinned prettier), lint ✓, typecheck ✓, 175/175 tests ✓.**
- **security-reviewer fan-out: PASS, 0 findings** — rules #2 (closed registry, forward-compatible), #4 (no-secret ProviderMeta), #5 (untrusted-output strict-validated at persist), #6 (no scoring-authority field; closed axis set; rubricPolicyVersion tie), #7 (axisScores+acceptance required → replay reads, never re-judges). Empirically confirmed the enum-keyed-record exhaustiveness/closure + that bare `z.number()` rejects NaN/Infinity (replay-determinism hardening).
- **code-quality-reviewer: 5 findings.** 2 in-slice **fixed** (stale "6 narrowed models" comment → 7; weak `toBeDefined()` → `toEqual(validJudgeResult)`); 3 orchestrator-territory doc-staleness **fixed in this re-seal** (CLAUDE.md `CURRENT_SCHEMA_VERSION=2`→3, RunEventType row 36→37 + judge.reviewed, missing `JudgeResult` row).

## Cross-doc invariant changes (authored as single operator)
- `ARCHITECTURE.md`: Appendix-A `JudgeResult` row + `RunEventType`/payload-map row updates; §7 (judge output persisted as JudgeResult via judge.reviewed) + §8 (fitness references judge.reviewed like novelty.scored).
- `apps/api/CLAUDE.md`: new `JudgeResult` cross-doc row; RunEventEnvelope (schemaVersion 3) / RunEventType (37) / payload-map (7) rows fixed; lessons index §20.
- `apps/api/LESSONS.md`: §20 banked. `IMPLEMENTATION_PLAN.md`: P0.16 task + dated Log re-seal entry.

## Observation flagged to the verifier track (not blocking)
There is **no `judge`/`verifier` member in the closed `Actor` union** (operator/runtime/agenome/critic/check_runner/selection_controller/system). The held-out judge emits `judge.reviewed` under `runtime` in the canonical fixture (the kernel orchestrates the held-out evaluation outside the breeding loop — deliberately not `critic`, which is reserved for the rotating council). The actor↔event-type pairing is a runtime rule (§6), not a contract constraint, so this is illustrative. If a dedicated `judge` actor is wanted that is a separate `Actor`-union freeze amendment — flagging for P4.8 to decide.

## Next
1. Delta-scoped re-`/phase-exit P0` for P0.16 (verify new member agrees code↔snapshot↔doc; the prior full fan-out stands for the unchanged surface) + re-seal.
2. **Merge `track/contract` → cody** as the authoritative source (check cody's working tree for uncommitted shared-doc divergence first).
3. verifier + selection `git merge cody` to pull the amended contract before building P4.8 / P5.5. No track builds against the seam until that merge lands.
