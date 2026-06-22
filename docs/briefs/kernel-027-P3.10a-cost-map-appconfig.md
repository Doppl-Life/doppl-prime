# /tdd brief — cost_map_appconfig_wiring

## Feature
Wire the `doppl_energy` **cost map into `AppConfig`** so the cost values (`tokensPerUnit`/`perToolCall`/`perSpawn`) are boot-configurable (`defaults < file`), instead of living only as the `DEFAULT_COST_MAP` constant in the energy module. This is **P3.10 sub-slice (a)** — a small, dependency-free boot-config prerequisite the P3.10 generation loop needs before it can debit/emit `energy.spent` from operator-tunable costs (§4). Single-source the `CostMapConfig` type via a Zod schema (`z.infer`, LESSON 5 + strict-typing posture); `DEFAULT_COST_MAP` becomes the `defaults` layer.

## Use case + traceability
- **Task ID:** P3.10 sub-slice (a) — the "cost-map → AppConfig" follow-up banked in kernel-006 "Open follow-ups" + kernel-003 ledger §H FUTURE TODO ("wire `DEFAULT_COST_MAP` into `AppConfig` so the cost map is boot-configurable … lands at P3.1-extend or P3.10 loop-wiring").
- **Architecture sections it implements:** `ARCHITECTURE.md §4` (the `doppl_energy` unit + cost map) + `§5`/`§15` (the boot-config `loadConfig` composition — one deep-frozen immutable `AppConfig`). Key safety rule #4 (creds stay env-only; cost-map is a non-credential config source).
- **Why:** the energy ledger (P3.5) functions (`energyForLlm/Tool/Spawn`, `reconcileEnergy`) all take `config: CostMapConfig` as a param, but `AppConfig` carries no cost-map section — so the loop would have to hard-pass `DEFAULT_COST_MAP`. Wiring it into `AppConfig` makes the costs operator-tunable through the same `defaults < file` precedence as `caps`/`scoringPolicy`, and gives the loop one immutable handle (`appConfig.costMap`).
- **Pattern:** mirrors the existing `scoringPolicy`/`caps`/`problemSets` composition in `loadConfig` exactly (validate a `deepMerge(default, file)` through a Zod schema, add to the deep-frozen return).

## Acceptance criteria (what "done" means)
- [ ] `costMap.ts` exports a **Zod schema** `CostMapConfigSchema` (strictObject: `tokensPerUnit` int **positive** [it's a divisor — 0 illegal]; `perToolCall`, `perSpawn` int **nonnegative**) and `CostMapConfig` becomes `z.infer<typeof CostMapConfigSchema>` (type single-sourced from the schema; the existing `energyForLlm/Tool/Spawn` signatures are unchanged — same structural shape). `DEFAULT_COST_MAP` still validates against the new schema (1000/5/50).
- [ ] `AppConfig` gains a `readonly costMap: CostMapConfig` field (after `caps`, before `problemSets` — group with the other tunables).
- [ ] `FileSources` gains an optional `costMap?: Record<string, unknown>`.
- [ ] `loadConfig` composes `costMap = validateSource('cost-map', CostMapConfigSchema, deepMerge(DEFAULT_COST_MAP, fileSources.costMap ?? {}))` and includes it in the deep-frozen return object. Boot still fails fast with a field-pointing, **no-value-echo** error on an invalid cost-map (reuses `validateSource` → `summarizeZodIssues`, LESSON 26).
- [ ] An empty file/env set still boots (the `DEFAULT_COST_MAP` defaults layer) — `loadConfig` with `fileSources:{}` yields `costMap === DEFAULT_COST_MAP` (by value) and is **deep-frozen** (mutation throws).
- [ ] A file override merges over defaults (e.g. `{ tokensPerUnit: 500 }` → `{tokensPerUnit:500, perToolCall:5, perSpawn:50}`).
- [ ] An invalid cost-map (e.g. `tokensPerUnit: 0` or negative, or a non-int) is **rejected at boot** (the divisor-positivity + int constraints fire).
- [ ] **Env layer:** out of scope for MVP (file+default only) UNLESS trivial — see Step-2.5 flag #2; the closed env allowlist (`envSchema.ts`) is NOT extended this slice unless you opt in.
- [ ] Full suite green; `/preflight` clean (incl `format:check` — LESSON 40). The energy module's existing tests stay green (shape unchanged).

## Wiring / entry point (Step 7.5)
`loadConfig` is the single boot-config entry point (already reachable — called at boot). This slice adds `costMap` to the composed `AppConfig` it returns; the **consumer is the P3.10 loop** (`appConfig.costMap` → `reconcileEnergy`/`energyFor*`), which lands in the following sub-slices. No new entry point — the field rides the existing `loadConfig` reachability. (Tested-but-not-yet-consumed is expected here, like the rest of the substrate; the named first consumer is P3.10 energy emission.)

## Files expected to touch
**Modified (runtime):**
- `apps/api/src/runtime/energy/costMap.ts` — add `CostMapConfigSchema` (Zod strictObject) + derive `CostMapConfig = z.infer<…>`; keep `DEFAULT_COST_MAP` + the three `energyFor*` fns unchanged; update the header comment (the AppConfig-wiring TODO is now resolved).
- `apps/api/src/runtime/config/configSchema.ts` — import `CostMapConfigSchema`/`CostMapConfig`; add `readonly costMap: CostMapConfig` to `AppConfig`. (Do NOT re-declare a cost-map default here — `DEFAULT_COST_MAP` stays canonical in `costMap.ts`, single-source LESSON 5.)
- `apps/api/src/runtime/config/loadConfig.ts` — add `costMap?` to `FileSources`; compose `costMap` via `validateSource` + `deepMerge(DEFAULT_COST_MAP, fileSources.costMap ?? {})`; add to the deep-frozen return.

**Tests:**
- `apps/api/test/unit/runtime/config/loadConfig.test.ts` (extend) — the compose/override/reject/deep-freeze cases below.
- `apps/api/test/unit/runtime/energy/costMap.test.ts` (extend, if present) — `DEFAULT_COST_MAP` validates against `CostMapConfigSchema`; the schema rejects `tokensPerUnit:0`/negative/non-int.

If `CostMapConfig` is imported anywhere that breaks on the `z.infer` change (shouldn't — shape identical), flag at Step 2.5.

## RED test outline (Step 2)
1. **`loadConfig_composes_costmap_from_defaults`** — `loadConfig({env, fileSources:{}})` → `config.costMap` deep-equals `DEFAULT_COST_MAP`. Why: §4/§5 baseline boots.
2. **`costmap_file_overrides_merge_over_defaults`** — `fileSources.costMap = { tokensPerUnit: 500 }` → `{500, 5, 50}`. Why: `defaults < file` precedence (§5).
3. **`costmap_is_deep_frozen`** — mutating `config.costMap.tokensPerUnit` throws (strict/frozen). Why: immutable boot config (§5, defense-in-depth).
4. **`invalid_costmap_rejected_at_boot`** — `fileSources.costMap = { tokensPerUnit: 0 }` (and a negative `perToolCall`) → `loadConfig` throws an `Invalid cost-map configuration — …` error whose message contains the field path/code but **not the value** (LESSON 26). Why: fail-fast + no-value-echo (rule #4).
5. **`default_cost_map_satisfies_schema`** (costMap.test) — `CostMapConfigSchema.safeParse(DEFAULT_COST_MAP).success === true`; `safeParse({tokensPerUnit:0,…}).success === false`. Why: the schema is the single source, defaults must satisfy it.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **NONE (Appendix-A).** `CostMapConfig`/`AppConfig` are **runtime-local config shapes, not Appendix-A frozen models** (same as `SeedAgenomeSet`/`AppConfig.seedSet` in kernel-006 — no cross-doc row). No `apps/api/CLAUDE.md` cross-doc table row, no `ARCHITECTURE.md` Appendix-A change. (If you judge the `costMap` AppConfig field worth a one-line note in the §5 boot-config prose, flag it — but it's runtime config, not a contract.)

## Things to flag at Step 2.5
1. **Schema bounds.** My default vote: `tokensPerUnit` = int **positive** (divisor, 0 illegal); `perToolCall`/`perSpawn` = int **nonnegative** (a free tool/spawn is conceivable). Confirm or tighten to positive-all-three.
2. **Env layer.** My default vote: **file+default only** for MVP (cost values are stable demo constants; the closed env allowlist stays untouched). If you'd rather match `caps`' env-tunability (add `costMap` to `envSchema.ts`'s allowlist + `envOverrides.costMap`), that's a clean extension — flag it and I'll bless adding the env layer. Not required for P3.10.
3. **Field placement / single-source.** Confirm `DEFAULT_COST_MAP` stays the ONLY cost-map default (in `costMap.ts`), `configSchema` imports it — no second default literal (LESSON 5).

## Dependencies + sequencing
- **Depends on:** P3.1 boot config (`db4b045`, done) + P3.5 cost map (`bf99d59`, done). No cross-track dependency; no `git merge cody` needed (this slice touches no scrub/ProviderMeta surface).
- **Blocks:** P3.10 energy emission sub-slice (the loop reads `appConfig.costMap` for `reconcileEnergy`/`energyFor*`).
- **Sequencing:** the FIRST P3.10 sub-slice — independent of the verify/score/reproduce seam-scope question (which only affects the loop-body slices). Safe to land while that resolves.

## Estimated commit count
**1.** A small, self-contained boot-config extension — `feat(runtime)` (the cost-map schema + AppConfig field + loadConfig composition are one logical change). NOT a safety-invariant slice (config wiring; no cap/energy-debit/scrub logic changes). security-reviewer policy = **off/phase-boundary** (no invariant touched) — your call, but it doesn't qualify for the per-slice invariant gate.

## Lessons-logged candidates anticipated
- Likely **none** (a routine single-source + boot-compose extension already covered by LESSON 5/26/32). Flag at Step 9 only if something distinct surfaces.

## How to invoke
1. Read this brief + `loadConfig.ts`/`configSchema.ts`/`costMap.ts` (the compose pattern to mirror).
2. Run `/tdd cost_map_appconfig_wiring` (spec-lint stamp in the dispatch — Step 0 can skip re-lint).
3. Step 2.5 — send the per-test write-up + coverage map; the load-bearing confirms are #1 (schema bounds) + #3 (single-source default).
4. Step 9 — confirm NO cross-doc Appendix-A row (runtime-local config shape); I tick nothing cross-track.
