# /tdd brief — score_seam_wiring (selection → P3 generation loop, score port)

## Feature
Implement selection's real **score-seam adapter** — a `createScoreSeam(deps) → ScoreSeam` factory whose returned function conforms to the kernel's injected `ScoreSeam` port (`generationLoop.ts:98`, called at `:447`). It drives one generation's scoring end-to-end over real persisted events: per candidate `scoreNovelty` (gateway embedding → `novelty.scored` / degrade) → read the candidate's verifier/energy evidence back from the log → compose the five fitness components (incl. the **held-out-judge acceptance candidateId join**) → `scoreFitness` (→ `fitness.scored`) → after all candidates, `cull` (→ `lineage.culled`). This is the deferred "computed within the generation scoring state" wiring from P5.2–P5.7, now that the P3 loop + P4 verifier producers have merged.

## Use case + traceability
- **Task ID:** P5.6, P5.7
- **Architecture sections it implements:** `ARCHITECTURE.md §8` (selection/scoring/cull — the score path's home).
- **Related context:**
  - The kernel loop is **pure orchestration over injected seam ports** — it appends only kernel events and consumes seam-owned events (`novelty.scored`/`fitness.scored`/`lineage.culled`) as DATA, never authoring them (LESSONS **§64**; §2.5 boundary as code shape, rule #9). The score-seam is selection's real impl of that port.
  - Seam = a TS interface whose I/O ARE the frozen contracts; conformance via an in-test `implements` fake + a real wiring impl (LESSONS **§20**).
  - Fake the provider layer, not the discipline — drive the integration test's embeddings through a fake `providerCall` injected into the REAL `createGateway` (LESSONS **§24**), so the genuine structured-output discipline runs.
  - Held-out-judge acceptance: selection reads `JudgeResult.acceptance` VERBATIM, never recomputes (rule #6); the value also surfaces as `FitnessScore.components.judge_acceptance` by **candidateId join**, not a duplicate authoritative copy (LESSONS **§42**, **§13**). The producer is verifier `judge/judge-call.ts` (`judge.reviewed`←`JudgeResult`, already merged).
  - The composed selection fns are already built + unit-green (P5.2–P5.7); this slice WIRES them to real deps — no new scoring math.
- **Composes (do not reimplement):** `scoreNovelty(input, {gateway, emit, newId})` · `energyEfficiency(EnergyEvent[])` · `criticScores(CriticReview[])` · `judgeAcceptance(JudgeResult|undefined, FinalJudgeRubric)` · `scoreFitness(input, ScoringPolicy, {emit, newId})` · `cull(input, CullPolicy, {emit, newId})` — all exported from `apps/api/src/selection/index.ts`.

## Acceptance criteria (what "done" means)
- [ ] `createScoreSeam(deps: ScoreSeamDeps): ScoreSeam` returns a `(candidates, ctx) => Promise<void>` matching the kernel's `ScoreSeam` type imported from the runtime (`generationLoop.ts`) — structural conformance pinned by an in-test `const seam: ScoreSeam = createScoreSeam(...)` assignment.
- [ ] `ScoreSeamDeps` = `{ gateway: ModelGateway; readByRun: EventStore['readByRun']; policy: ScoringPolicy; rubric: FinalJudgeRubric; cullPolicy: CullPolicy; newId: () => string }` — the immutable `policy`/`rubric` are INJECTED (loaded from immutable config by the W3 boot root, never an agent-writable path — rule #6/§14); the seam validates the rubric via the existing `judgeAcceptance` load gate, it does not own the loader.
- [ ] Per candidate (in the order received), the seam calls `scoreNovelty` with `emit = ctx.append` (the `AppendInput`→`AppendResult{sequence}` shape satisfies `NoveltyEmitter`) → exactly one `novelty.scoring_started` + one `novelty.scored` (happy path) OR one `novelty_scoring_degraded` (embed-failure path) is appended via `ctx.append`.
- [ ] The **comparison set** for candidate _i_ is the prior candidates already scored this generation, sourced from their persisted `NoveltyScore` (`vector` + `summary`) — see Step-2.5 Q1 for accumulate-in-seam vs read-from-log.
- [ ] For each candidate the seam reads its evidence back from `readByRun(runId)` and composes: `energyEfficiency` over the candidate's-agenome `energy.spent` (`EnergyEvent`), `criticScores` over the candidate's `critic.reviewed` (`CriticReview`), `judgeAcceptance(judgeResult, rubric)` where `judgeResult` is the candidate's `judge.reviewed` (`JudgeResult`) looked up **by candidateId** (undefined when absent → not-accepted-by-default boundary), and `checkResults` = the candidate's `check.completed` (`CheckResult[]`).
- [ ] `scoreFitness` is then called → exactly one `fitness.scored` appended carrying the composed `FitnessScore` (total + components incl. `judge_acceptance` + `policyVersion = policy.version`).
- [ ] After ALL candidates are scored, the seam builds `AgenomeFitness[]` (group scored candidates by `agenomeId`, each with its best-scored candidates + status — see Step-2.5 Q2) and calls `cull` → at most one `lineage.culled` (none culled → no event).
- [ ] The seam appends events ONLY through `ctx.append` (never a direct `db.insert`/event-table write — rule #2/#4) and emits NO `energy.spent` itself (the markers are no-debit — rule #8).
- [ ] **Replay-faithful inputs (rule #7):** every component is derived from PERSISTED events read via `readByRun` (no live counters), so the produced `fitness.scored` is reconstructable from the log. (The score-seam is the LIVE path; replay re-folds the persisted `novelty.scored`/`fitness.scored` via the existing replay-reader — this slice does not add a replay variant.)
- [ ] Integration test in `apps/api/test/integration/selection/score-seam.test.ts` passes against the **real Postgres** event store (testcontainers, LESSONS §25/§26 — no mock on the truth log).
- [ ] All unit/integration tests pass; `/preflight` clean (incl. `format:check` — LESSONS §50/§61).

## Wiring / entry point (Step 7.5)
The production entry point is the kernel's `ScoreSeam` port — `await seams.score(candidates, { runId, generationId, append: eventStore.append })` at `apps/api/src/runtime/loop/generationLoop.ts:447`. **The injection of `createScoreSeam(...)` into the loop's `seams.score` slot lands at the W3 boot-composition-root slice** (`selection-013`, POST /runs → runWorker). This slice proves reachability via the **integration test driving the returned `ScoreSeam` directly** with a real `EventStore` + a fake-gateway-backed `ModelGateway`, exactly as the loop will call it. Name this handoff in the test (`// first production caller: generationLoop.ts:447 seams.score, injected at selection-013 boot root`).

## Files expected to touch
**New:**
- `apps/api/src/selection/seams/score-seam.ts` — `createScoreSeam` + `ScoreSeamDeps`.
- `apps/api/test/integration/selection/score-seam.test.ts` — real-PG integration test.

**Modified:**
- `apps/api/src/selection/index.ts` — export `createScoreSeam` + `ScoreSeamDeps`.

If implementation needs files beyond this list (e.g. a small shared evidence-grouping helper), **flag at Step 2.5**.

## RED test outline (apps/api/test/integration/selection/score-seam.test.ts)
1. **`test_conforms_to_ScoreSeam_port`** — `const seam: ScoreSeam = createScoreSeam(deps)` compiles + runs. Asserts: structural conformance to the kernel port. Why: LESSONS §20/§64 (the seam's type IS the kernel contract).
2. **`test_emits_novelty_then_fitness_per_candidate`** — seed candidates (+ their critic/check/judge/energy events) in real PG; run the seam. Asserts: exactly one `novelty.scored` + one `fitness.scored` per candidate, appended via the store, in candidate order. Why: §8 + P5.2/P5.6 "computed within the generation scoring state."
3. **`test_judge_acceptance_join_by_candidateId`** — seed a `judge.reviewed` (`JudgeResult`, matching `rubricPolicyVersion`) for candidate A only. Asserts: A's `fitness.scored.components.judge_acceptance` == the persisted `JudgeResult.acceptance` VERBATIM; candidate B (no judge result) gets the not-accepted-by-default 0, flagged absent. Why: rule #6 + LESSONS §42/§13 (read verbatim, join not duplicate).
4. **`test_components_read_from_persisted_evidence`** — seed `energy.spent` + `critic.reviewed` + `check.completed`. Asserts: the `fitness.scored` components reflect the persisted values (energy-efficiency over actual spend; critic confidence-weighted mean; subtype-check pass ratio). Why: rule #7 (replay-reconstructable from the log, not live counters).
5. **`test_novelty_comparison_set_is_prior_scored_candidates`** — score ≥3 candidates. Asserts: candidate _i_'s `NoveltyScore.comparisonSet` == the ids of candidates 0..i-1; first candidate scores 1.0 (empty comparison). Why: §8 novelty (1 − max cosine over the prior set).
6. **`test_degrade_path_on_embed_failure`** — fake gateway rejects the embedding. Asserts: `novelty_scoring_degraded` appended (not `novelty.scored`), fitness still computed with the novelty component flagged estimated. Why: P5.3 never-block degrade.
7. **`test_cull_emits_once_after_all_scored`** — set `cullPolicy.minFitness` above one agenome's best total. Asserts: exactly one `lineage.culled` after the last `fitness.scored`, `targetIds` = the weak agenome, `scoreSnapshot` records its best total; a run with nothing below threshold appends NO `lineage.culled`. Why: §8 cull + the ≥1-targets kernel rule.
8. **`test_appends_only_via_store_no_energy_debit`** — Asserts: the seam never writes the event table directly and appends zero `energy.spent`. Why: rule #2/#4 (append-only via the writer) + rule #8 (markers are no-debit).

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes docs)
- **Model field changes:** none — consumes frozen `NoveltyScore`/`FitnessScore`/`ScoringPolicy`/`CullingEvent`/`CriticReview`/`CheckResult`/`JudgeResult`/`FinalJudgeRubric`/`EnergyEvent`/`CandidateIdea` unchanged (sv5 verified additive at this round's merge).
- **Orchestrator doc rows to write hot:** none (no contract field touched). A LESSONS candidate is likely (see below) — orchestrator banks at `/orchestrate-end`.
- **§2.5-seam (shared-contract) model touched?** No NEW/extended contract invariant — this is a consumer wiring slice; no schema-snapshot test owed.

## Things to flag at Step 2.5
1. **Comparison-set source — accumulate in-seam vs read-from-log.** The seam can carry the `NoveltyScore`s it produces this generation in a local array, OR re-read `novelty.scored` from `readByRun` before each candidate. My default vote: **accumulate in-seam** — simpler, byte-deterministic, avoids an O(n²) re-read; the just-emitted events are also in the log so both are equivalent, but the local accumulator is the cleaner single source for the live pass. Flag if you see a replay-consistency reason to prefer the log read.
2. **Agenome status for `cull`.** `cull` needs each agenome's `AgenomeStatus` to skip terminal ones, but the `ScoreSeam` ctx carries only `candidates` (each with `agenomeId`), not `Agenome` objects. Options: (a) derive status by folding agenome lifecycle events from `readByRun`; (b) treat every agenome that produced a candidate THIS generation as `active` (it just emitted work → non-terminal by construction). My default vote: **(b) pass `status:'active'`** for the candidates' agenomes — they are non-terminal by definition at score time, and the terminal-skip exists for cross-generation reuse the score path doesn't hit; document the assumption. Flag if you want the log-fold for defense-in-depth.
3. **`ctx.append` as the emitter directly.** `ctx.append: EventStore['append']` is `(AppendInput) => Promise<AppendResult{id,runId,sequence}>`; the selection emitters want `(Omit<RunEventEnvelope,'sequence'|'occurredAt'>) => Promise<{sequence}>`. `AppendInput` IS that Omit and `AppendResult` has `sequence`, so `ctx.append` satisfies all three emitters structurally. My default vote: **pass `ctx.append` directly** (no wrapper). Flag if TS variance needs a thin adapter.
4. **Component-event lookup keys.** `critic.reviewed`/`check.completed`/`judge.reviewed` key by `candidateId`; `energy.spent` keys by `agenomeId` (energy is agenome-scoped, §4/§5). My default vote: **filter `readByRun` rows by `type` then by the row's `candidateId` (critic/check/judge) or `agenomeId` (energy)**, `safeParse`-ing each payload against its frozen model (LESSONS §20/§31 — trust the write-time validation, re-parse defensively). Flag if a candidate maps to multiple agenomes (it shouldn't — `CandidateIdea.agenomeId` is single).
5. **Integration-test seeding — raw appends vs real seams.** The verifier `verify` seam isn't selection's to run; the test seeds `critic.reviewed`/`check.completed`/`judge.reviewed`/`energy.spent`/`candidate.created` directly via the store (a fixture log), mirroring what the real verify seam will have appended. My default vote: **seed via `store.append` with `CANONICAL_FIXTURES`-derived payloads** — keeps the test selection-scoped and deterministic. Flag if you'd rather drive a real verifier council in-test (heavier, cross-track).

## Dependencies + sequencing
- **Depends on:** the merged P3 generation loop (`generationLoop.ts` `ScoreSeam` port) + P4 verifier producers (`critic.reviewed`/`check.completed`/`judge.reviewed`) + the P5.2–P5.7 selection logic (all landed at this round's `git merge cody` → `fb15a7b`).
- **Blocks:** W2 reproduce-seam (`selection-012`, consumes this seam's `fitness.scored`/`lineage.culled` to resolve eligible parents) + W3 boot-composition-root (`selection-013`, injects this seam into `runWorker`).

## Estimated commit count
**1.** One focused wiring adapter + its real-PG integration test. NOT bundled with the reproduce-seam (W2) — W2 depends on this seam's events and carries the rule-#1 caps surface. No NEW safety invariant is introduced here (the composed fns already pin rules #5/#6/#7/#8); this slice is the integration, so it is one logical commit.

## Lessons-logged candidates anticipated
- **Convention candidate** — "a subsystem seam's real impl is a `create<Seam>(deps)→Seam` factory that composes the already-unit-pinned domain fns + reads its cross-subsystem inputs back from the persisted log via `readByRun` (never live counters, rule #7), emitting only through the injected `ctx.append` (rule #2/#4); the immutable anchors (policy/rubric) are injected from the boot root, validated-not-owned."
- **Architecture-doc note candidate** — §8: the score path's live order (novelty per candidate → component reads → fitness → cull-after-all) + the judge-acceptance candidateId join at the caller.
- **Future TODO — operational** — the comparison-set accumulation is O(n) per candidate (O(n²) total per generation); fine at MVP population caps, revisit if maxPopulation grows.

## How to invoke
1. Read this brief end-to-end (don't skip Step 2.5 questions).
2. Run `/tdd score_seam_wiring` in the implementer session.
3. Step 0 — confirm the restatement matches the Feature line.
4. Step 2.5 — ping back with answers to the 5 design questions (or take defaults).
5. Step 9 — surface anything beyond the anticipated lessons candidates.
