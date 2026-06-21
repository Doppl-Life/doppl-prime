# contract-002 — P0 freeze close: payload map · entities+lineage · held-out judge · contract-test surface

- **Date:** 2026-06-21
- **Phase:** Phase 0 (shared contracts & event model) — **CLOSED, 14/14**
- **Track:** `contract` (worktree `Capstone-contract`, branch `track/contract`)
- **Predecessor:** [contract-001-2026-06-20-p0-contracts-candidate-through-gateway.md](contract-001-2026-06-20-p0-contracts-candidate-through-gateway.md)
- **Successor:** _(none yet — Phase 0 complete; next is a kernel/verifier/selection/demo track)_

## Why this session existed

Resume from handoff contract-001 (Phase 0 at 11/14) and finish the contract freeze: the remaining 4 task IDs (P0.10, the P0.13+P0.15-entities bundle, P0.15 `FinalJudgeRubric`, P0.14) so the four downstream tracks (kernel · verifier · selection · demo) can fork against frozen, cross-track-agreed schemas. Then `/phase-exit P0`.

## What was built

### Files created
- `packages/contracts/src/events/payload-map.ts` — P0.10: per-type payload narrowing (`HIGH_TRAFFIC_PAYLOAD_MAP`, `resolvePayloadSchema`, `GENERIC_PAYLOAD_SCHEMA`) + bounded payload-DoS ceiling (`enforcePayloadCeiling`, `MAX_PAYLOAD_BYTES`/`MAX_PAYLOAD_DEPTH`) + composed entry (`validateEventPayload`).
- `packages/contracts/src/domain/run.ts` — `Run` + `RunStatus` (closed 8).
- `packages/contracts/src/domain/generation.ts` — `Generation` + `GenerationStatus` (closed 8).
- `packages/contracts/src/domain/culling-event.ts` — `CullingEvent` (persisted shape behind `lineage.culled`).
- `packages/contracts/src/projections/lineage-graph.ts` — `LineageGraphProjection` + `LineageNode` + `LineageNodeType` (closed 6) + `LineageEdge`.
- `packages/contracts/src/verifier/final-judge-rubric.ts` — `FinalJudgeRubric` + `FinalJudgeAxis` (closed 5); the rule-#6 anchor.
- `packages/contracts/src/test-fixtures/index.ts` — P0.14: 30 named typed canonical fixtures + `CANONICAL_FIXTURES` registry (36 entries).
- `packages/contracts/src/__schema-snapshots__/field-sets.ts` — P0.14: `objectFieldNames` extractor + `FIELD_SET_SNAPSHOTS` (29 frozen field-sets).
- Test files: `test/events/payload-map.test.ts`, `test/__schema-snapshots__/payload-map-field-sets.test.ts`, `test/domain/{run,generation,culling-event}.test.ts`, `test/projections/lineage-graph.test.ts`, `test/__schema-snapshots__/entities-lineage-field-sets.test.ts`, `test/verifier/final-judge-rubric.test.ts`, `test/__schema-snapshots__/final-judge-rubric-field-sets.test.ts`, `test/test-fixtures/fixtures-valid.test.ts`, `test/__schema-snapshots__/contract-surface.test.ts`.

### Files modified
- `packages/contracts/src/index.ts` — barrel re-exports for every new model/enum/type + the fixtures + field-set harness.
- `packages/contracts/src/events/payload-map.ts` — P0.10 follow-up (phase-exit): `validateEventPayload` returns `parsed.data` not the caller's input; `enforcePayloadCeiling` measures true UTF-8 bytes (`Buffer.byteLength`); `exceedsDepth` comment.

### Commits (this round, on `track/contract`)
| Hash | Task | What |
|---|---|---|
| `73289fd` | P0.10 | per-type payload map + payload ceiling (SOLO/security) |
| `8bd9502` | P0.13 + P0.15(partial) | Run/Generation/CullingEvent entities + LineageGraphProjection (bundle) |
| `5058400` | P0.15 | FinalJudgeRubric — held-out judge anchor (SOLO/safety, rule #6) |
| `0180c5f` | P0.14 | canonical fixtures + field-set harness + closed-union sweep |
| `c33eb2f` | P0.10 follow-up | validateEventPayload parsed-value + true-byte ceiling (phase-exit code-quality fix) |

Full suite **118 → 160** this session (+42). Phase 0 cumulative **58 → 160**.

## Decisions made
- **P0.10 ceiling order is load-bearing — depth-first, size-second.** `JSON.stringify` recurses and would stack-overflow on a deeply-nested attacker payload before a size check could run; so the bounded iterative depth probe runs first and only a depth-safe payload is stringified. Code-commented to prevent a refactor flipping it.
- **P0.10 `enforcePayloadCeiling` never throws (full-body try/catch);** unserializable input (BigInt) → `max_bytes`, circular ref → `max_depth` (the bounded walk catches the cycle). Phase-exit follow-up switched the size measure to true UTF-8 bytes (`Buffer.byteLength`) so the bound matches its 1 MiB label, and made `validateEventPayload` return the parsed value (closes a pre-transform/TOCTOU window onto the authoritative log).
- **`Run.seed` = `z.string().min(1)`** (scenario/problem seed, matching `RunConfig.seed` by name) — NOT the numeric RNG seed (`RunConfig.rngSeed`). The brief internally contradicted itself; flagged at Step 2.5, orchestrator ruled string and corrected the brief.
- **`CullingEvent.scoreSnapshot` = `z.record(z.string(), z.number())`** (inspectable, §8); **`LineageNode`**: `dataRef`=opaque `string.min(1)`, `metrics?`=`record<string,number>`, `status?`=open string.
- **`FinalJudgeRubric.weights` = OPEN `z.record(z.string(), z.number())`** — *forced* (not just preferred): §7's MVP weights include a non-axis `energy_efficiency_tiebreak` key that axis-keyed `z.record(FinalJudgeAxis,…)` would reject. Stacks four immutability legs: closed-axis + `immutableToAgents: z.literal(true)` + required `policyVersion` + no-authority-field-via-strict.
- **P0.14 consolidated test → `contract-surface.test.ts`** (not the brief-named `field-sets.test.ts`, which already exists as the P0.1 snapshot). Caught the collision at Step 2.5; orchestrator corrected the brief. Folded a fixture↔snapshot lockstep guard (orchestrator strengthening).

## Decisions explicitly NOT made (deferred)
- **`FinalJudgeRubric.axes` non-empty floor** — left shape-only (`z.array(FinalJudgeAxis)`, empty parses); the "rubric carries the full 5-axis surface" completeness is a kernel rule (lesson §6), deferred to the P4/P5 held-out-judge LOAD path (orchestrator recorded the carry-forward).
- **Shared `PolicyVersion` symbol** — not introduced (P0.8 YAGNI ruling held); `FinalJudgeRubric.policyVersion` is typed identically to `ScoringPolicy.version` (structural identity, no shared symbol).
- **Axis-keyed weights** — rejected (see OPEN-weights decision).

## TDD compliance
**Clean.** Every slice ran RED → Step-2.5 review → GREEN; each new symbol had a failing test first. Several wrong-reason RED passes (tests fully wrapped in `toThrow`, which pass on an undefined-symbol call) were caught at Step 3 and hardened to statement-level `safeParse`/defined-guards: P0.10 `#3`/`#6`, P0.13 `lineage_projection_storage_agnostic`, P0.14 `types_are_single_source`. One characterization note: P0.14 `every_closed_union_rejects_out_of_set` passed at RED — it consolidates already-shipped P0.1–P0.15 unions into the gate (existing behavior, not new code); the fixtures + harness tests were true RED→GREEN. No safety-critical slice shipped without test-first coverage; P0.10 + FinalJudgeRubric (both invariant slices) had security-reviewer fan-outs (both CLEAN), and the P0.10 phase-exit follow-up got a third CLEAN review.

## Reachability
All Phase-0 deliverables are contract schemas — reachable via the `@doppl/contracts` barrel + schema-snapshot/unit coverage; runtime wiring lands cross-track by design:
- payload-map → P1 event-store append path (calls `validateEventPayload` + `enforcePayloadCeiling`).
- Run/Generation/CullingEvent → kernel P1/P3 state machines + selection P5.
- LineageGraphProjection → projections P6 + frontend P7 (React Flow).
- FinalJudgeRubric → verifier P4 (held-out judge) + selection P5 (acceptance metric).
- canonical fixtures + field-set harness → every track's P1–P7 contract tests.
No tested-but-unwired gaps in-track (the contract layer has no production entry point of its own; consumers are the downstream tracks).

## Open follow-ups
All routed hot at Step 9 (orchestrator confirmed); captured here for traceability. Orchestrator owns the doc writes (its territory).
- **Cross-doc (orchestrator territory):** Appendix-A rows + `apps/api/CLAUDE.md` cross-doc rows for payload-map, Run/Generation/CullingEvent, LineageGraphProjection/Node/Edge, FinalJudgeRubric; Appendix-A sub-shape fills (`scoreSnapshot`, `dataRef`/`metrics`/`status?`); `Run.seed`=scenario-string brief correction; P0.14 consolidated-test rename. Lessons: "strongest-immutability-pin stacks all four legs", "ship canonical fixtures + field-set harness from the package".
- **Future TODO — P1 (cross-track):** the event-store append path must call `validateEventPayload`/`enforcePayloadCeiling` before append (emit a violation event, not throw); confirm an upstream request-body byte gate (Fastify `bodyLimit`) precedes it (bounds the wide-but-shallow O(node-count) depth-probe cost — finite today, defense-in-depth).
- **Future TODO — P4/P5 (cross-track):** held-out-judge LOAD path asserts the full 5-axis set + `immutableToAgents:true` + the no-agent-write-path before use.
- **Tooling Finding (resolved this round):** `scripts/guards/territory-guard.sh` had a blanket `"docs/"` territory entry that prefix-blocked `docs/sessions/` (the implementer's own artifact) — contradicting the canonical `apps/api/CLAUDE.md` must-NOT-touch list. Surfaced at close-out; orchestrator narrowed it to the specific orchestrator subpaths and is escalating to the lead for an upstream scaffold-upgrade.
- **Non-gap (note only):** `EXPECTED_FIXTURE_NAMES` omits LineageNode/LineageEdge — the contract-surface fixture↔snapshot lockstep already dual-covers them; no live gap.

## How to use what was built
Downstream tracks import the single boundary `@doppl/contracts`: schemas + `z.infer` types, the `CANONICAL_FIXTURES` registry (validate producer/consumer I/O against the frozen shapes), and `objectFieldNames` + `FIELD_SET_SNAPSHOTS` for their own contract tests. The P1 append path calls `validateEventPayload(type, payload)` and emits a violation event on `{ok:false}`.
