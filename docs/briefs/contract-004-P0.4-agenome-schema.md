# /tdd brief — agenome_schema

## Feature
Freeze the `Agenome` Zod contract — the agent-genome unit: exactly 11 fields (traits + lineage + a hint spawn budget + optional mutation provenance) with a closed 7-state `status` union — with its `z.infer` type and a field-name/status-member schema-snapshot.

## Use case + traceability
- **Task ID:** P0.4
- **Architecture sections it implements:** `ARCHITECTURE.md §3` (domain model + the Agenome state machine), Appendix A.
- **Related context:** Agenome is `Shared across tracks: yes (kernel·reproduction·event-store)`. The kernel (P3) drives its state machine + clamps `spawnBudget`; reproduction (P5) reads `eligible_parent`/sets `reproduced`; the event-store persists it. **Key safety rule #1** context: `spawnBudget` is a HINT only (the kernel clamps it to `min(remaining caps)`) — the schema must NOT let it masquerade as an authority (it's just a non-negative int here; clamping is P3).

## Acceptance criteria (what "done" means)
- [ ] `Agenome` is a strict Zod object carrying EXACTLY these 11 fields (Appendix A §3): `id`, `runId`, `generationId`, `parentIds[]`, `systemPrompt`, `personaWeights`, `toolPermissions[]`, `decompositionPolicy`, `spawnBudget`, `mutationMeta?`, `status`.
- [ ] `status` is a closed Zod enum with EXACTLY the 7 states `seeded, active, spent, eligible_parent, failed, reproduced, culled` (§3 Agenome state machine); any other value rejected.
- [ ] `parentIds` is an array of ids; the schema does NOT enforce the 0–2 count (gen-0 has none, fusion offspring usually 2) — 0, 1, 2, or more parse (count is a §3 relationship rule, enforced in the kernel, not the schema).
- [ ] `spawnBudget` is a hint **non-negative integer** (clamped at runtime by the kernel, NOT at schema level); negative/non-integer rejected.
- [ ] `mutationMeta` is **optional** so seeded gen-0 agenomes validate without it; when present it is a strict object capturing mutation provenance (provisional minimal shape — see Step-2.5 Q1).
- [ ] `Agenome` rejects unknown top-level fields (strictObject) and missing required fields.
- [ ] `z.infer` type `Agenome` exported from the barrel; no redefinition outside contracts.
- [ ] **Schema-snapshot test (§2.5 gate, tagged `spec(§3)`):** the `Agenome` field-name set (11) and the `status` member set (7) each equal a checked-in frozen snapshot.
- [ ] All unit tests pass; `/preflight` clean.

## Wiring / entry point (Step 7.5)
Entry point = the `@doppl/contracts` barrel export `Agenome` (+ its `z.infer` type, and the `AgenomeStatus` enum). Consumed downstream by the kernel (P3 — state machine, spawnBudget clamp), reproduction (P5), and the event-store (`agenome.spawned/fused/mutated/reproduced` payloads, P0.10/P1). `none — runtime wiring lands in the kernel track (P3)`. Reachability = barrel-exported + covered by the schema-snapshot test.

## Files expected to touch
**New:**
- `packages/contracts/src/domain/agenome.ts` — `Agenome` + `AgenomeStatus` + types.
- `packages/contracts/test/domain/agenome.test.ts`
- extend `packages/contracts/test/__schema-snapshots__/` with the Agenome field/status sets.

**Modified:**
- `packages/contracts/src/index.ts` — re-export `Agenome` + `AgenomeStatus`.

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)
1. **`agenome_accepts_valid_full`** — Asserts: a full 11-field agenome parses + round-trips. Why: §3 happy path.
2. **`agenome_accepts_gen0_without_mutationMeta`** — Asserts: an agenome omitting `mutationMeta` parses. Why: §3 gen-0 seeded agenomes have no mutation provenance.
3. **`agenome_status_closed_7_state`** — Asserts: each of the 7 states parses; `'zombie'`/`''` rejected. Why: §3 closed status union.
4. **`agenome_parentIds_count_not_enforced`** — Asserts: `[]`, `[a]`, `[a,b]`, and `[a,b,c]` all parse (count is a kernel rule, not schema). Why: §3 relationships (0–2 enforced in kernel).
5. **`agenome_spawnBudget_nonnegative_int`** — Asserts: `0`/`5` ok; `-1`/`1.5`/`'3'` rejected. Why: hint integer; clamping is P3.
6. **`agenome_strict_unknown_and_missing`** — Asserts: an unknown top-level field rejected; each missing required field rejected. Why: §3 strict contract.
7. **`agenome_field_type_guards`** — Asserts: `personaWeights` non-`record<string,number>` rejected; `toolPermissions` non-string-array rejected. Why: trait field types.
8. **`schema_snapshot_agenome_field_and_status_sets`** *(spec §3/§2.5)* — Asserts: `Agenome` field-set (11) + `status` member-set (7) equal frozen snapshots. Why: §2.5 cross-track regression gate.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** NEW — `Agenome` (+ the `AgenomeStatus` union).
- **§2.5-seam model touched?** **YES** — `Agenome` is shared (kernel·reproduction·event-store). RED outline MUST include the schema-snapshot test (#8).
- **Orchestrator doc rows to write hot:** add an `Agenome §3` row to the `apps/api/CLAUDE.md` cross-doc table. Appendix A already carries the `Agenome` row — no arch edit unless GREEN surfaces a shape drift.

## Things to flag at Step 2.5
1. **`mutationMeta` internal shape — minimal-structured (provisional) vs loose record.** My default vote: **minimal strict object, all-optional internals** — `z.strictObject({ mode?: string, mutatedFields?: string[], summary?: string }).optional()`. The authoritative mutation record is `ReproductionEvent` (P0.9); `mutationMeta` is denormalized provenance on the agenome. The §2.5 snapshot freezes the **top-level 11 fields**, not `mutationMeta`'s internals — so adding more **optional** internal fields when reproduction (P0.9/P3) lands is non-breaking. Keeping it `strict` matches lesson §1 (no silent unknown-key strip). Flag if you'd rather a loose `record` now.
2. **`decompositionPolicy` type — named-policy string vs structured object.** My default vote: **`z.string().min(1)`** (a named policy id) for the freeze; structure it later if the kernel needs richer policy config (non-breaking to widen a string→object only via a deliberate contract change — so flag if you expect structure soon).
3. **`personaWeights` shape — `record<string,number>` vs fixed dimensions.** My default vote: **`z.record(z.string(), z.number())`** (open persona-dimension → weight map; the kernel decides dimensions). Flag if a fixed dimension set is preferred.
4. **`spawnBudget` domain — non-negative vs positive.** My default vote: **non-negative int** (`z.int().nonnegative()`) — `0` legitimately means "no spawns"; it's a hint the kernel clamps regardless.
5. **String-field minimums.** My default vote: `id`/`runId`/`generationId` = `z.string().min(1)` (opaque non-empty, per P0.1 id convention); `systemPrompt` = `z.string().min(1)`. Flag if empty systemPrompt is ever valid.
6. **Commit count.** My default vote: **1** — one cohesive Agenome contract; non-safety (the spawnBudget hint is just an int here; the cap/clamp safety enforcement is P3). Commit: `feat(contracts): Agenome schema + 7-state status union (P0.4)`.

## Dependencies + sequencing
- **Depends on:** none.
- **Blocks:** P0.10 (`agenome.*` event payloads), P3 (kernel Agenome state machine + spawnBudget clamp), P5 (reproduction reads `eligible_parent`).

## Estimated commit count
**1** — cohesive Agenome contract; not a safety-invariant slice (the kernel's spawnBudget clamp + state-machine enforcement is the P3 safety surface, not this schema).

## Lessons-logged candidates anticipated
- **Convention candidate** — "Schema encodes shape, not kernel rules: count/range/clamp invariants (e.g. parentIds 0–2, spawnBudget clamp) are enforced in the kernel, NOT the contract — the contract stays permissive on what the kernel will police" (so a future event from a buggy producer still validates structurally and the kernel rejects it with an event, rather than the schema masking the bug).
- **Architecture-doc note candidate** — none expected (Appendix A + §3 already specify Agenome).

## How to invoke
1. **Read this brief end-to-end** (session already oriented). Don't skip the Step-2.5 questions (Q1 `mutationMeta` is the one real design call).
2. **Run `/tdd agenome_schema`.**
3. **Step 0/1** — confirm restatement + file list.
4. **Step 2.5** — send the test-design write-up + answers to the 6 questions. Wait for `APPROVED.`/`TWEAK:`/`ADD:`.
5. **Step 9** — categorized flags + ship-ask.
