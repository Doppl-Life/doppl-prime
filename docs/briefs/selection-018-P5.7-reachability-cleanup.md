# /tdd brief — reachability_cleanup (remove dead exports; /phase-exit P5 true-CLEAR)

## Feature
Phase-exit P5 cleanup (human chose true-CLEAR over a waiver): remove the 2 DEAD selection exports the reachability auditor flagged, and fold in 2 trivial code-quality one-liners — so the re-run reachability auditor returns **0 unreachable** (with the 2 accepted Phase-D/demo deferrals recorded). Suite stays green throughout; no behavior change to the wired path.

## Use case + traceability
- **Task ID:** P5.7
- **Architecture sections it implements:** `ARCHITECTURE.md §8` (selection — parent-selection + novelty). This REMOVES a superseded §8 parent-selection impl whose behavior the WIRED path already covers; it does not change §8 behavior.
- **Related context:**
  - `/phase-exit P5` reachability audit (docs/audits/P5-reachability.md): 4 unreachable — 2 to remove (this slice), 2 accepted-deferrals (KEEP).
  - `selectParents` (parent-selection.ts) is SUPERSEDED: the production path computes eligible parents via the kernel loop's `resolveEligibleParents` (eligible = `fitness.scored ∧ ¬lineage.culled`) and ranks/distributes them via selection's `allocation` (fitness×novelty×energy, deterministic largest-remainder by canonical id). §8's "deterministic tie-break" is satisfied by the wired path's id-deterministic order (§8 accepts seed OR persisted-outcome OR deterministic). So `selectParents`'s seed-based subset-selection is unused.
  - `jaccardSimilarity` (lexical-fallback.ts) is covered transitively — `lexicalNoveltyScore` (the wired degrade path) uses it internally; only its BARREL export is unreachable.
  - code-quality audit (docs/audits/P5-quality.md): 6 minor findings — fold in 2 trivial ones here; the rest stay documented follow-ups.

## Acceptance criteria (what "done" means)
- [ ] **Remove `selectParents`** (+ `SelectParentsInput`, `SelectParentsResult`) so it is no longer an unreachable export: DELETE `apps/api/src/selection/parent-selection.ts` + its unit test `apps/api/test/unit/selection/parent-selection.test.ts`, and the barrel re-export line in `selection/index.ts`. (It's superseded + test-only — deletion is the clean path to 0-unreachable. If you find a NON-test production caller, STOP + flag — that would contradict the audit.)
- [ ] **Remove the `jaccardSimilarity` barrel export** from `selection/index.ts`: keep the function in `lexical-fallback.ts` as an INTERNAL (non-exported, or keep exported-from-module but drop from the barrel) helper used by `lexicalNoveltyScore`; if its unit test imports it directly, keep that test green (it can test the internal helper within the module's test file) — the goal is the BARREL export gone + the auditor seeing 0-unreachable for it.
- [ ] **CQ one-liner 1 (LESSONS §10):** `apps/api/test/integration/selection/successor-threading.test.ts` — tighten the bare `rejects.toThrow()` to a message-pinned `toThrow(/cannot derive the next generationId/)` (or the actual fail-loud message).
- [ ] **CQ one-liner 2:** `apps/api/src/selection/seams/score-seam.ts` (~line 78) — add a one-line WHY comment on the single pre-loop `readByRun`: novelty.scored written during this loop is intentionally NOT in `rows` (the comparison set accumulates in-seam; a future component must not expect to read this generation's novelty from `rows`).
- [ ] **§8 coverage preserved:** the wired parent-selection path (kernel `resolveEligibleParents` + selection `allocation`) is UNCHANGED — confirm `cull`/`allocation`/`successor`/the seams are untouched. Removing `selectParents` loses no §8 behavior (it was unwired). State this in Step 9.
- [ ] **KEEP UNTOUCHED (accepted deferrals — do NOT remove):** `createStartRun` (Phase-D production main.ts wiring, e2e-proven) + `noveltyScoreOf` (rule-#7 replay-recompute helper for the demo/PD replay path). Record them as accepted-with-named-consumers in Step 9.
- [ ] Full suite green (unit + integration); `/preflight` clean (repo-wide).
- [ ] No new reachability gaps introduced.

## Wiring / entry point (Step 7.5)
None new — this REMOVES dead exports. The wired selection surface (seams → loop → POST /runs) is unchanged. The acceptance is the orchestrator's re-run reachability auditor returning 0-unreachable (2 deferrals accepted), which I run after your commit.

## Files expected to touch
**Deleted:**
- `apps/api/src/selection/parent-selection.ts`
- `apps/api/test/unit/selection/parent-selection.test.ts`

**Modified:**
- `apps/api/src/selection/index.ts` — drop the `selectParents`/`SelectParents*` + `jaccardSimilarity` barrel exports.
- `apps/api/src/selection/novelty/lexical-fallback.ts` — make `jaccardSimilarity` internal (if it isn't already) — keep `lexicalNoveltyScore` using it.
- `apps/api/test/unit/selection/novelty/lexical-fallback.test.ts` — keep green (test the internal helper within-module if it referenced the barrel).
- `apps/api/test/integration/selection/successor-threading.test.ts` — message-pin the toThrow.
- `apps/api/src/selection/seams/score-seam.ts` — the WHY comment.

If removing `selectParents` surfaces an unexpected production import, STOP + flag (the audit said test-only).

## RED test outline
This is a removal/cleanup slice — the "test" is the suite staying green + the reachability re-run. Specific checks:
1. **suite-green-after-removal** — delete `selectParents` + its test; run the full unit + integration suite → all green (no production code imported it). Why: confirms it was dead.
2. **jaccard-barrel-removed-internal-kept** — drop the `jaccardSimilarity` barrel export; `lexicalNoveltyScore` + its tests stay green (the degrade path still works). Why: the function is internal-only now.
3. **toThrow message pin** — the successor-threading fail-loud test asserts the specific message (LESSONS §10 — a bare toThrow false-passes on any throw).
4. **§8 wired path untouched** — cull/allocation/successor/parent-eligibility (resolveEligibleParents in the loop) unchanged; the evolution e2e + the existing selection suite stay green. Why: §8 parent-selection coverage preserved by the wired path.

## Cross-doc invariant impact
- **Model field changes:** none.
- **Orchestrator doc rows to write hot:** none (the reachability disposition + the Phase-5 box tick are mine at the seal/cody-merge).
- **§2.5-seam model touched?** No.

## Things to flag at Step 2.5
1. **Delete vs un-export `selectParents`.** My default: **DELETE the file + test** (it's superseded + test-only → cleanest 0-unreachable). Flag if you'd rather keep it as a documented-internal utility (but then the auditor may still flag it — deletion is surest).
2. **`jaccardSimilarity` internal-ization.** My default: drop the barrel export; keep it module-internal (used by `lexicalNoveltyScore`). Flag if its test must move to within-module.
3. **CQ one-liners — these 2 only.** The other 4 P5-quality findings (O(N×M) scan, GENERATION_ID_PATTERN coupling, startRun safeParse-fallback, MVP cull policy) are documented follow-ups — do NOT touch them here.

## Dependencies + sequencing
- **Depends on:** the whole P5 wiring round (through W3b-2c `beb36b2`).
- **Blocks:** `/phase-exit P5` re-run reachability → true CLEAR → seal.

## Estimated commit count
**1.** One cleanup slice (`refactor(selection):` or `chore(selection):` — dead-export removal + 2 trivial CQ one-liners). No new behavior; suite stays green.

## Lessons-logged candidates anticipated
- **Convention candidate** — none new (cleanup); reinforces "a phase-exit reachability audit catches superseded/dead exports — delete them for a true CLEAR rather than waive."

## How to invoke
1. Read end-to-end — note the KEEP-untouched deferrals (createStartRun, noveltyScoreOf).
2. `/tdd reachability_cleanup`.
3. Step 0 — confirm restatement (removal + 2 one-liners; deferrals kept).
4. Step 2.5 — confirm delete-vs-unexport + the §8-preserved check.
5. Step 9 — confirm suite green + §8 coverage preserved + the 2 deferrals recorded-accepted; then /session-end + spin down.
