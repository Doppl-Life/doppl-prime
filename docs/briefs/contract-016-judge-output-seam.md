# /tdd brief — judge_output_seam_amendment

## Feature
**AMEND the Phase-0 freeze (2nd amendment; human-ratified Option A, surfaced by the selection track):** add the held-out judge's persisted **ACCEPTANCE OUTPUT** to the frozen contracts. The judge's INPUT was frozen (P0.15 `FinalJudgeRubric` + the `final_judge` `ModelRole` + the `judge.review_started` operation-start marker) but its OUTPUT had **no model + no terminal event type** — P4.8 (verifier, the producer) and P5.5 (selection, the consumer) both reference a "persisted judge event" that did not exist. Add: (1) NEW frozen `JudgeResult` model; (2) NEW terminal `judge.reviewed` on the closed `RunEventType` enum (36→37) + `CURRENT_SCHEMA_VERSION` 2→3; (3) per-type narrowing `judge.reviewed`←`JudgeResult` (high-traffic 6→7). `FitnessScore` is **UNCHANGED** (judge link is by-join, like the novelty link). **INVARIANT-TOUCHING** (rule #6 held-out-judge immutability + rule #5 untrusted-output-validated + closed-union closure RISK-006 + schemaVersion). SOLO — own commit, never bundled; security-reviewer at Step 8.

## Use case + traceability
- **Task ID:** P0.16 (NEW task under Phase 0 — see the P0.16 entry + the dated Log re-seal entry)
- **Architecture sections it implements:** `ARCHITECTURE.md §7` (held-out judge output persisted as `JudgeResult` via `judge.reviewed`, schema-validated rule #5) + `§8` (fitness references `judge.reviewed` like `novelty.scored`) + Appendix-A (`JudgeResult` row + `RunEventType`/payload-map row updates) + `§4` (the registry + per-type payload map). The downstream emit/consume requirements stay per-phase bullets in P4.8 (verifier) / P5.5 (selection) — NOT this slice; this slice only freezes the contract.
- **Related context:** Corrects the freeze BEFORE verifier/selection build against the seam (LESSONS §19 playbook, 2nd application — forking from a freeze the plan already contradicts would force a post-fork schemaVersion bump + a cross-track Finding). Field shape co-designed via the human conduit (no cross-track DMs — channel-bleed). Reuses lesson §1 (closed enum + member-set snapshot), §5 (shared union once — axisScores derives from `FinalJudgeAxis`), §9 (no-authority-field via strict), §12/§17 (immutability-via-versioning + agent-immutable anchor), §13 (authoritative-once-computed → required for replay), §15 (payload-map narrowing layer), §18 (validator returns parsed value). `JudgeResult` mirrors `NoveltyScore` (the authoritative-scoring sibling); `judge.reviewed`←`JudgeResult` mirrors `novelty.scored`←`NoveltyScore`.

## Acceptance criteria (what "done" means)
- [x] NEW `JudgeResult` (`src/verifier/judge-result.ts`): strict 7-field {id, candidateId, axisScores, acceptance, rubricPolicyVersion, providerMeta, langfuseTraceId?}; `z.infer` type; barrel-exported.
- [x] `axisScores` = `z.record(FinalJudgeAxis, z.number())` — per-axis 0-5 over the **closed 5 axes** (derived from the single-source `FinalJudgeAxis`, lesson §5); Zod v4 makes it exhaustive+closed → all 5 required, unknown axis rejected (rule #6 defense-in-depth). 0-5 range stays a runtime concern (lesson §6).
- [x] `acceptance` = `z.number()` (the overall metric selection consumes); `rubricPolicyVersion` = `string.min(1)` typed identically to `FinalJudgeRubric.policyVersion` (immutability-via-versioning); `providerMeta` = shared `ProviderMeta` (lesson §5, no-secret rule #4), REQUIRED; `langfuseTraceId?` optional non-empty.
- [x] NEW terminal `judge.reviewed` on the closed `RunEventType` (36→37); each member parses, unlisted rejected (closure RISK-006). `CURRENT_SCHEMA_VERSION` 2→3 (literal-pinned). It is NOT a marker (markers fall back to generic; this narrows).
- [x] Per-type narrowing `judge.reviewed`←`JudgeResult` in `payload-map.ts` (high-traffic 6→7) — same schema validates write + model (mirrors novelty.scored←NoveltyScore); marker/terminal split pinned (`judge.review_started`=generic, `judge.reviewed`=narrowed).
- [x] **Rule #5/#7:** strict → malformed judge output rejected at persist; `axisScores`+`acceptance` REQUIRED so replay reads them, never re-judges (lesson §13). **Rule #6:** NO rubric/weights/immutableToAgents/scoreOverride field representable.
- [x] **FitnessScore UNCHANGED** — fitness references `judge.reviewed` by `candidateId` join + `components.judge_acceptance` (NOT a duplicate authoritative copy; `judgeResultId` strict-rejected), exactly as it references `novelty.scored`.
- [x] **§2.5 seam snapshots in lockstep** (tagged `spec(§7)`/`spec(§4)`): member-set 36→37 (`field-sets.test.ts` `EVENT_TYPE_SNAPSHOT`, `event-type.test.ts` REGISTRY); high-traffic 6→7 (`payload-map-field-sets.test.ts`, `payload-map.test.ts`); NEW `JudgeResult` field-name snapshot (`field-sets.ts` + `contract-surface.test.ts` `OBJECT_MODELS`); canonical fixtures `validJudgeResult` + `validJudgeReviewedEnvelope` + `payload:judge.reviewed` registry entry; `CURRENT_SCHEMA_VERSION === 3` + envelope forward-compat (v1/v2/v3 parse).
- [x] All unit + contract tests pass (175); `/preflight` clean (package-pinned binaries — lesson §14).

## Wiring / entry point (Step 7.5)
Entry point = the `@doppl/contracts` barrel re-exports `JudgeResult` (+ `z.infer` type), the extended `RunEventType`, the bumped `CURRENT_SCHEMA_VERSION`, the extended `HIGH_TRAFFIC_PAYLOAD_MAP`/`resolvePayloadSchema`, the new fixtures, and the `JudgeResult` field-set snapshot. The judge's runtime emit (P4.8 verifier) + fitness consume (P5.5 selection) land in the downstream tracks after they merge cody. `none — runtime emit/consume wiring lands in P4.8/P5.5 by design`. Reachability = barrel-exported + member-set snapshot + high-traffic snapshot + field-set lockstep + fixture validation + payload narrowing round-trip.

## Files touched
**New:**
- `packages/contracts/src/verifier/judge-result.ts` — the `JudgeResult` model.
- `packages/contracts/test/verifier/judge-result.test.ts` — its RED-first behavioral spec (11 tests).

**Modified:**
- `src/events/event-type.ts` — add `judge.reviewed` (36→37, terminal not marker).
- `src/version.ts` — `CURRENT_SCHEMA_VERSION` 2→3.
- `src/events/payload-map.ts` — `judge.reviewed`←JudgeResult (6→7) + comment fixes.
- `src/__schema-snapshots__/field-sets.ts` — `JudgeResult` field-set.
- `src/test-fixtures/index.ts` — `validJudgeResult` + `validJudgeReviewedEnvelope` + 2 `CANONICAL_FIXTURES` entries.
- `src/index.ts` — barrel export.
- `test/__schema-snapshots__/{field-sets,payload-map-field-sets,contract-surface}.test.ts`, `test/events/{event-type,payload-map,envelope}.test.ts`, `test/test-fixtures/fixtures-valid.test.ts` — count bumps (37 / 7 / v3) + new assertions.

## RED test outline (Step 2) — `test/verifier/judge-result.test.ts`
1. **accepts the canonical valid judge result** *(positive-guard-first, lesson §10)*.
2. **strict — rejects an unknown field** *(lesson §9)*.
3. **requires id/candidateId/acceptance/rubricPolicyVersion/providerMeta/axisScores** + non-empty strings *(rule #5/#7)*.
4. **axisScores requires ALL five closed FinalJudgeAxis keys** *(completeness, rule #6/#5)*.
5. **axisScores rejects an unknown axis key** *(rule #6 — agent cannot add a judging axis)*.
6. **axisScores values must be numbers** *(shape only; range is runtime, lesson §6)*.
7. **rubricPolicyVersion ties to the rubric version** *(immutability-via-versioning, lesson §12/§17)*.
8. **providerMeta reuses shared ProviderMeta + no secret** *(rule #4, lesson §5)*.
9. **langfuseTraceId optional but non-empty when present**.
10. **represents no scoring-authority field** *(rule #6, lesson §9)*.
11. **judge.reviewed narrows to JudgeResult + round-trips a valid envelope** *(spec §4)*.
Plus, in `payload-map.test.ts`: **fitness_scored_payload_links_judge** *(spec §8 — by-join link, `judgeResultId` strict-rejected, mirrors the novelty link)*.

## Cross-doc invariant impact
- **Model changes:** NEW `JudgeResult` (§7/§8); `RunEventType` 36→37; `HIGH_TRAFFIC_PAYLOAD_MAP` 6→7; `CURRENT_SCHEMA_VERSION` 2→3. `FitnessScore` UNCHANGED.
- **§2.5-seam touched?** **YES** — new shared verifier→selection model + registry + payload map. Snapshots updated in lockstep.
- **Orchestrator doc rows (single operator authored):** `ARCHITECTURE.md` §7/§8 + Appendix-A (`JudgeResult` row + RunEventType/payload-map row updates); `apps/api/CLAUDE.md` cross-doc table (new `JudgeResult` row + RunEventEnvelope/RunEventType/payload-map row fixes + lessons index §20); `IMPLEMENTATION_PLAN.md` P0.16 + Log. **Safety-relevant:** any closure break, any way an agent moves a judging axis / scoring authority through the output, any secret-smuggle, or a missing required field that lets replay re-judge is a Finding.

## Step-8 reviewer policy
**security-reviewer: FAN OUT** — invariant slice (rule #6 anchor + rule #5 untrusted-output + closed registry). **Result: PASS, 0 findings** (rules #2/#4/#5/#6/#7 verified; empirical confirmation that Zod 4.4.3's enum-keyed record is exhaustive+closed; advisory: gate a Zod major bump as safety-relevant). `code-quality-reviewer`: ran (effective phase-boundary) — 2 in-slice fixed (stale comment, weak assertion), 3 doc-staleness fixed in re-seal.

## Decisions (ratified)
1. **axisScores = `z.record(FinalJudgeAxis, z.number())`** (vs explicit 5-field strictObject) — derives the closed axis set from one source (lesson §5), exhaustive+closed in Zod v4. ⚠ version-dependent; gate a Zod major bump.
2. **FitnessScore UNCHANGED** (vs adding a reference field) — judge link by `candidateId` join + `components.judge_acceptance`, mirroring the deliberately-field-less novelty link.
3. **acceptance = scalar `z.number()`** (becomes `components.judge_acceptance`); permissive range (lesson §6). **providerMeta required** + a separate optional `langfuseTraceId` (mirrors ModelGatewayResponse). No `runId`/`generationId` on the model (envelope-level, like Novelty/Fitness).

## Dependencies + sequencing
- **Depends on:** P0.1 (RunEventType/envelope/version), P0.8 (FitnessScore/ScoringPolicy), P0.10 (payload map), P0.14 (contract-test surface), P0.15 (FinalJudgeRubric/FinalJudgeAxis).
- **Blocks:** P4.8 (verifier — produces `JudgeResult` + emits `judge.reviewed`) and P5.5 (selection — consumes the acceptance). After this lands → delta-scoped re-`/phase-exit P0` + re-seal; then **merge track/contract→cody**; verifier + selection `git merge cody` before building against the seam.

## Estimated commit count
**1** code (`feat`) + **1** docs (`docs` re-seal), mirroring the P0.1-amend two-commit split. Non-breaking (additive enum + new narrowing; readers accept `schemaVersion ≤ current`) → `feat`, not `feat!`. Never bundled with feature work.
