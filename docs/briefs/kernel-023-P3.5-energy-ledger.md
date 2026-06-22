# /tdd brief — energy_ledger_success_only_estimate_reconcile

## Feature
The kernel's **success-only energy ledger** (P3.5) — the rule-#8 safety pin. Three PURE components in `apps/api/src/runtime/energy/`: `costMap` (the config-driven `doppl_energy` cost map → integer energy from usage), `estimateReconcile` (pre-call **estimate** + post-call **reconcile** against actual provider usage → the `EnergyEvent` payload carrying BOTH), and `energyLedger` (a pure cumulative-spend fold over `energy.spent` events → true successful spend per scope, feeding the P3.4 cap enforcer). They **compute only** — emission of `energy.spent` / `provider_call_failed` + the secret-scrub + energy-exhaustion handling land in the loop (P3.10) (§5 ownership split; lesson 33). SOLO safety slice.

## Use case + traceability
- **Task ID:** P3.5.
- **Architecture sections it implements:** `ARCHITECTURE.md §4` (*Energy — one integer unit `doppl_energy`; cost map `tokensPerUnit:1000, perToolCall:5, perSpawn:50`; debited pre-call with an estimate, reconciled post-call against returned provider usage; `energy.spent` persists both estimate and actual; failed/retried/repaired attempts do NOT debit energy — a failed attempt emits `provider_call_failed`, never `energy.spent`*); `§5` (the kernel owns the energy ledger). Key safety rule #8.
- **Consumed (never redefined):** frozen `EnergyEvent` (P0.9 — strict 10-field: `{id, runId, generationId?, agenomeId?, eventType:llm|tool|spawn, estimate:int, actual:int, unit:'doppl_energy', reason, providerMeta?}`, NO failure/retry field by shape) + `ProviderMeta` (`{provider, modelId, gatewayRequestId, tokensIn:int≥0, tokensOut:int≥0, costEstimate?}`); the cost-map values from config (`AppConfig`, P3.1). The cumulative fold feeds the P3.4 `capLedger` energy dimension.
- **Pattern (follow the SHIPPED codebase):** P3.2 guards + P3.4 caps + P3.6 RNG established **pure compute / loop emits** (`runtime/index.ts` barrel §5 ownership note). The energy ledger COMPUTES the debit + builds the `EnergyEvent` payload; the loop (P3.10) appends `energy.spent` through the event-store append path (which applies the secret-scrub) and emits `provider_call_failed` on a failure.
- **Safety:** key safety rule #8 (energy = successful productive spend only). SOLO — never bundled.

## Acceptance criteria (what "done" means)
- [ ] `costMap` is **config-driven** (`tokensPerUnit:1000, perToolCall:5, perSpawn:50` from config, not hard-coded literals in the logic): `energyForLlm(tokens)`, `energyForTool()` = perToolCall, `energyForSpawn()` = perSpawn — all returning **integer `doppl_energy`**.
- [ ] `estimateReconcile` computes a pre-call **estimate** and a post-call **actual**, and builds an `EnergyEvent` carrying **BOTH** (`estimate` + `actual`) + the `eventType` + `providerMeta?` + scope ids + `unit:'doppl_energy'`. For `llm`, `actual` derives from `ProviderMeta.tokensIn + tokensOut`; for `tool`/`spawn`, estimate === actual (flat per-event cost, no token variance).
- [ ] **Success-only (rule #8):** the ledger produces an `EnergyEvent` ONLY from a successful productive call. There is **no parameter path** by which a failed/retried/repaired attempt yields an `EnergyEvent` (the failure path is the caller's `provider_call_failed`, which this module never produces an `EnergyEvent` for). A test pins that there is no failure/retry/repair input that returns an energy debit.
- [ ] `energyLedger` cumulative fold: `cumulativeSpend(events, scope)` is a **pure** sum of **`actual`** `doppl_energy` over `energy.spent` events for a run/generation/agenome scope — **actual, not estimate** (so the P3.4 cap enforcer sees true successful spend, not estimated reservations rolled back on failure).
- [ ] `eventType ∈ {llm,tool,spawn}` only (the frozen 3-member union — no failure member). The "no spend by an agenome in `spent|failed|culled`" precondition is enforced **upstream by the P3.2 agenome state machine** (an inactive agenome can't reach a state that calls the ledger) — NOT re-checked in the pure ledger; documented, not duplicated.
- [ ] All three components are **pure**: same inputs → same result; no emit, no mutation, no IO (lesson 33/26).
- [ ] All unit tests in `apps/api/test/unit/runtime/energy/*.test.ts` pass; `/preflight` clean.

## Wiring / entry point (Step 7.5)
**none — emission + scrub + energy-exhaustion handling land in P3.10.** P3.5 exports `costMap` fns, `estimateEnergy`/`reconcileEnergy`, and `cumulativeSpend` (+ types) from `apps/api/src/runtime/index.ts` (alongside P3.2/P3.4/P3.6). **First consumers (named, lesson 20):** P3.10 generation loop (estimate pre-call → make the provider call → on success `reconcileEnergy` + append `energy.spent` through the event-store append path; on failure append `provider_call_failed` + NO debit; on cumulative ≥ `energyBudget` stop scheduling + drain + emit `energy_exhausted` + still score already-verified candidates) + P3.4 `capLedger` (consumes `cumulativeSpend` for the energy dimension).

> **CARRY-FORWARD → P3.10 (NOT this slice) — the verifier scrub fix (L21 trap):** `energy.spent` carries `ProviderMeta` (`tokensIn`/`tokensOut`). The verifier's frozen **P0.2 scrub fix** (tokensIn/tokensOut numeric corruption) is now in **cody**. When P3.10 builds the `energy.spent` emission (scrub→append→read), it MUST `git merge cody` to pull the fixed scrub and add a scrub→append→read round-trip assertion — **never write a divergent scrub** (lesson 21/36, L21 trap). P3.5 is pure (no append → no scrub), so it needs neither the merge nor the scrub here.

## Files expected to touch
**New:**
- `apps/api/src/runtime/energy/costMap.ts` — the config-driven cost map + `energyForLlm/Tool/Spawn`.
- `apps/api/src/runtime/energy/estimateReconcile.ts` — `estimateEnergy` + `reconcileEnergy` → `EnergyEvent` payload.
- `apps/api/src/runtime/energy/energyLedger.ts` — `cumulativeSpend` pure fold.
- `apps/api/test/unit/runtime/energy/{costMap,estimateReconcile,energyLedger}.test.ts`

**Modified:**
- `apps/api/src/runtime/index.ts` — export the energy components + types.

If implementation needs files beyond this list, flag at Step 2.5.

## RED test outline (Step 2)
`costMap.test.ts`:
1. **`cost_map_llm_tool_spawn`** — `energyForLlm`/`energyForTool` (=5) / `energyForSpawn` (=50) from config; integer `doppl_energy`. Why: §4 cost map.
2. **`cost_map_is_config_driven`** — passing a different cost-map config changes the result (no hard-coded literal in the logic). Why: §4 "config, tunable."

`estimateReconcile.test.ts`:
3. **`reconcile_persists_estimate_and_actual`** — llm: estimate (expected tokens) + actual (`ProviderMeta.tokensIn+tokensOut`) BOTH on the `EnergyEvent`; both ints. Why: §4 "persists both estimate and actual."
4. **`reconcile_builds_valid_energy_event`** — the produced object parses against frozen `EnergyEvent` (eventType, unit:'doppl_energy', scope ids, providerMeta). Why: P0.9 contract.
5. **`tool_and_spawn_estimate_equals_actual`** — flat per-event cost (no token variance). Why: §4 perToolCall/perSpawn.
6. **`no_energy_event_for_failure_path`** — there is no failure/retry/repair input that yields an `EnergyEvent` (rule #8 — failures are the caller's `provider_call_failed`). Structural/behavioral.

`energyLedger.test.ts`:
7. **`cumulative_sums_actual_per_scope`** — `cumulativeSpend` sums **actual** over `energy.spent` events for run/generation/agenome; ignores non-energy events. Why: §4 + feeds P3.4 cap enforcer.
8. **`cumulative_uses_actual_not_estimate`** — when actual≠estimate, the cumulative reflects **actual** (true successful spend). Why: §4 "cap enforcer sees true successful spend, not estimated reservations."
9. **`energy_ledger_is_pure`** — same inputs → equal result; no mutation/IO.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** **NONE.** Consumes frozen `EnergyEvent`/`ProviderMeta`/`RunCaps`; cost map + fold are adapter-local.
- **Orchestrator doc rows to write hot:** likely a Convention lesson (energy = pure success-only debit; cumulative folds actual; emission/scrub deferred — extends lesson 33). No §-anchor change expected.
- **§2.5-seam model touched?** No — consumes the frozen contracts; no Appendix-A field-set change (no schema-snapshot test).

## Things to flag at Step 2.5
1. **Pure compute / loop emits + scrub + git-merge-cody deferred.** My default vote: **pure** — P3.5 computes estimate/reconcile/cost + the cumulative fold; the loop (P3.10) appends `energy.spent` (applying the scrub) and emits `provider_call_failed`. The verifier scrub fix (now in cody) is pulled at P3.10, NOT here (P3.5 never appends). Confirm you do NOT `git merge cody` in this slice.
2. **Cost rounding for `llm`.** `tokens / tokensPerUnit` isn't integer in general. My default vote: **`ceil`** (a partial unit costs 1 — conservative; never under-debits, so the cap fails closed correctly). Flag if you prefer floor/round.
3. **Estimate input source.** My default vote: the caller passes **expected tokens** (or a per-role default) pre-call; `estimateEnergy` is pure over that input. The ledger doesn't itself predict tokens.
4. **Cumulative uses `actual`.** My default vote: the cumulative fold sums **actual** (reconciled) energy, not estimate — estimate is recorded on the event for observability but the cap-relevant total is actual.
5. **Agenome-can't-spend precondition.** My default vote: rely on the **P3.2 agenome state machine** (an agenome in `spent|failed|culled` can't reach an active state that calls the ledger) — do NOT re-check it in the pure ledger (no duplication; lesson 5/33 boundary — semantic preconditions stay in the kernel/loop).

## Dependencies + sequencing
- **Depends on:** P0.9 (`EnergyEvent`/`ProviderMeta` frozen) ✓ · P3.2 guards ✓ · P3.4 caps (the cumulative feeds `capLedger`) ✓ · **P3.3 satisfied-by-P1.3/P1.4**. Needs neither the cross-track scrub merge (that's P3.10) nor emission.
- **Blocks:** P3.10 (loop emits energy.spent/provider_call_failed using these + handles exhaustion), P3.4 energy-dimension cap enforcement (consumes `cumulativeSpend`), and the selection-track "energy efficiency" fitness component (shares the `doppl_energy` unit).

## Estimated commit count
**1.** SOLO safety-critical slice (key safety rule #8 — energy = success-only spend) — its OWN commit, **never bundled** (TDD posture + brief-template energy pitfall). **security-reviewer in the loop** (policy: invariant): focus on the structural no-debit-on-failure (rule #8), the cumulative-uses-actual (no estimate leakage into the cap-relevant total), and config-driven cost (no hard-coded cost literals). `feat(runtime)`.

## Lessons-logged candidates anticipated
- **Convention candidate** — "energy ledger is a PURE success-only debit: estimate+reconcile build the `EnergyEvent` (both persisted), the cumulative fold sums ACTUAL per scope (feeds the cap enforcer), failures yield NO `EnergyEvent` (rule #8 by shape); emission + scrub deferred to the loop (extends lesson 33)."
- **Carry-forward reminder (P3.10)** — the verifier scrub-fix `git merge cody` + the scrub→append→read round-trip on `energy.spent` ProviderMeta (L21 trap) lands with the emission slice, not here.

## How to invoke
1. **Read this brief** + the P3.4 caps slice (`runtime/caps/`) for the pure-compute pattern this mirrors; note the §5 ownership split (compute here, emit in P3.10).
2. **Run `/tdd energy_ledger_success_only_estimate_reconcile`**.
3. **Step 0/1** — confirm restatement + file list (three pure components, emission deferred).
4. **Step 2.5** — send the per-test write-up + coverage map; the load-bearing confirmations are #1 (pure, no git-merge-cody here) + #2 (cost rounding).
5. **Step 9** — surface anything unexpected; confirm the P3.10 scrub-merge carry-forward is on record.
