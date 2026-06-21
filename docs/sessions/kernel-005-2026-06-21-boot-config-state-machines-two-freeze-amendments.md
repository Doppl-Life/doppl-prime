# kernel-005 — boot config loader · state machines (P3.2) · two freeze amendments (GenerationStatus + CandidateStatus)

- **Date:** 2026-06-21
- **Track / phase:** kernel · Phase 3 (runtime kernel) open + 2 Phase-0 freeze amendments
- **Role:** kernel-runtime-implementer
- **Predecessor:** [kernel-004](kernel-004-2026-06-21-retrieval-evidence-resolver-replay-reader.md) (P2.7 · P1.7 · P1.8 — Phase-1 close)
- **Successor:** _(next kernel-runtime-implementer session — P3.4+ caps/energy/RNG, after the cycle)_
- **Related (orchestrator territory):** [kernel-003](kernel-003-2026-06-21-orchestrator-routing-ledger.md) (orchestrator routing ledger)
- **Commits this session (6):** `86553c3` (kernel-014) · `db4b045` (P3.1) · `a1da497` (P0.15-amend) · `b9ad31e` (P3.2-partial) · `afaab95` (P0.5-amend) · `087f2b1` (kernel-019, completes P3.2)

## Why this session existed

Continue the kernel arc into Phase 3 (runtime kernel) while closing two fast-follows: a P1.8 code-quality hardening (kernel-014) and the four kernel state machines (P3.2). The state-machine work surfaced **two frozen-enum gaps** — `GenerationStatus` lacked `degraded` and `CandidateStatus` lacked `repairing`, both required by ARCHITECTURE §3 — each fixed via a lesson-§19 freeze amendment before the dependent machine could be built. Ends at the clean **P3.2-COMPLETE** boundary (cycle point).

## What was built

### Files created
- `apps/api/src/runtime/config/loadConfig.ts` (P3.1) — the single boot composition point → deep-frozen immutable `AppConfig`.
- `apps/api/src/runtime/config/configSchema.ts` (P3.1) — `AppConfig` type + `DEFAULT_*` + problem-set schema.
- `apps/api/src/runtime/config/envSchema.ts` (P3.1) — the CLOSED env→config allowlist projection (`projectEnvOverrides`).
- `apps/api/src/shared/deep-merge.ts` (P3.1) — single-sourced `defaults<file<env` merge (closes the §27 carry-forward).
- `apps/api/src/shared/zod-errors.ts` (P3.1) — single-sourced no-echo Zod summarizer (`summarizeZodIssues`).
- `apps/api/src/runtime/state/transitionGuard.ts` (P3.2) — shared `makeTransitionGuard(table, terminals)` + `TransitionDecision`.
- `apps/api/src/runtime/state/{runStateMachine,generationStateMachine,agenomeStateMachine,candidateStateMachine}.ts` (P3.2) — the 4 per-machine transition tables + guards.
- `apps/api/src/runtime/index.ts` (P3.2) — the runtime area barrel (state-machine guards).
- Tests: `runtime/config/loadConfig.test.ts` (10) + `shared/deep-merge.test.ts` (4); `runtime/state/{transitionGuard,run,generation,agenome,candidate}StateMachine.test.ts` (4+3+6+6+5=24) [unit].

### Files modified
- `apps/api/src/event-store/canonical-serialization.ts` (kernel-014) — `canonicalize` toJSON-once per slot (split `canonicalizeStructure`) + drop function/undefined values (pure-data tree).
- `apps/api/src/event-store/append.ts` (kernel-014, then P3.1) — `schema_invalid` error path+code only; later re-pointed to the shared `summarizeZodIssues`.
- `apps/api/src/model-gateway/config.schema.ts` (P3.1) — re-point `deepMerge` to the shared util (re-export).
- `packages/contracts/src/domain/generation.ts` (P0.15-amend) — `GenerationStatus` 8→9 (+`degraded`).
- `packages/contracts/src/domain/candidate-idea.ts` (P0.5-amend) — `CandidateStatus` 8→9 (+`repairing`).
- `packages/contracts/src/version.ts` (both amendments) — `CURRENT_SCHEMA_VERSION` 2→3→4 + version-history comment.
- contracts test snapshots/fixtures (both amendments) — member-set snapshots 8→9 + the move-with-the-bump version pins.
- kernel-014/P3.2 tests for the canonical/append hardening + the candidate machine + barrel exports.

## Decisions made
- **P3.1 — closed env→config allowlist** (orchestrator refinement over the brief): the env record feeds two disjoint paths — credentials → `assertProviderCredentials` ONLY (never merged into config), config overrides → an explicit per-key allowlist (no prefix sweep, so a secret-shaped `DOPPL_…` var can't inject). Rule #4 env-injection surface pinned by a test.
- **P3.1 — single-source at the 2nd consumer**: extracted `shared/deep-merge.ts` + `shared/zod-errors.ts`, re-pointed the model-gateway + append mirrors (behavior-identical). Generalized §5 (single-source) from unions to any shared helper.
- **P3.1 — deep-frozen + readonly `AppConfig`** (defense-in-depth): downstream kernel code cannot mutate boot config.
- **kernel-014 — canonicalize drops function/undefined** (beyond the brief's "split a helper"): a surviving `toJSON` function would be re-invoked by the final `JSON.stringify`; the canonical tree must be pure data. The real Zod-4 no-echo vector is `unrecognized_keys` (a caller-controlled key), not the enum value the brief named.
- **P3.2 — pure (from,to)→decision over a per-machine table = the §3 spec, on one shared builder** (lesson §33); terminal-checked-first; semantic preconditions (the agenome fitness-score gate) stay in the kernel/P3.10 (§6), not the pure guard. `degraded` one-shot (running→degraded→verifying only).
- **Two freeze amendments (lesson §19, 2nd + 3rd applications)**: added `degraded` (GenerationStatus, v2→3) + `repairing` (CandidateStatus, v3→4). Each additive + backward-compatible (closure preserved; v1..N envelopes validate; older fixtures unchanged). `repairing` = clean v4 bump (NOT a fold into v3 — v3's fixtures were already committed).

## Decisions explicitly NOT made (deferred)
- **No fold of `repairing` into v3** — clean v3→v4 bump (the prior version's fixtures were committed; the lead does ONE v3+v4 cross-track merge anyway).
- **No re-point of the delegated validators** (`validateRunConfig`/`loadModelRegistry`, P0.3/P2.2) to `summarizeZodIssues` — they still use `issue.message`, but credentials structurally can't reach their inputs; a future tidy, out of scope.
- **No candidate machine in kernel-017** — deferred (the §3 finding) until the CandidateStatus amendment landed; built in kernel-019.
- **No env→config knobs beyond a tiny allowlist** — grows as kernel knobs need env control.

## TDD compliance
**Clean.** Every slice followed RED → Step-2.5 review → GREEN (the amendments via the §19 playbook: update tests/snapshot to the new expectation → RED against the old contract → amend → GREEN). No test written after implementation; no TDD violation. All safety-adjacent/invariant slices got a Step-8 security-reviewer fan-out (all CLEAR; in-slice fixes: P3.1 deepFreeze-doc nit, kernel-014 1 med + 2 low, P0.5-amend 1 nit, P1.8-followup already shipped).

## Reachability
- **P3.1 loadConfig** — THE boot composition point; first consumer P3.12 worker boot (`migrate→loadConfig→seed→start`). Shared `deepMerge`/`summarizeZodIssues` consumed by loadConfig + the re-pointed registry/append production paths.
- **P3.2 guards** (`canTransition{Run,Generation,Agenome,Candidate}`) — exported from `runtime/index.ts`; consumed by P3.4 (caps/kill) / P3.8 (repair edge) / P3.9 (seed agenome) / P3.10 (generation loop) before appending a lifecycle event.
- **Amendments** — no wiring (frozen enum + version constant); consumers are the state machines (now built) + future append-boundary lifecycle events.
- No tested-but-unwired gaps beyond the explicit lesson-20 P3.4/P3.8/P3.9/P3.10/P3.12 deferrals.

## Open follow-ups (Step-9 categorized; routed hot — orchestrator owns the docs)
- **Lessons banked (orchestrator):** §32 (boot-config composition pattern) + §5 tighten (single-source any shared helper at the 2nd consumer) + §33 (transition-guard pattern) + §26/§31 tightenings (kernel-014) + §19 tightening (clean-follow-up-bump beats re-opening committed fixtures).
- **Cross-doc invariant changes (flagged Step 9; orchestrator hot-wrote the CLAUDE.md rows in the working tree, routes ARCHITECTURE Appendix-A + §A0 to cody):** `GenerationStatus` 8→9, `CandidateStatus` 8→9, `CURRENT_SCHEMA_VERSION` 2→4. **Lead action:** ONE kernel→cody merge carrying v3+v4 (schemaVersion 2→4, Generation 9 + Candidate 9) + verifier/selection/demo re-record both GenerationStatus(9)/CandidateStatus(9) snapshots (additive, non-urgent — none use the new members yet).
- **Future TODO — P3.4+ (next session, post-cycle):** caps enforcement (reads `AppConfig.runConfig.caps`/`AppConfig.caps` + drives terminal transitions via the guards), energy ledger, RNG seeding, the role-dispatching `providerCall` boot wiring (composes the P2.5/P2.6/P2.7 adapters over `AppConfig`), the worker boot, the generation loop (consumes loadConfig + all 4 guards).
- **Future TODO — P3.8/P3.10:** P3.8 repair-edge consumes `canTransitionCandidate` + enforces the ≤1 repair budget (the semantic precondition the guard deliberately omits); P3.10 generation loop consumes all guards + emits/persists.

## How to use what was built
- **Boot:** `loadConfig({ env: process.env, fileSources })` → frozen `AppConfig`; credentials via `assertProviderCredentials` (env-only); precedence `defaults<file<env` via the closed allowlist.
- **Guard a transition:** `canTransition{Run,Generation,Agenome,Candidate}(from, to)` → `{allowed:true}` or `{allowed:false, reason:'illegal_transition'|'from_terminal', from, to}` — call BEFORE appending a lifecycle event; the guard decides, the loop emits, the appender persists.
