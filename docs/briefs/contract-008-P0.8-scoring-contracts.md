# /tdd brief — scoring_contracts

## Feature
Freeze the scoring-family contracts — `NoveltyScore` (id, candidateId, vector, embeddingModelId, dimension, comparisonSet, method, score, explanation), `FitnessScore` (id, candidateId, total, components{}, policyVersion, explanation), and `ScoringPolicy` (version, weights{}, normalization?) — with STRUCTURE frozen and numeric weight VALUES the only deferred-open piece. Encodes two safety/correctness properties structurally: **replay-determinism (rule #7)** — `NoveltyScore.vector` is the authoritative-once-computed persisted float array (+ embeddingModelId + dimension) so replay reads the stored vector and never re-embeds; and **scoring immutability-via-versioning (rule #6)** — `FitnessScore.policyVersion` binds a score to the exact `ScoringPolicy` version that produced it (a policy is versioned, never mutated in place). **SAFETY slice** (rule #6 scoring policy immutable to agents / anti-reward-hacking). Own commit, never bundled.

## Use case + traceability
- **Task ID:** P0.8
- **Architecture sections it implements:** `ARCHITECTURE.md §8` ("policy-versioned, decomposed `FitnessScore` = {total, components, policyVersion, explanation} from `ScoringPolicy` = {version, weights, normalization?} — structure frozen, numeric weights deferred-open; components: critic scores, subtype-check results, novelty (now required), energy efficiency, plus held-out-judge acceptance; all selection decisions explainable from persisted events — `novelty.scored` is the authoritative home for novelty; `fitness.scored` references the novelty it consumed"), §9 (authoritative event-stored vectors; app-level cosine day-one, pgvector deferred), §4 (RNG/replay — persisted-once-computed), §7 (held-out judge acceptance is a fitness component). Appendix A line 475 (`NoveltyScore` fields) + 476 (`FitnessScore`/`ScoringPolicy` fields).
- **Related context:** All three are §2.5 shared contracts crossed by the selection→reproduction seam (Appendix A) — schema-snapshots required. Numeric **weight VALUES** in `ScoringPolicy.weights{}` are the ONLY deferred-open contract values (§8) — freeze the STRUCTURE (weights is a record) now; the values fill in later policy versions. Lesson §6: ranges/relationships (e.g. `vector.length === dimension`, `total` bounds) are kernel-enforced, NOT the schema — keep the shape permissive. Lesson §10: lead reject-only tests with a positive guard. The `fitness.scored ↔ novelty.scored` record-level link is the **event-payload layer's** job (P0.10), not necessarily a FitnessScore field (see Q3).

## Acceptance criteria (what "done" means)
- [ ] `NoveltyScore` is a strict object carrying EXACTLY: `id`, `candidateId`, `vector`, `embeddingModelId`, `dimension`, `comparisonSet`, `method`, `score`, `explanation` — unknown rejected, required mandatory.
- [ ] **Replay-determinism (rule #7):** `vector` is a required persisted float array and `embeddingModelId` + `dimension` are required, so replay reads the stored vector and never re-embeds (§4/§9) — `vector` is NOT optional.
- [ ] `FitnessScore` is a strict object carrying EXACTLY: `id`, `candidateId`, `total`, `components`, `policyVersion`, `explanation` — unknown rejected, required mandatory.
- [ ] **Scoring immutability-via-versioning (rule #6):** `FitnessScore.policyVersion` is REQUIRED and typed identically to `ScoringPolicy.version`, binding each score to the exact policy that produced it; a FitnessScore without `policyVersion` is rejected.
- [ ] `components` carries the named decomposed signals (critic scores, subtype-check results, novelty, energy efficiency, held-out-judge acceptance) per Q4 — so selection is explainable from persisted events (§8).
- [ ] `ScoringPolicy` is a strict object carrying EXACTLY: `version`, `weights`, `normalization?` — STRUCTURE frozen; `weights` is a record whose numeric VALUES are deferred-open (not pinned by the schema); `normalization?` optional.
- [ ] `vector` / `comparisonSet` / `method` / `score` / `total` / `weights` / `components` / `normalization?` field types per the Q resolutions; ranges/relationships left to the kernel (lesson §6).
- [ ] `z.infer` types for all three exported from the barrel.
- [ ] **Schema-snapshot tests (§2.5 gate, tagged `spec(§8)`):** `NoveltyScore` field-set (9), `FitnessScore` field-set (6), `ScoringPolicy` field-set (3) (+ `method` member-set if closed) equal checked-in frozen snapshots.
- [ ] All unit tests pass; `/preflight` clean.

## Wiring / entry point (Step 7.5)
Entry point = the `@doppl/contracts` barrel exports `NoveltyScore`, `FitnessScore`, `ScoringPolicy` (schemas + `z.infer` types). Consumed downstream by the **selection track (P5)** — novelty computation persists `NoveltyScore` (authoritative vector), fitness computation emits `FitnessScore` bound to a `ScoringPolicy` version; the `novelty.scored` + `fitness.scored` event payloads (P0.10) reuse these. `none — runtime wiring (novelty/fitness computation) lands in the selection track (P5)`. Reachability = barrel-exported + schema-snapshot-covered.

## Files expected to touch
**New:**
- `packages/contracts/src/scoring/novelty-score.ts` — `NoveltyScore` (+ `NoveltyMethod` if closed).
- `packages/contracts/src/scoring/fitness-score.ts` — `FitnessScore`.
- `packages/contracts/src/scoring/scoring-policy.ts` — `ScoringPolicy`.
- `packages/contracts/test/scoring/{novelty-score,fitness-score,scoring-policy}.test.ts`
- `packages/contracts/test/__schema-snapshots__/scoring-field-sets.test.ts`

**Modified:**
- `packages/contracts/src/index.ts` — re-export the above.

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN. (`src/scoring/` is a new subdir.)

## RED test outline (Step 2)
1. **`novelty_score_accepts_valid_and_strict`** *(spec §8)* — Asserts (positive-guard-first): full 9-field NoveltyScore round-trips; unknown rejected; each required mandatory. Why: Appendix-A §8 shape.
2. **`novelty_vector_persisted_for_replay`** *(spec §4/§9, rule #7)* — Asserts: `vector` is a required array of numbers; omitting `vector`/`embeddingModelId`/`dimension` rejected; a non-number vector element rejected. Why: authoritative-once-computed vector so replay never re-embeds.
3. **`novelty_method_and_comparisonSet`** *(spec §8)* — Asserts: `method` per Q6; `comparisonSet` per Q7; `score` permissive number. Why: §8 novelty shape.
4. **`fitness_score_accepts_valid_and_strict`** *(spec §8)* — Asserts (positive-guard-first): full 6-field FitnessScore round-trips; unknown rejected; required mandatory. Why: Appendix-A §8 shape.
5. **`fitness_policyVersion_required_binds_policy`** *(spec §8/§3, rule #6)* — Asserts: a FitnessScore WITHOUT `policyVersion` rejected; `policyVersion` type matches `ScoringPolicy.version`. Why: immutability-via-versioning — a score is bound to its exact policy.
6. **`fitness_components_decomposed`** *(spec §8)* — Asserts: a `components` carrying the named signals parses; per Q4 (open record vs fixed-key); non-number component value rejected. Why: §8 explainable decomposition.
7. **`scoring_policy_structure_frozen_weights_open`** *(spec §8)* — Asserts: `{version, weights, normalization?}` strict; `weights` is a record accepting arbitrary numeric VALUES (deferred-open); `normalization` omittable; unknown rejected. Why: §8 structure-frozen / values-deferred.
8. **`barrel_exports_scoring_contracts`** *(spec §2.5)* — Asserts: `NoveltyScore`/`FitnessScore`/`ScoringPolicy` (+ `NoveltyMethod` if closed) re-exported. Why: §2.5 single import boundary.
9. **`schema_snapshot_scoring`** *(spec §8/§2.5)* — Asserts: `NoveltyScore`(9) + `FitnessScore`(6) + `ScoringPolicy`(3) field-sets (+ `method` set if closed) == frozen snapshots. Why: §2.5 cross-track regression gate.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** NEW — `NoveltyScore`, `FitnessScore`, `ScoringPolicy` (+ `NoveltyMethod` if closed).
- **§2.5-seam model touched?** **YES** — all three shared (selection→reproduction). RED outline MUST include the schema-snapshots (#9).
- **Orchestrator doc rows to write hot:** add cross-doc rows for `NoveltyScore`/`FitnessScore`/`ScoringPolicy` (§8). Appendix A lines 475/476 already enumerate the field sets — no ARCHITECTURE.md edit unless GREEN settles an under-specified type that warrants Appendix detail (e.g. `method` enum, `components`/`weights`/`comparisonSet`/`normalization` shapes — flag at Step 9, like the P0.7 CheckRunnerAdapter gap-fill). **Safety-relevant:** any weakening of `policyVersion`-required (rule #6) or `vector`-required (rule #7) is a Step-9 Finding.

## Things to flag at Step 2.5
1. **`vector` element type + emptiness.** My default vote: `z.array(z.number())` — permissive on length (`vector.length === dimension` is a kernel relationship, lesson §6); allow empty array at the schema (kernel ensures non-degenerate). Flag if you want `.min(1)` or to refine length==dimension.
2. **`dimension` type.** My default vote: `z.number().int().positive()`. Flag.
3. **FitnessScore ↔ NoveltyScore reference — via `components` only (Option A) vs a dedicated `noveltyScoreId` field (Option B).** My default vote: **Option A** — FitnessScore is EXACTLY the frozen 6 fields (no `noveltyScoreId`); novelty is referenced as a named `components` signal, and the record-level `fitness.scored ↔ novelty.scored` link is the P0.10 event-payload's job. Adding a `noveltyScoreId` field would change the frozen field set → flag + escalate (arch note) rather than add silently.
4. **`components` typing — open `z.record(z.string(), z.number())` (Option A) vs fixed-key object pinning the 5 named signals (Option B).** My default vote: **Option A — open record** (the exact signal set evolves with policy versions; structure frozen, keys open — mirrors `CriticReview.scores` / `Agenome.personaWeights`, lesson §6). The "includes the named signals" bullet is satisfied by a fixture using those keys. Flag if you want a fixed-key object.
5. **`ScoringPolicy.weights` typing.** My default vote: `z.record(z.string(), z.number())` — structure frozen, VALUES deferred-open (the snapshot pins the FIELD `weights` exists, NOT specific weight keys/values). Flag.
6. **`NoveltyScore.method` — open string (Option A) vs closed enum `cosine | nearest_neighbor | …` (Option B).** My default vote: **Option A — `z.string().min(1)`** (methods are MVP-evolving; app-level cosine day-one + pgvector later; lesson §6). Flag if you want a closed `NoveltyMethod` enum (then snapshot its member-set too).
7. **`comparisonSet` shape.** My default vote: `z.array(z.string().min(1))` — the candidate ids compared against (treat ids as opaque bytes, carry-forward). Flag if it needs richer structure (e.g. `{candidateId, distance}` pairs).
8. **`version`/`policyVersion` + `normalization?` types.** My default vote: `version`/`policyVersion` = `z.string().min(1)` (identical type, so they bind); `normalization?` = `z.string().min(1).optional()` (a named method) — flag if it should be a structured object.
9. **`total`/`score` ranges.** My default vote: permissive `z.number()` (bounds are a kernel/scoring concern, lesson §6). Flag if structurally bounded.
10. **Commit count.** My default vote: **1 — SAFETY slice (scoring-policy contract, rule #6), own commit, never bundled.** Commit: `feat(contracts): NoveltyScore + FitnessScore + ScoringPolicy (P0.8)`.

## Dependencies + sequencing
- **Depends on:** none (independent; does NOT import P0.5's EvidenceRef — these scoring models carry no evidenceRefs per Appendix A).
- **Blocks:** P0.10 (`novelty.scored` + `fitness.scored` payloads), P0.15 (Run/Generation/Culling/FinalJudgeRubric — `FinalJudgeRubric` weights mirror the deferred-open posture; entities bundle is gated on this slice), P0.14 (contract-test surface), the selection track (P5).

## Estimated commit count
**1** — SAFETY slice (key safety rule #6, scoring policy immutable to agents). The 3 scoring models are one cohesive family (FitnessScore.policyVersion binds to ScoringPolicy.version; novelty is a fitness component). Own commit, never bundled.

## Step-8 reviewer policy
**security-reviewer: FAN OUT** — this is the scoring-policy contract (rule #6) the lead classifies as a safety contract. Review surface is THINNER than P0.6/P0.7 (no injection/allowlist/exec surface): confirm `policyVersion` required (immutability-via-versioning), `vector` required (replay rule #7), no agent-mutable authority field, no secret-bearing field. code-quality-reviewer stays `phase-boundary`.

## Lessons-logged candidates anticipated
- **Convention candidate** — "Immutability-via-versioning is pinned structurally: a policy carries a `version`; every artifact it produces carries a required `policyVersion` binding it to the exact policy — so a policy is never mutated in place, and a score is forever explainable against its policy" (rule #6 at the contract tier).
- **Convention candidate** — "An authoritative-once-computed value (an embedding vector) is a REQUIRED persisted field + its provenance (embeddingModelId, dimension), so replay reads it and never recomputes (rule #7)."
- **Architecture-doc note candidate** — add the settled field TYPES (method, components, weights, comparisonSet, normalization) to Appendix A §8 rows if GREEN pins anything Appendix currently leaves open.

## How to invoke
1. **Read this brief end-to-end.** Q3 (no `noveltyScoreId` — keep the frozen 6 fields), Q4 (components open vs fixed), Q6 (method open vs enum) are the load-bearing calls.
2. **Run `/tdd scoring_contracts`.**
3. **Step 0/1** — confirm restatement + file list; confirm `src/scoring/` is a new subdir and these models do NOT import EvidenceRef.
4. **Step 2.5** — send the test-design write-up (per-test `Asserts` + per-acceptance-bullet coverage map) + answers to the 10 questions. Wait for `APPROVED.`/`TWEAK:`/`ADD:`.
5. **Step 7→8** — security-reviewer fans out (scoring-policy safety contract).
6. **Step 9** — categorized flags + ship-ask; any weakening of `policyVersion`-required / `vector`-required is a Finding.
