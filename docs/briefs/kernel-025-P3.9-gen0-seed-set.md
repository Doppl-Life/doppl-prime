# /tdd brief — gen0_authored_seed_agenome_set

## Feature
The **human-authored gen-0 seed agenome set** (P3.9 feature half, REQ-F-017) — a boot-validated authored baseline (`seedAgenomes.config.ts`) + a PURE materializer (`gen0SeedSet.ts`) that turns the authored trait templates into the run's gen-0 `Agenome[]` (deterministic per-run ids, empty `parentIds`, `seeded` status), **clamped to `maxPopulation` via the P3.9 spawnBudget clamp**. Materialization is pure; the `agenome.spawned` emission is the worker/loop's (P3.10/P3.12) (§5 ownership split; lesson 33).

## Use case + traceability
- **Task ID:** P3.9 (the gen-0 authored-seed-set half; the spawnBudget clamp shipped in kernel-024 `fb7007c`).
- **Architecture sections it implements:** `ARCHITECTURE.md §3` (Agenome traits; gen-0 = authored baseline; an agenome has 0–2 parents — gen-0 has none) + `§7` (REQ-F-017 seed authoring). *"Spawn a bounded population (~20 target), seeded from a human-authored gen-0 baseline."*
- **Consumed (never redefined):** frozen `Agenome` (P0.4 — the materialized output parses against it: trait fields + `seeded` status + empty `parentIds`); the P3.9 `clampSpawnBudget` (kernel-024) for the gen-0 count vs `maxPopulation`; `RunCaps.maxPopulation` (P0.3); the P3.1 `loadConfig`/`configSchema` boot-validation pattern.
- **Pattern:** boot-validated config source like `DEFAULT_PROBLEM_SETS` / `DEFAULT_MODEL_REGISTRY` (P3.1 configSchema). Materialize-pure / loop-emits (P3.2/P3.4/P3.5/P3.6/P3.9-clamp cadence).
- **Not a safety-invariant slice** — the rule-#1 spawn pin (the clamp) shipped SOLO in kernel-024; this feature CONSUMES it. (Per Step-8 policy: security-reviewer = invariant → not required per-slice here; the maxPopulation-respect bullet is test-pinned.)

## Acceptance criteria (what "done" means)
- [ ] `SeedAgenomeTemplate` (Zod) validates the AUTHORED trait fields only — `systemPrompt`, `personaWeights`, `toolPermissions`, `decompositionPolicy`, `spawnBudget` — and does NOT carry `id`/`runId`/`generationId`/`parentIds`/`status`/`mutationMeta` (those are spawn-assigned; a template with them is rejected by shape).
- [ ] `DEFAULT_SEED_SET` is a small MVP-minimal authored baseline (≥2 agenomes with DISTINCT personas/prompts) that validates against `SeedAgenomeTemplate`. (Content is tunable post-spike — OQ-013/REQ-F-017; the SHAPE + loader are what's pinned.)
- [ ] The seed set is **config-validated at boot** (consistent with P3.1): a malformed seed template fails fast with a field-pointing error, never a partial/invalid gen-0.
- [ ] `materializeGen0(seedSet, runId, generationId, maxPopulation)` produces `Agenome[]` where each: has empty `parentIds: []`, `status: 'seeded'`, deterministic per-run id, the authored traits — and **each parses against the frozen `Agenome` schema**.
- [ ] **Population respects `maxPopulation`:** the materialized count = `min(seedSet.length, maxPopulation)` via `clampSpawnBudget` (a seed set larger than the cap is clamped DOWN; the run never materializes more gen-0 agenomes than the cap permits — rule #1).
- [ ] Materialization is **pure** (same inputs → same `Agenome[]`, deterministic ids → replay-stable); no emit, no IO. The `agenome.spawned` emission is deferred to the worker/loop (P3.10/P3.12).
- [ ] All unit tests in `apps/api/test/unit/runtime/seed/*.test.ts` pass; `/preflight` clean.

## Wiring / entry point (Step 7.5)
**none — `agenome.spawned` emission lands in P3.10/P3.12.** Exported from `apps/api/src/runtime/index.ts`. The seed config is validated at boot via `loadConfig` (P3.1 — added as a config source; `AppConfig.seedSet`). **First consumer (named, lesson 20):** the worker boot / generation loop (P3.10/P3.12) calls `materializeGen0(AppConfig.seedSet, runId, gen0Id, caps.maxPopulation)` then appends one `agenome.spawned` per materialized agenome.

## Files expected to touch
**New:**
- `apps/api/src/runtime/seed/seedAgenomes.config.ts` — `SeedAgenomeTemplate` schema + `DEFAULT_SEED_SET` (authored baseline).
- `apps/api/src/runtime/seed/gen0SeedSet.ts` — `materializeGen0` (+ the seed-set validation entry).
- `apps/api/test/unit/runtime/seed/{seedAgenomes,gen0SeedSet}.test.ts`

**Modified:**
- `apps/api/src/runtime/config/configSchema.ts` — add `SeedAgenomeSet` + `DEFAULT_SEED_SET` to the schema + `AppConfig.seedSet`.
- `apps/api/src/runtime/config/loadConfig.ts` — validate the seed set as a boot config source (fail-fast).
- `apps/api/src/runtime/index.ts` — export `materializeGen0` + the types.

If implementation needs files beyond this list, flag at Step 2.5.

## RED test outline (Step 2)
`seedAgenomes.test.ts`:
1. **`seed_template_validates_authored_traits`** — a well-formed template (the 5 trait fields) parses; a template carrying `id`/`runId`/`status` is REJECTED (spawn-assigned fields unrepresentable). Why: §3 trait/lifecycle split.
2. **`default_seed_set_is_valid_and_distinct`** — `DEFAULT_SEED_SET` validates + has ≥2 distinct personas. Why: REQ-F-017 authored baseline.
3. **`malformed_seed_fails_fast_at_boot`** — a malformed template aborts boot validation with a field-pointing error. Why: P3.1 fail-fast.

`gen0SeedSet.test.ts`:
4. **`materialize_produces_valid_seeded_agenomes`** — each output: `parentIds: []`, `status:'seeded'`, deterministic id, authored traits; each `Agenome.parse(a)` round-trips. Why: §3 gen-0 (no parents, seeded) + P0.4 contract.
5. **`materialize_respects_max_population`** — `seedSet.length > maxPopulation` → exactly `maxPopulation` materialized (clamped via `clampSpawnBudget`); `seedSet.length <= maxPopulation` → all. Why: §5/rule #1 spawn-respects-cap.
6. **`materialize_is_deterministic`** — same `(seedSet, runId, generationId, maxPopulation)` → equal `Agenome[]` (replay-stable ids). Why: §4 replay determinism.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** **NONE** to frozen contracts (consumes `Agenome`/`RunCaps`). `SeedAgenomeTemplate` + `AppConfig.seedSet` are runtime-local config shapes (not Appendix-A models).
- **Orchestrator doc rows to write hot:** possible Convention lesson (authored seed templates carry traits only; spawn-assigned fields unrepresentable; materialize pure + maxPopulation-clamped; loop emits agenome.spawned). No §-anchor change.
- **§2.5-seam model touched?** No — consumes frozen `Agenome`; the materialized output is validated against it (a runtime conformance test, not a new snapshot).

## Things to flag at Step 2.5
1. **Materialize pure / loop emits.** My default vote: **pure** — `materializeGen0` returns `Agenome[]`; the worker/loop appends `agenome.spawned`. Matches the P3.x cadence.
2. **Seed set as a `loadConfig` boot source.** My default vote: **yes** — add `SeedAgenomeSet` + `DEFAULT_SEED_SET` to `configSchema` + `AppConfig.seedSet`, validated by `loadConfig` at boot (consistent with P3.1 "config-validated at boot"). Flag if you'd rather keep it a standalone validated loader (looser coupling, but diverges from the one-boot-config pattern).
3. **Deterministic id scheme.** My default vote: `${runId}-gen0-${index}` (replay-stable, no RNG needed — gen-0 ids are positional, not sampled). Flag if you want the P3.6 seeded RNG involved (it shouldn't be — gen-0 materialization is deterministic positional, not a sampling decision).
4. **Clamp the COUNT, via `clampSpawnBudget`.** My default vote: gen-0 count = `clampSpawnBudget(seedSet.length, maxPopulation).effectiveSpawns` — reuse the kernel-024 clamp (single-source the rule-#1 logic; don't re-min inline).
5. **`DEFAULT_SEED_SET` size/content.** My default vote: MVP-minimal (≥2, ~4–6 distinct personas) — enough to exercise lineage/diversity; the exact roster is tunable content (post-spike, OQ-013). The SHAPE + loader are the pinned surface, not the prose.

## Dependencies + sequencing
- **Depends on:** P0.4 (`Agenome` frozen) ✓ · P3.1 (`loadConfig`/`configSchema`) ✓ · P3.9 clamp (kernel-024 `fb7007c`) ✓ · P3.2 (seeded status in the agenome machine) ✓.
- **Blocks:** P3.10 generation loop (materializes gen-0 + emits `agenome.spawned` to start the run). **Completes P3.9** (clamp + seed set).

## Estimated commit count
**1.** A focused feature slice (gen-0 authored baseline + materializer). NOT a safety-invariant slice (the rule-#1 spawn pin shipped SOLO in kernel-024; this consumes it). `feat(runtime)`. Per Step-8 policy (security-reviewer = invariant), no per-slice security-reviewer required; the maxPopulation-respect + Agenome-conformance bullets are test-pinned. (Optional code-quality-reviewer is phase-boundary.)

## Lessons-logged candidates anticipated
- **Convention candidate** — "an authored seed template carries TRAITS ONLY (spawn-assigned id/runId/status unrepresentable by shape); `materializeGen0` is pure + deterministic (positional ids, replay-stable) + maxPopulation-clamped via the single-sourced `clampSpawnBudget`; the loop emits `agenome.spawned`."

## How to invoke
1. **Read this brief** + the P3.1 configSchema (the `DEFAULT_PROBLEM_SETS` boot-source pattern) + the kernel-024 clamp (reuse it for the count).
2. **Run `/tdd gen0_authored_seed_agenome_set`**.
3. **Step 0/1** — confirm restatement + file list (config + materializer; loadConfig integration).
4. **Step 2.5** — send the per-test write-up + coverage map; the load-bearing confirmations are #2 (loadConfig source) + #4 (reuse `clampSpawnBudget` for the count).
5. **Step 9** — surface anything unexpected; confirm P3.9 COMPLETE (clamp + seed set).
