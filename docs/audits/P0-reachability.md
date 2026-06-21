# P0 Phase-Exit Reachability Audit — `packages/contracts`

**Date:** 2026-06-20
**Branch:** `contract/track`
**Scope:** Every symbol exported from `packages/contracts/src/index.ts`
**Auditor model:** claude-sonnet-4-6

---

## Audit context (contracts area special rule)

For a CONTRACTS package the production entry point is the barrel consumed by downstream tracks
(kernel/verifier/selection/demo, phases P1–P7). "Reachable" is defined as:
barrel-exported **AND** covered by at least one test (unit, schema-snapshot, OR canonical-fixture
validation). Runtime wiring (kernel append-path calling `validateEventPayload`, event-store using
`scrubSecrets`, etc.) lands in P1–P7 by design — that is NOT an unwired gap for P0.

Flags raised here are:
- **(a)** Exported from barrel but NOT covered by any test/snapshot/fixture.
- **(b)** Defined in `src/` but NOT exported from barrel (orphan).
- **(c)** Dead code (exported and nominally tested but test trivially never exercises it).

---

## Symbol inventory

Total unique runtime-valued exports (Zod schemas + constants + functions + fixtures/snapshot data):

| Category | Count |
|---|---|
| Zod schema constants (enums + objects + unions) | 46 |
| Pure helper functions | 8 |
| TypeScript interface declarations | 2 |
| TypeScript type aliases (z.infer — type-only, no runtime body) | ~46 (paired with each schema) |
| Exported type-only aliases (CeilingViolation, CeilingResult, PayloadValidationResult, ActorRole) | 4 |
| Fixture instances (validX constants) | 32 |
| Snapshot/registry constants (CANONICAL_FIXTURES, FIELD_SET_SNAPSHOTS, MAX_*, CURRENT_SCHEMA_VERSION, HIGH_TRAFFIC_PAYLOAD_MAP, GENERIC_PAYLOAD_SCHEMA, REDACTION_PLACEHOLDER, CRITIC_INPUT_SENTINEL) | 8 |
| **Total audited** | **~96 runtime-valued exports** |

---

## Reachability classification

### Zod schemas — ALL REACHABLE

Every schema constant is exercised by at least one test file that imports it directly from
`@doppl/contracts` (the barrel) and round-trips a valid fixture through `.parse()` or `.safeParse()`:

| Symbol | Test coverage |
|---|---|
| `RunEventEnvelope` | `field-sets.test.ts`, `contract-surface.test.ts`, `fixtures-valid.test.ts` (CANONICAL_FIXTURES) |
| `RunEventType` | `field-sets.test.ts`, `event-type.test.ts`, `contract-surface.test.ts` |
| `Actor` | `field-sets.test.ts`, `actor.test.ts`, `contract-surface.test.ts` |
| `RunConfig` | `run-config.test.ts`, `validate.test.ts`, `contract-surface.test.ts` |
| `RunCaps` | `run-caps.test.ts`, `contract-surface.test.ts` |
| `Agenome`, `AgenomeStatus` | `agenome.test.ts`, `agenome-field-sets.test.ts`, `contract-surface.test.ts` |
| `CandidateIdea`, `CandidateStatus` | `candidate-idea.test.ts`, `candidate-field-sets.test.ts`, `contract-surface.test.ts` |
| `CrossDomainTransferPayload`, `ZeitgeistSynthesisPayload` | `subtype-payloads.test.ts`, `contract-surface.test.ts` |
| `CullingEvent` | `culling-event.test.ts`, `energy-reproduction-field-sets.test.ts`, `contract-surface.test.ts` |
| `EnergyEvent`, `EnergyEventType` | `energy-event.test.ts`, `energy-reproduction-field-sets.test.ts` |
| `EvidenceRef`, `EvidenceKind` | `evidence-ref.test.ts`, `contract-surface.test.ts` |
| `Generation`, `GenerationStatus` | `generation.test.ts`, `entities-lineage-field-sets.test.ts` |
| `ReproductionEvent`, `ReproductionMode` | `reproduction-event.test.ts`, `energy-reproduction-field-sets.test.ts` |
| `Run`, `RunStatus` | `run.test.ts`, `entities-lineage-field-sets.test.ts`, `contract-surface.test.ts` |
| `Subtype` | `contract-surface.test.ts` (union sweep), multiple domain tests |
| `ChatRole` | `gateway-request.test.ts`, `contract-surface.test.ts` |
| `ModelGatewayRequest` | `gateway-request.test.ts`, `gateway-field-sets.test.ts`, `contract-surface.test.ts` |
| `ModelGatewayResponse`, `ValidationResult` | `gateway-response.test.ts`, `gateway-field-sets.test.ts`, `contract-surface.test.ts` |
| `ModelRole` | `model-role.test.ts`, `contract-surface.test.ts` |
| `ModelRoute` | `model-route.test.ts`, `gateway-field-sets.test.ts`, `contract-surface.test.ts` |
| `ProviderCapability` | `provider-capability.test.ts`, `gateway-field-sets.test.ts`, `contract-surface.test.ts` |
| `ProviderMeta` | `gateway-field-sets.test.ts`, `contract-surface.test.ts` (via EnergyEvent fixture) |
| `LineageNode`, `LineageNodeType`, `LineageEdge`, `LineageGraphProjection` | `lineage-graph.test.ts`, `entities-lineage-field-sets.test.ts`, `contract-surface.test.ts`; `LineageNode`+`LineageEdge` in `CANONICAL_FIXTURES` sweep |
| `CheckResult`, `CheckStatus` | `check-result.test.ts`, `check-field-sets.test.ts`, `contract-surface.test.ts` |
| `CheckRunnerAdapter`, `CheckRunnerRegistry` | `check-runner-adapter.test.ts`, `check-field-sets.test.ts`, `contract-surface.test.ts` |
| `FitnessScore` | `fitness-score.test.ts`, `scoring-field-sets.test.ts`, `contract-surface.test.ts` |
| `NoveltyScore` | `novelty-score.test.ts`, `scoring-field-sets.test.ts`, `contract-surface.test.ts` |
| `ScoringPolicy` | `scoring-policy.test.ts`, `scoring-field-sets.test.ts`, `contract-surface.test.ts` |
| `CriticReview`, `CriticMandate` | `critic-review.test.ts`, `critic-field-sets.test.ts`, `contract-surface.test.ts` |
| `criticInput` | `critic-input.test.ts`, `critic-field-sets.test.ts`, `contract-surface.test.ts` |
| `FinalJudgeRubric`, `FinalJudgeAxis` | `final-judge-rubric.test.ts`, `final-judge-rubric-field-sets.test.ts`, `contract-surface.test.ts` |

### Pure helper functions — ALL REACHABLE

| Symbol | File | Test |
|---|---|---|
| `resolveCheckAdapter` | `src/checks/check-runner-adapter.ts` | `check-runner-adapter.test.ts` (allowlist gate, adversarial proto-chain) |
| `validateRunConfig` | `src/config/validate.ts` | `validate.test.ts` (6 scenarios: precedence, deep-merge, pollution, fail-fast, pure, typed return) |
| `resolvePayloadSchema` | `src/events/payload-map.ts` | `payload-map.test.ts` (narrows 6 HT types, generic fallback, proto-chain adversarial) |
| `enforcePayloadCeiling` | `src/events/payload-map.ts` | `payload-map.test.ts` (bytes bound, depth bound, BigInt/circular, bounded DFS no stack overflow) |
| `validateEventPayload` | `src/events/payload-map.ts` | `payload-map.test.ts` (ceiling-then-shape composition, ceiling + shape mismatch paths) |
| `scrubSecrets` | `src/security/redaction.ts` | `redaction.test.ts` (14 cases: value patterns, key-name redaction, idempotent, key scrub, de-collision, scale, non-secret pass-through, no-mutate, proto-data key) |
| `wrapUntrusted` | `src/verifier/critic-input.ts` | `critic-input.test.ts` (sentinel wrapping, verbatim preservation, adversarial embedded-sentinel neutralization, multi-sentinel) |
| `objectFieldNames` | `src/__schema-snapshots__/field-sets.ts` | `contract-surface.test.ts` (called for every §2.5 object model in the snapshot sweep) |

### Exported constants — ALL REACHABLE

| Symbol | Test |
|---|---|
| `REDACTION_PLACEHOLDER` | `redaction.test.ts` — `placeholder_is_the_exported_constant` |
| `CRITIC_INPUT_SENTINEL` | `critic-input.test.ts` — `critic_input_sentinel_constant_stable` (value snapshot-pinned) |
| `CURRENT_SCHEMA_VERSION` | `field-sets.test.ts` — `barrel_exports_schemas_and_types` |
| `MAX_PAYLOAD_BYTES`, `MAX_PAYLOAD_DEPTH` | `payload-map.test.ts` — `barrel_exports_payload_map` + ceiling tests |
| `HIGH_TRAFFIC_PAYLOAD_MAP` | `payload-map.test.ts` — `payload_map_covers_exactly_six_high_traffic_types` |
| `GENERIC_PAYLOAD_SCHEMA` | `payload-map.test.ts` — `resolve_falls_back_to_generic_for_non_high_traffic` |
| `FIELD_SET_SNAPSHOTS` | `contract-surface.test.ts` — used in field_sets_match_frozen_snapshot sweep |
| `CANONICAL_FIXTURES` | `fixtures-valid.test.ts` — table-driven `every_canonical_fixture_is_valid` |

### TypeScript interface types — REACHABLE (structurally)

`ResolveCheckRequest` and `RunConfigSources` are TypeScript `interface` declarations with no
runtime body. They are barrel-exported (type-side only) and are exercised through every test that
calls the functions whose parameters are typed against them (`resolveCheckAdapter` and
`validateRunConfig` respectively). No standalone test is required for a type-only export; the
type-checker enforces them at compile time.

### Fixture instances — ALL REACHABLE

All 32 `validX` constants (e.g. `validRunCaps`, `validRunConfig`, …, `validLineageNode`,
`validLineageEdge`, `validLineageGraphProjection`, `validFinalJudgeRubric`) are:
1. Imported directly in `fixtures-valid.test.ts` for the representative type-assignability checks.
2. Registered in `CANONICAL_FIXTURES` and swept by the `every_canonical_fixture_is_valid` test,
   which calls `.safeParse(value)` for every entry — including `LineageNode` and `LineageEdge`
   (entries 28/29 in the array, covered by the sweep even though not in `EXPECTED_FIXTURE_NAMES`).

### Type-only aliases (CeilingViolation, CeilingResult, PayloadValidationResult, ActorRole) — REACHABLE

These are discriminated-union or inferred type aliases. No runtime value to test; the type-checker
enforces them. `PayloadValidationResult` is the return type of `validateEventPayload`, which is
exercised by `payload-map.test.ts`. `CeilingResult` is the return type of `enforcePayloadCeiling`,
similarly covered. `CeilingViolation` is the discriminant literal union used in both. `ActorRole` is
`z.infer<typeof Actor>` and is covered by the Actor union sweep.

---

## Orphan check (symbols in src/ not exported from barrel)

Private unexported helpers in source files:
- `deepMerge` in `src/config/validate.ts` — private (not exported, not in barrel). Correct: it is an
  internal helper for `validateRunConfig`. NOT an orphan issue; intentionally unexported.
- `isPlainObject` in `src/config/validate.ts` — same; private helper.
- `DANGEROUS_KEYS` in `src/config/validate.ts` — private constant. Intentional.
- `exceedsDepth` in `src/events/payload-map.ts` — private helper for `enforcePayloadCeiling`. Correct.
- `isSensitiveKey`, `redactPatterns`, `scrubValue` in `src/security/redaction.ts` — private helpers for `scrubSecrets`. Correct.
- `NEUTRALIZED_SENTINEL_MARKER` in `src/verifier/critic-input.ts` — private constant. Correct.
- `candidateSharedShape` in `src/domain/candidate-idea.ts` — private intermediate const. Correct.
- `VALUE_PATTERNS`, `SENSITIVE_KEY_FRAGMENTS` in `src/security/redaction.ts` — private. Correct.

No orphan symbols found. All private helpers are correctly unexported.

---

## Dead code check

No dead code found. Every barrel-exported runtime-valued symbol (schema, function, constant,
fixture) has at least one test that (a) imports it from `@doppl/contracts` and (b) exercises it
beyond a simple `toBeDefined()` check — either parsing a valid input, asserting rejection, or
calling the function with a meaningful argument.

---

## Unreachable symbols

**None.**

---

## Summary for orchestrator

- **Total exports audited:** ~96 runtime-valued symbols (46 schemas, 8 helpers, 8 constants, 32 fixtures, 4 type-only aliases, 2 interfaces — type aliases omitted as they have no independent runtime existence)
- **REACHABLE:** 96
- **UNREACHABLE:** 0
- **Orphans in src/ (not exported):** 0
- **Dead code:** 0
- **Wiring tasks recommended:** 0
- **Phase-exit gate: CLEAR**

All barrel-exported symbols are covered by at least one test in `packages/contracts/test/`. The
consolidated `contract-surface.test.ts` (P0.14) is the single cross-track regression gate that
sweeps all 27 object-model field-sets, the 17 closed-union value sets, the `CANONICAL_FIXTURES`
table, and barrel completeness in one harness — providing a comprehensive reachability proof for
the entire P0 output.

Runtime wiring (P1–P7: kernel calling `validateEventPayload` on append, event-store calling
`scrubSecrets`, verifier using `wrapUntrusted`, etc.) is deferred by design and is NOT a P0 gap.
