# kernel-006 — Runtime safety substrate (P3.6 RNG · P3.4 caps/kill · P3.5 energy · P3.9 spawn+seed) + P0.16 reconcile

- **Date:** 2026-06-21
- **Phase:** Phase 3 (Runtime kernel) — the pure decide/compute safety substrate (P3.4/P3.5/P3.6/P3.9); plus a cross-track Phase-0 contract reconciliation (P0.16).
- **Track:** kernel · **Branch:** track/kernel · **HEAD at close:** `6cdde0c`
- **Predecessor:** [kernel-005](kernel-005-2026-06-21-boot-config-state-machines-two-freeze-amendments.md)
- **Successor:** _(next round — kernel-026 sv4→5 terminal-event amendment is the first slice)_

## Why this session existed

Successor implementer session (prior impl cycled at 77% after P3.2). Two jobs: (1) a **user-approved cross-track contract reconciliation** — the kernel had bumped `CURRENT_SCHEMA_VERSION` to 4 (degraded→v3, repairing→v4) unaware that cody's **P0.16** judge seam had independently claimed v3, a collision blocking the kernel→cody merge; (2) continue Phase 3 — the kernel's **pure safety substrate** the P3.10 generation loop will wire together: RNG/replay (rule #7), caps + kill-switch (rule #1), energy ledger (rule #8), spawnBudget clamp (rule #1), and the gen-0 authored seed set.

## What was built (7 commits)

| Commit | Slice |
|---|---|
| `117a0ec` | **P0.16 reconciliation** — merge cody → track/kernel, UNION the 3 disjoint contract changes onto one monotonic line (judge=v3, degraded+repairing fold to v4; `CURRENT_SCHEMA_VERSION=4`; RunEventType 37 + GenerationStatus 9 + CandidateStatus 9 + JudgeResult). Single merge commit. |
| `d5a3c32` | **P3.6** — seeded RNG (mulberry32) + the LIVE/REPLAY outcome-persistence bridge (rule #7). |
| `dac730d` | **P3.4** — RunCaps enforcement + kill switch (rule #1). |
| `bf99d59` | **P3.5** — success-only energy ledger (rule #8). |
| `fb7007c` | **P3.9** — spawnBudget clamp (rule #1 half). |
| `7387227` | **P3.9** — gen-0 authored seed set (feature half; completes P3.9). |
| `6cdde0c` | **chore(format)** — retro prettier-wrap of two P3.4/P3.5 test files (lesson §14 drift). |

### Files created (by slice)
- **P3.6:** `apps/api/src/runtime/rng/seededRng.ts` (mulberry32 + `readRngSeed`), `…/rng/persistOutcomes.ts` (PRNG-free LIVE/REPLAY outcome sources) + 2 tests.
- **P3.4:** `apps/api/src/runtime/caps/{capEnforcer,killSwitch,capLedger}.ts` + 3 tests.
- **P3.5:** `apps/api/src/runtime/energy/{costMap,estimateReconcile,energyLedger}.ts` + 3 tests.
- **P3.9 clamp:** `apps/api/src/runtime/spawn/spawnBudgetClamp.ts` + test.
- **P3.9 seed:** `apps/api/src/runtime/seed/{seedAgenomes.config,gen0SeedSet}.ts` + 2 tests.

### Files modified
- **P0.16:** `packages/contracts/src/version.ts` (=4, linearized history), `events/envelope.test.ts` / `__schema-snapshots__/field-sets.test.ts` / `test-fixtures/fixtures-valid.test.ts` (v4 + member-set union), `domain/{generation,candidate-idea}.ts` (degraded/repairing fold-to-v4 comments); CLAUDE.md/LESSONS.md union (orchestrator-written).
- **runtime exports:** `apps/api/src/runtime/index.ts` (each slice adds its barrel exports).
- **P3.9 seed boot wiring:** `apps/api/src/runtime/config/configSchema.ts` (+`AppConfig.seedSet`), `…/config/loadConfig.ts` (validate the 'seed-set' boot source).

## Decisions made
- **P0.16:** single merge commit whose tree is the reconciled union (cleanest history). Lesson collision (kernel §32 boot-config vs cody §32 judge) resolved by renumbering cody's judge lesson §32→§34 (keep both).
- **P3.6:** mulberry32 + `seed >>> 0` (byte-stable, zero deps). The `persistOutcomes` module is PRNG-import-free (LIVE takes a structural `RngDraws`) so REPLAY can't re-sample even transitively — a stronger rule-#7 structural guarantee than the brief asked. `pick` records the chosen INDEX (replay-safe for any array). Dropped `SeededRng.pick` (untested, no consumer, raw-pick is replay-unsafe).
- **P3.4:** §5's "every non-terminal → failed/stopped" does NOT map 1:1 onto the P3.2 tables (running has no direct →stopped; pending/degraded have no →failed). Resolved (orchestrator TWEAK) into a **per-state §3 disposition** validated through the guards; terminalizing/transient states are excluded (they drain through their in-flight step). `configured→cancelled` + `pending→skipped` had no registry event → `terminalEvent: null` (the Finding that became kernel-026).
- **P3.5:** llm reconcile **requires `providerMeta`** (eventType-discriminated input, compile-time + fail-loud backstop) — no silent `actual=estimate` fallback (would leak an estimate into the cap-relevant cumulative). Cumulative folds **actual**, not estimate.
- **P3.9:** count clamped via the single-sourced `clampSpawnBudget`; `SeedAgenomeTemplate` single-sourced from `Agenome.shape` (strict → spawn-assigned fields unrepresentable); deterministic positional ids `${runId}-gen0-${i}` (no RNG).

## Decisions explicitly NOT made (deferred)
- **kernel-026 (sv4→5 terminal-event amendment)** — STARTED (Step-2.5 RED tests) then **deferred to next round** by lead decouple (its cody merge needs a cross-track announce + verifier `candidate.rejected` blessing, in flight; the substrate needs neither). RED WIP reverted; brief intact with the validated file surface folded in. **This is next round's FIRST slice.**
- **agenome.failed / candidate.rejected emission** — registry-adds only (deferred: loop P3.10 / verifier cross-track).
- **Cost-map → AppConfig wiring** — `DEFAULT_COST_MAP` is the canonical §4 default in `costMap.ts`; AppConfig wiring is a P3.1/P3.10 follow-up.

## TDD compliance
**Clean.** Every code slice ran RED→GREEN with a Step-2.5 review (P3.6 took an `ADD:` pick-semantics; P3.4 a `TWEAK:` per-state kill-mapping; P3.5 a `TWEAK:` llm-PM-required). The P0.16 reconciliation was a guided merge-reconcile (RED = conflicted tree; GREEN = resolved + full suite). `chore(format)` was whitespace-only (no behavior, no test). No violations.

## Cross-doc invariant audit (multi-track memory check)
Every model field change this session was flagged at Step 9 and confirmed by the orchestrator:
- **P0.16:** RunEventType 37 / GenerationStatus 9 / CandidateStatus 9 / JudgeResult / schemaVersion 4 — reconciled; orchestrator wrote the CLAUDE.md union, ARCHITECTURE Appendix-A → cody (lead, at merge).
- **P3.4:** §5 kill-switch trigger→terminal mapping flagged as an Architecture-doc note → cody (lead). The missing `run.cancelled`/generation-skip registry events escalated as a Finding → user (ratified → kernel-026).
- **P3.6/P3.5/P3.9:** NONE (consume frozen contracts; `SeedAgenomeTemplate` + `AppConfig.seedSet` are runtime-local config shapes, not Appendix-A models). No drift.

## Reachability
All substrate components are exported from `apps/api/src/runtime/index.ts`. No production *caller* yet — by design; the P3.10 generation loop + P3.12 worker are the named first consumers (deferred per each brief). `AppConfig.seedSet` is validated at boot via `loadConfig` (reachable). Tested-but-unwired is expected for the substrate; the consuming phases are named in Open follow-ups (not a silent gap).

## Open follow-ups (for the successor / P3.10)
- **kernel-026 (sv4→5 amendment) = NEXT round's first slice.** Brief complete (validated file surface + the envelope.test.ts/fixtures-valid.test.ts version-window catch folded in); lead's announce-before-merge drafted; RED WIP reverted → re-runs fast to GREEN.
- **P3.10 generation loop carry-forwards:**
  - Drain-then-terminalize the killSwitch-EXCLUDED states: `completing→completed`, `stopping→stopped`, `degraded→verifying→failed` (the kill switch never force-relabels them).
  - **L21 trap:** the verifier scrub-fix `git merge cody` + a scrub→append→read round-trip on `energy.spent` ProviderMeta before emitting (track/kernel still has the OLD scrub — fine, the substrate never appends/scrubs).
  - Emission wiring: `energy.spent` / `provider_call_failed` (no debit on failure) · the cap-breach events (run.failed/stopped/energy_exhausted/generation_failed + run.cancelled/generation.skipped once sv5 lands) · `agenome.spawned` (post-materializeGen0) · `agenome.failed`.
  - Construct LIVE outcome source from `createSeededRng(readRngSeed(config))`; consume `capLedger`/`cumulativeSpend` for the energy-dimension cap enforcement + `GET /runs/:id/health`.
- **Cost-map → AppConfig** wiring (P3.1/P3.10). **§5 kill-mapping Architecture note** → cody (lead).

## How to use what was built
The substrate is pure decide/compute — the loop owns emit/persist (§5 ownership split). Typical P3.10 wiring: `materializeGen0(cfg.seedSet, runId, gen0Id, cfg.caps.maxPopulation)` → per agenome, `clampSpawnBudget` offspring budgets; before each bounded action `enforceCap`/`enforceWallClock`; on a breach `planKillSwitch` → append the named events + drain; on a successful provider call `reconcileEnergy` → append `energy.spent`; fold `cumulativeSpend` into `capLedger` for the energy dimension.
