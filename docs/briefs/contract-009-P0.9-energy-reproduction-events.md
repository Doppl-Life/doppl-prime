# /tdd brief — energy_and_reproduction_events

## Feature
Freeze `EnergyEvent` (id, runId, generationId?, agenomeId?, eventType, estimate, actual, unit:doppl_energy, reason, providerMeta?) and `ReproductionEvent` (id, runId, parentAgenomeIds[], childAgenomeId, mode, crossoverPoints, mutationSummary). Encodes two safety/correctness properties structurally: **energy = success-only spend (rule #8)** — `EnergyEvent` models ONLY successful productive spend (estimate + actual both required), with NO failed/retried/repaired debit field representable (failed attempts are a separate `provider_call_failed` event, never `energy.spent`); and **replay-determinism (rule #7)** — `ReproductionEvent.crossoverPoints` + `mutationSummary` are REQUIRED persisted RNG outcomes so replay reconstructs from stored outcomes and never re-samples. **SAFETY slice** (rule #8 — lead-mandated FULLY SOLO; rule #7). Own commit, never bundled.

## Use case + traceability
- **Task ID:** P0.9
- **Architecture sections it implements:** `ARCHITECTURE.md §4` (energy ledger + RNG capture), §5 ("Failed/retried/repaired attempts **do not debit energy**; bounded by retry count + per-call timeout + wall-clock cap; `provider_call_failed{attempt,reason}` per failed attempt"; energy.spent persists pre-call estimate + post-call reconciled actual), §8 (reproduction-fusion — two-level fusion: agenome-level crossover + output-level synthesis; child records parentage + mutation/fusion metadata; RNG outcomes persisted; degenerate <2-parent fallback = `mutation_only`). Appendix A line 477 (`EnergyEvent`) + 478 (`ReproductionEvent`, "RNG outcomes persisted") + 480 (`ModelGatewayResponse.providerMeta{provider, modelId, gatewayRequestId, tokensIn/Out, costEstimate?}` — see Q1).
- **Related context:** Both are §2.5 shared contracts (Appendix A) — schema-snapshots required. `EnergyEvent.unit` shares the `doppl_energy` unit with `RunCaps.energyBudget` (P0.3, integer). The no-failed-debit pin reuses the P0.6/P0.7 safety-by-shape pattern (lesson §9). The required-persisted-RNG pin reuses the P0.8 authoritative-once-computed pattern (lesson §13). `eventType` closed union mirrors the P0.1 RunEventType pattern (lesson §1). Does NOT import EvidenceRef. Lesson §6: counts/ranges (parentAgenomeIds 0–2, energy nonnegativity) are kernel-enforced; lesson §10: positive-guard-first on reject-only tests.

## Acceptance criteria (what "done" means)
- [ ] `EnergyEvent` is a strict object carrying EXACTLY: `id`, `runId`, `generationId?`, `agenomeId?`, `eventType`, `estimate`, `actual`, `unit`, `reason`, `providerMeta?` — unknown rejected; required (`id`,`runId`,`eventType`,`estimate`,`actual`,`unit`,`reason`) mandatory; `generationId?`/`agenomeId?`/`providerMeta?` omittable.
- [ ] `eventType` is the CLOSED 3-member union `llm | tool | spawn`; any other (incl. `failed`) rejected.
- [ ] **Energy = success-only spend (rule #8):** `EnergyEvent` carries NO failed/retried/repaired/success debit field — a payload adding `failed`/`retried`/`repaired`/`success` is rejected (strict + frozen field-set snapshot is the structural pin); `estimate` AND `actual` are BOTH required (pre-call estimate + post-call reconciled actual, §4).
- [ ] `unit` is fixed to `doppl_energy` (Q3); `estimate`/`actual` typed per Q4 (integer, the `doppl_energy` unit shared with `RunCaps.energyBudget`); `reason` a non-empty string.
- [ ] `ReproductionEvent` is a strict object carrying EXACTLY: `id`, `runId`, `parentAgenomeIds[]`, `childAgenomeId`, `mode`, `crossoverPoints`, `mutationSummary` — unknown rejected, required mandatory.
- [ ] `mode` is the CLOSED 4-member union `fusion | crossover | output_synthesis | mutation_only` (mutation_only = the degenerate <2-parent fallback, §3/§8); any other rejected.
- [ ] **Replay-determinism (rule #7):** `crossoverPoints` AND `mutationSummary` are REQUIRED persisted RNG outcomes (not optional) so replay reconstructs from stored outcomes and never re-samples (§4); shapes per Q5.
- [ ] `parentAgenomeIds` an array of ids (count 0–2 NOT enforced — kernel rule, §6); `childAgenomeId` a non-empty string.
- [ ] `providerMeta` per Q1 (shared `ProviderMeta` vs local); `z.infer` types exported from the barrel.
- [ ] **Schema-snapshot tests (§2.5 gate, tagged `spec(§4)`/`spec(§8)`):** `EnergyEvent` field-set + `eventType`(3) + `ReproductionEvent` field-set + `mode`(4) (+ `ProviderMeta` field-set if extracted) equal frozen snapshots.
- [ ] All unit tests pass; `/preflight` clean.

## Wiring / entry point (Step 7.5)
Entry point = the `@doppl/contracts` barrel exports `EnergyEvent`, `ReproductionEvent` (schemas + `z.infer` types), the `EnergyEventType` + `ReproductionMode` enums (+ `ProviderMeta` if extracted per Q1). Consumed downstream by the **kernel track (P3, energy ledger emits `energy.spent`)** and the **selection track (P5, reproduction emits `agenome.fused`/`mutated`)**; the `energy.spent` event payload (P0.10) reuses `EnergyEvent`. `none — runtime wiring (ledger debit + reproduction) lands in the kernel/selection tracks`. Reachability = barrel-exported + schema-snapshot-covered.

## Files expected to touch
**New:**
- `packages/contracts/src/domain/energy-event.ts` — `EnergyEvent` + `EnergyEventType`.
- `packages/contracts/src/domain/reproduction-event.ts` — `ReproductionEvent` + `ReproductionMode`.
- **(Q1 — if shared ProviderMeta extracted)** `packages/contracts/src/gateway/provider-meta.ts` — `ProviderMeta` (first consumer = this slice; P0.12 imports it).
- `packages/contracts/test/domain/{energy-event,reproduction-event}.test.ts`
- `packages/contracts/test/__schema-snapshots__/energy-reproduction-field-sets.test.ts`

**Modified:**
- `packages/contracts/src/index.ts` — re-export the above.

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN. (The `src/gateway/provider-meta.ts` file is itself a Q1 scope decision.)

## RED test outline (Step 2)
1. **`energy_event_accepts_valid_and_strict`** *(spec §4/§5)* — Asserts (positive-guard-first): full EnergyEvent round-trips (with + without the 3 optionals); unknown rejected; each required mandatory. Why: Appendix-A §4/§5 shape.
2. **`energy_eventType_closed_3_union`** *(spec §4)* — Asserts: `llm`/`tool`/`spawn` parse; `'failed'`/`'embedding'`/`''` rejected. Why: §4 closed eventType (no failure type — failures are `provider_call_failed`).
3. **`energy_no_failed_debit_field`** *(spec §4, rule #8)* — Asserts: `{...valid, failed:true}`, `{...valid, retried:1}`, `{...valid, repaired:true}`, `{...valid, success:false}` each REJECTED; omitting `estimate` OR `actual` rejected. Why: energy models ONLY successful spend; estimate+actual both persisted; no failed-attempt debit representable.
4. **`energy_unit_and_amounts`** *(spec §4)* — Asserts: `unit` fixed to `doppl_energy` (other value rejected); `estimate`/`actual` integers per Q4 (non-int rejected if Q4=int). Why: §4 doppl_energy unit shared with RunCaps.
5. **`energy_providerMeta`** *(spec §6)* — Asserts: `providerMeta?` omittable; when present, the shared `ProviderMeta` shape (Q1) — `{provider, modelId, gatewayRequestId, tokensIn, tokensOut, costEstimate?}`; a malformed providerMeta rejected. Why: §6 provider metadata (shared with P0.12 per lesson §5).
6. **`reproduction_event_accepts_valid_and_strict`** *(spec §8)* — Asserts (positive-guard-first): full ReproductionEvent round-trips; unknown rejected; each required mandatory. Why: Appendix-A §8 shape.
7. **`reproduction_mode_closed_4_union`** *(spec §8)* — Asserts: `fusion`/`crossover`/`output_synthesis`/`mutation_only` parse; other rejected. Why: §8 + §3 degenerate fallback = mutation_only.
8. **`reproduction_rng_outcomes_persisted`** *(spec §4/§8, rule #7)* — Asserts: omitting `crossoverPoints` OR `mutationSummary` rejected (both REQUIRED); shapes per Q5 accept valid + reject malformed. Why: replay reconstructs from stored RNG outcomes, never re-samples.
9. **`barrel_exports_energy_reproduction`** *(spec §2.5)* — Asserts: `EnergyEvent`/`ReproductionEvent`/`EnergyEventType`/`ReproductionMode` (+ `ProviderMeta` if extracted) re-exported. Why: §2.5 single import boundary.
10. **`schema_snapshot_energy_reproduction`** *(spec §4/§8/§2.5)* — Asserts: `EnergyEvent` field-set + `eventType`(3) + `ReproductionEvent` field-set + `mode`(4) (+ `ProviderMeta` field-set if extracted) == frozen snapshots. Why: §2.5 cross-track regression gate.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** NEW — `EnergyEvent`, `ReproductionEvent` (+ `EnergyEventType`, `ReproductionMode`; + `ProviderMeta` if Q1=extract).
- **§2.5-seam model touched?** **YES** — both shared. RED outline MUST include the schema-snapshots (#10).
- **Orchestrator doc rows to write hot:** add cross-doc rows for `EnergyEvent`/`ReproductionEvent` (§4/§8). **Architecture-doc note:** Appendix A row 478 leaves `crossoverPoints`/`mutationSummary` SHAPES open — whatever GREEN settles, add to the row at Step 9 (like the P0.7/P0.8 gap-fills). If `ProviderMeta` is extracted (Q1), note it as the canonical shared shape that P0.12's `ModelGatewayResponse.providerMeta` imports. **Safety-relevant:** any weakening of the no-failed-debit pin (rule #8) or the required-RNG pin (rule #7) is a Step-9 Finding.

## Things to flag at Step 2.5
1. **`providerMeta` — extract a shared `ProviderMeta` now (Option A) vs a local EnergyEvent-only shape (Option B).** My default vote: **Option A — extract `ProviderMeta` to `src/gateway/provider-meta.ts` now** (lesson §5: a type shared by ≥2 models is defined once at first use; `EnergyEvent.providerMeta?` and P0.12 `ModelGatewayResponse.providerMeta` are the SAME concept — Appendix A 480 enumerates `{provider, modelId, gatewayRequestId, tokensIn, tokensOut, costEstimate?}`). P0.9 is the first consumer → it defines it; P0.12 imports it. Widens this slice's file scope by one file (the `src/gateway/` module). **No secret field** (credentials load from env only, §14). Flag if you'd rather keep EnergyEvent's local + reconcile at P0.12 (I lean A — avoids divergence; I'll add a Carry-forward so P0.12 imports it).
2. **`unit` typing.** My default vote: `z.literal('doppl_energy')` (a single fixed unit — strongest pin; mirrors the `doppl_energy` unit named in RunCaps). Flag if you'd rather a 1-member enum.
3. **`estimate`/`actual` typing.** My default vote: `z.number().int()` (doppl_energy is an integer unit, shared with `RunCaps.energyBudget`); nonnegativity LEFT to the kernel (lesson §6 — a negative spend is a kernel-rejected producer bug, not a schema concern). Flag if you want `.nonnegative()` structurally.
3b. **`reason` typing.** My default vote: `z.string().min(1)`.
4. **`crossoverPoints` shape (Appendix A under-specifies).** My default vote: `z.array(z.number().int())` (concrete splice indices — an RNG outcome); REQUIRED. Flag a richer shape if reproduction needs per-segment provenance; whatever lands I add to Appendix A.
5. **`mutationSummary` shape (Appendix A under-specifies).** My default vote: a REQUIRED structured record of the applied mutations' RNG outcomes — e.g. `z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))` (trait → concrete new value) rather than `z.unknown()` (keep it inspectable for replay-diffing). Flag the exact shape; GREEN settles → Appendix A. The load-bearing pin is REQUIRED (rule #7), not the internal shape.
6. **`parentAgenomeIds` / `childAgenomeId`.** My default vote: `parentAgenomeIds = z.array(z.string().min(1))` (count 0–2 is a kernel rule, §6 — NOT enforced here; mutation_only may have 1); `childAgenomeId = z.string().min(1)`. Flag.
7. **No-failed-debit adversarial field list (rule #8).** My default vote: reject `failed`/`retried`/`repaired`/`success` via strictObject + the snapshot. Confirm the list is representative enough.
8. **Commit count.** My default vote: **1 — SAFETY slice (rule #8 energy success-only — lead-mandated FULLY SOLO; + rule #7), own commit, never bundled.** Commit: `feat(contracts): EnergyEvent + ReproductionEvent (P0.9)`.

## Dependencies + sequencing
- **Depends on:** none (independent).
- **Blocks:** P0.10 (`energy.spent` payload reuses `EnergyEvent`; `agenome.fused`/`mutated` reference `ReproductionEvent`), P0.12 (if Q1=A, `ModelGatewayResponse.providerMeta` imports the shared `ProviderMeta`), P0.14, the kernel (P3) + selection (P5) tracks.

## Estimated commit count
**1** — SAFETY slice. Energy carries key safety rule #8 (success-only spend); the lead ruled P0.9 FULLY SOLO (never in a feature bundle). ReproductionEvent rides the same task (both domain RNG/energy events) — one cohesive commit.

## Step-8 reviewer policy
**security-reviewer: FAN OUT** — invariant-touching (rule #8 no-failed-debit + rule #7 persisted-RNG). Review surface: confirm no failed/retried/repaired debit field is representable, estimate+actual both required, crossoverPoints+mutationSummary required, no secret field on providerMeta. code-quality-reviewer stays `phase-boundary`.

## Lessons-logged candidates anticipated
- **Convention candidate** — "Success-only accounting is pinned by shape: the spend event has NO failure/retry field (failures are a separate event type), so a failed-attempt debit is unrepresentable (lesson §9 applied to rule #8)." (May be folded into §9 rather than a new lesson.)
- **Architecture-doc note candidate** — settle `crossoverPoints`/`mutationSummary` shapes in Appendix A 478; record the shared `ProviderMeta` shape (if extracted) as P0.12's import source.

## How to invoke
1. **Read this brief end-to-end.** Q1 (shared ProviderMeta) + Q5 (mutationSummary shape) are the load-bearing calls; Q4 (RNG-outcome required-ness) is the rule-#7 pin.
2. **Run `/tdd energy_and_reproduction_events`.**
3. **Step 0/1** — confirm restatement + file list; confirm the Q1 decision (whether `src/gateway/provider-meta.ts` is in scope) and that these models do NOT import EvidenceRef.
4. **Step 2.5** — send the test-design write-up (per-test `Asserts` + per-acceptance-bullet coverage map) + answers to the questions. Wait for `APPROVED.`/`TWEAK:`/`ADD:`.
5. **Step 7→8** — security-reviewer fans out (invariant slice).
6. **Step 9** — categorized flags + ship-ask; any weakening of the no-failed-debit / required-RNG pins is a Finding.
