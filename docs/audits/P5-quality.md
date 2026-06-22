# P5 Code-Quality Review

**Over-approximation notice:** This is a phase-boundary pass over the accumulated selection-track
diff (`git diff cody...HEAD` scoped to the 10 touched paths). It covers all wiring added in the
selection track's Phase-5 cycle; earlier track slices already green are included by virtue of the
diff scope. Pre-existing code in untouched files is out of scope.

**Files reviewed:** 10  
**Findings:** 6 total — 0 high / 3 medium / 3 low

---

## Findings

### [medium] apps/api/src/boot/startRun.ts:22 — `readRecordedConfig` silently falls back to boot when `run.configured` payload is not a valid `RunConfig`

`RunConfig.safeParse(configured.payload)` returns `undefined` on parse failure, causing `composeRunWorkerDeps` to be called WITHOUT a `perRunConfig`, so the worker executes the **boot defaults** rather than the operator-recorded config. The production route always appends a full `RunConfig` payload (line 128 in `runs.ts`), so the failure path is only reachable when a `run.configured` event was appended with a malformed payload (e.g., direct DB writes bypassing the route). The comment documents this as defensive, but the silent fallback contradicts the "recorded == executed" thesis established in the function's own JSDoc. If the recorded config is malformed and unrecoverable, the safer behavior would be to emit `run.failed` rather than silently run under a different config. This is bounded (prod routes always write valid payloads) but architecturally fragile.

Action: step-9-flag (worth a brief note in the carry-forward triage — the existing test `seedConfigured` uses `payload: {}` which deliberately exercises this fallback path, confirming it's known-and-accepted, but the decision should be a named deferral, not a silent behavior).

---

### [medium] apps/api/src/selection/seams/reproduce-seam.ts:94–106 — O(parents × candidates) inner loop with no early-exit on the best-candidate scan

`projectSuccessorParents` iterates all `candidateAgenome` entries for every parent to find the best candidate. For N parents and M candidates, this is O(N × M). The per-parent scan could be short-cut by building a `agenomeId → [candidateIds]` index once (O(M) pass) and then doing a single O(k) scan per parent over its own candidate set. At MVP population sizes this is harmless, but it is a sub-optimal pattern that will slow proportionally as population/generation count grows. Not a correctness issue.

Action: defer (low-priority optimization; acceptable at MVP scale).

---

### [medium] apps/api/src/selection/seams/score-seam.ts:78 — `readByRun` called once before per-candidate novelty appends; novelty events written after the read are invisible to the evidence scan

The seam reads the log ONCE (`const rows = await deps.readByRun(runId)` at line 78) and then iterates candidates (line 89). The novelty scoring for candidate `i` appends `novelty.scored` AFTER this read, so the evidence rows for step-2 (energy/critic/check/judge) are stable (they were written by verify before this seam runs) but the novelty event itself is NOT in `rows`. This is actually correct by design — `scoreNovelty` returns its result directly (line 91) and the seam accumulates the novelty comparison in-memory (line 96), not from re-reading the log. However, the comment at line 76 says "read the persisted verifier/energy evidence ONCE" which is accurate — but the seam does NOT re-read per-candidate after novelty scoring, which is the design intent. This is fine. Flag only: the single-read-then-iterate pattern means any evidence appended by `scoreNovelty` (novelty.scored) would NOT be visible in `rows` for downstream use by `judgeAcceptance` or others — this is only safe because `judgeAcceptance` reads the `judgeResult` passed in `rows` (judge.reviewed was written by the verify seam before score runs). This is a latent trap: if a future component needed to read novelty.scored from `rows`, it would find nothing. The design needs a comment making the "single-read is safe because novelty evidence doesn't feed back into this iteration's scoring" invariant explicit.

Action: fix-in-slice (add one comment on line 78 naming the invariant: "novelty.scored events written by scoreNovelty during this loop are NOT in rows; that is intentional — no downstream component in this pass reads its own novelty event back from rows").

---

### [low] apps/api/src/selection/seams/successor-threading.ts:25 — `GENERATION_ID_PATTERN` regex couples to the loop's id scheme without a co-location comment naming the coupling point

The `GENERATION_ID_PATTERN = /^(.*-gen)(\d+)$/` regex is correct and the existing JSDoc names the coupling at a high level. However, the actual loop code that produces the matched id is at `generationLoop.ts:313-354` (`gen0Id = ${runId}-gen0` + `${runId}-gen${g}`). If the loop changes its id scheme, `successor-threading.ts` silently fails-loud at runtime (the throw in `deriveNextGenerationId`) rather than at compile time. The comment at line 24 names the scheme but does not cite the file:line. This is a weak cross-file coupling with no mechanical enforcement.

Action: defer (acceptable coupling given fail-loud throw and the e2e test that exercises the happy path; a compile-time coupling would require exporting the id-factory from the loop, which is heavier than needed at this stage).

---

### [low] apps/api/test/integration/selection/successor-threading.test.ts:232 — `rejects.toThrow()` without a message/value pin

`test_malformed_completedGenerationId_fails_loud` asserts `rejects.toThrow()` without pinning the error message. Per LESSONS §10 / test-quality axis, an unguarded `.toThrow()` passes for any thrown value including a type error from a future refactor that removed the guard. Pinning to `toThrow('cannot derive the next generationId')` would make the test fail only when the guard fires, not for any accidental throw.

Action: fix-in-slice (low risk; tighten to `toThrow(/cannot derive the next generationId/)` or the string literal from line 33 of `successor-threading.ts`).

---

### [low] apps/api/src/boot/composeRuntime.ts:90-96 — `MVP_CULL_POLICY` and `mvpMutationBounds` are module-level but not exported; no config-schema home yet

The JSDoc at line 85 documents that `cullPolicy` and `MutationBounds` are "NOT yet on `AppConfig` (a config-schema follow-up)". These values are hardcoded in the composition root — fine for MVP. But `MVP_CULL_POLICY` with `minFitness: 0` means nothing is ever culled (a fitness total ≥ 0 is always above the threshold). This is intentional (permissive MVP) and documented, but it means the `cull` path in `createScoreSeam` effectively never fires in production. Tests for culling exist in isolation but the e2e tests will never exercise a cull event. Not a bug but a dead-code-adjacent configuration that should be tracked.

Action: defer (accepted MVP posture; track as a Phase-D follow-up item when cullPolicy lands on AppConfig).

---

## Seam factory-pattern consistency audit

All three seams follow a consistent factory pattern:
- `createScoreSeam(deps: ScoreSeamDeps): ScoreSeam` — deps-closed factory, returns a function matching the kernel port type exactly. No `newId` propagated to the kernel's `RunWorkerDeps` (correct — `newId` is closed over in the factory).
- `createReproduceSeam(deps: ReproduceSeamDeps): ReproduceSeam` — same pattern.
- `createSuccessorThreading(deps: SuccessorThreadingDeps): (args: NextPopulationArgs) => Promise<readonly Agenome[]>` — same pattern, return type matches `GenerationLoopDeps['nextPopulation']` exactly (verified by the compile-time assignment test at line 143 of `successor-threading.test.ts`).

Factory consistency: PASS. No mixing of config-as-argument vs config-as-closure.

---

## Dual-caps handling in `composeRuntime.ts`

`mergePerRunConfig` correctly sets BOTH `config.caps` (the top-level field the loop reads at line 230) AND `config.runConfig.caps` to the same clamped value. The comment at line 60 ("The loop enforces the TOP-LEVEL `config.caps`...so both the top-level and `runConfig.caps` are set to the clamped value") explains the dual-write. This is consistent and verified by `test_posted_cap_clamped_to_boot_ceiling` which asserts both fields.

Dual-caps handling: PASS.

---

## `nextGenerationId` derivation coupling in `successor-threading.ts`

The derivation regex `/^(.*-gen)(\d+)$/` is tight-coupled to the loop's `${runId}-gen${g}` scheme (line 354 of `generationLoop.ts`). The fail-loud throw (line 32-36) is the safety net. The e2e test `test_loop_level_evolution_gen1_from_gen0_offspring` exercises the successful path. The malformed-id test exercises the fail-loud path. There is no silent mis-homing.

One notable observation: gen0 uses the special `gen0Id = ${runId}-gen0` path (before the loop) but the loop body for g=0 also uses `${runId}-gen0` (line 354, g starts at 0). These are the same string, so the reproduction events from gen0 are correctly identified by the threading hook as `completedGenerationId = "${runId}-gen0"` → `nextGenerationId = "${runId}-gen1"`.

nextGenerationId coupling: PASS.

---

## Duplicated log-scanning logic

`score-seam.ts` (`parsePayloads` helper) and `reproduce-seam.ts` (`projectSuccessorParents` inner loop over `scoredEvents`) both scan `RunEventRow[]` for events by type + id. The patterns are similar in structure but different in what they extract. `parsePayloads` is a generic filter-then-parse; `projectSuccessorParents` accumulates a richer data structure across three parallel passes. These are similar-but-not-identical enough that a shared helper would require a more complex API than either currently needs. The duplication is acceptable at this scope.

Duplicated logic: ACCEPTABLE (no refactor needed now).

---

## Known-and-accepted (not findings)

Per the dispatch brief: `selectParents`, `noveltyScoreOf`, and `jaccardSimilarity` flagged unreachable by the reachability audit are a separate finding. `createStartRun`'s production `main.ts` wiring is a named Phase-D deferral.
