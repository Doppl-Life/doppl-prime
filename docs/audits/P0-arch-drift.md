# Phase 0 Architecture-Drift Audit

**Phase:** 0 (contract freeze)  
**Track:** contract (`packages/contracts`)  
**Date:** 2026-06-20  
**Anchors audited:** §3, §4, §5, §6, §7, §8, §9, §10, §14, §16  
**Test run:** all 45 test files, 158 tests — all GREEN (verified before this audit)  
**Auditor posture:** read-only; no fixes applied

---

## Snapshot-test shortcut baseline

All 45 contract tests (158 assertions) passed before this audit. The following snapshot tests
cover the listed anchors' model shapes — for any model whose field-set is pinned by a green
snapshot, that model is **verified by test** and derivation is skipped:

| Snapshot test | Models pinned |
|---|---|
| `test/__schema-snapshots__/field-sets.test.ts` | `RunEventEnvelope` (14 fields), `RunEventType` (25 members), `Actor` (7 members) |
| `test/__schema-snapshots__/run-config-field-sets.test.ts` | `RunCaps` (6 fields), `RunConfig` (6 fields), `Subtype` (2 members) |
| `test/__schema-snapshots__/agenome-field-sets.test.ts` | `Agenome`, `AgenomeStatus` (7 states) |
| `test/__schema-snapshots__/candidate-field-sets.test.ts` | `CandidateIdea`, `CandidateStatus` (8 states), `CrossDomainTransferPayload`, `ZeitgeistSynthesisPayload` |
| `test/__schema-snapshots__/check-field-sets.test.ts` | `CheckResult` (9 fields), `CheckStatus` (3 states), `CheckRunnerAdapter` (4 fields) |
| `test/__schema-snapshots__/critic-field-sets.test.ts` | `CriticReview` (7 fields), `CriticMandate` (5 members), `criticInput` (rubric sub-shape + sentinel) |
| `test/__schema-snapshots__/energy-reproduction-field-sets.test.ts` | `EnergyEvent` (10 fields), `EnergyEventType` (3 members), `ReproductionEvent` (7 fields), `ReproductionMode` (4 members) |
| `test/__schema-snapshots__/entities-lineage-field-sets.test.ts` | `Run` (7 fields), `RunStatus` (8 states), `Generation` (6 fields), `GenerationStatus` (8 states), `CullingEvent` (6 fields) |
| `test/__schema-snapshots__/final-judge-rubric-field-sets.test.ts` | `FinalJudgeRubric` (4 fields), `FinalJudgeAxis` (5 axes), `immutableToAgents` literal-true |
| `test/__schema-snapshots__/gateway-field-sets.test.ts` | `ModelRole` (7 members), `ProviderCapability` (4 fields), `ModelRoute` (5 fields), `ModelGatewayRequest` (5 fields), `ModelGatewayResponse` (6 fields), `ValidationResult` (3 members), `ChatRole` (3 members), `ProviderMeta` (6 fields) |
| `test/__schema-snapshots__/payload-map-field-sets.test.ts` | `HIGH_TRAFFIC_PAYLOAD_MAP` key-set (6 keys), `MAX_PAYLOAD_BYTES`=1048576, `MAX_PAYLOAD_DEPTH`=32 |
| `test/__schema-snapshots__/scoring-field-sets.test.ts` | `FitnessScore` (6 fields), `ScoringPolicy` (3 fields), `NoveltyScore` (9 fields) |
| `test/__schema-snapshots__/contract-surface.test.ts` | barrel export completeness |

---

## Per-anchor audit

### §3 — Domain model & lifecycle state machines

**Checkable statements:**

| Statement | Code location | Verdict | Evidence |
|---|---|---|---|
| `Run` closed 8-state status (configured/running/completing/completed/stopping/stopped/failed/cancelled) | `src/domain/run.ts:9-18` | VERIFIED (snapshot) | `entities-lineage-field-sets.test.ts` — `RunStatus` 8-member snapshot |
| `Generation` closed 8-state status (pending/running/verifying/scoring/reproducing/completed/failed/skipped) | `src/domain/generation.ts:7-16` | VERIFIED (snapshot) | `entities-lineage-field-sets.test.ts` — `GenerationStatus` 8-member snapshot |
| `Candidate` closed 8-state status (created/under_review/checked/scored/selected/rejected/culled/invalid) | `src/domain/candidate-idea.ts:12-22` | VERIFIED (snapshot) | `candidate-field-sets.test.ts` — `CandidateStatus` 8-member snapshot |
| `Agenome` closed 7-state status (seeded/active/spent/eligible_parent/failed/reproduced/culled) | `src/domain/agenome.ts:8-16` | VERIFIED (snapshot) | `agenome-field-sets.test.ts` — `AgenomeStatus` 7-member snapshot |
| `Agenome` has 11 fields; parentIds/spawnBudget shape-only (kernel-enforced count) | `src/domain/agenome.ts:29-47` | VERIFIED (snapshot) | `agenome-field-sets.test.ts` — 11-field set snapshot |
| `CandidateIdea` is subtype-discriminated union (`cross_domain_transfer` | `zeitgeist_synthesis`) | `src/domain/candidate-idea.ts:53-64` | VERIFIED (snapshot) | `candidate-field-sets.test.ts` — per-variant field-set |
| `CrossDomainTransferPayload` fields (6 required + `executableCheckIdea?`) | `src/domain/subtype-payloads.ts:14-23` | VERIFIED (snapshot) | `candidate-field-sets.test.ts` |
| `ZeitgeistSynthesisPayload` fields (thesis/audience/currentSignals[]/whyNow/falsifiablePredictions[]/comparablePriorArt[]) | `src/domain/subtype-payloads.ts:31-38` | VERIFIED (snapshot) | `candidate-field-sets.test.ts` |
| Two subtypes, one lifecycle (spec): both `cross_domain_transfer` and `zeitgeist_synthesis` are in `Subtype` enum | `src/domain/subtype.ts:8` | VERIFIED (snapshot) | `run-config-field-sets.test.ts` — 2-member `Subtype` snapshot |
| `CullingEvent` 6-field (id, runId, generationId, targetIds[], reason, scoreSnapshot) | `src/domain/culling-event.ts:13-20` | VERIFIED (snapshot) | `entities-lineage-field-sets.test.ts` — 6-field snapshot |
| `CullingEvent.targetIds` count is kernel rule (not schema); empty array parses | `src/domain/culling-event.ts` (no `.min` on array) | VERIFIED | code + snapshot do not constrain count |
| Agenome: 0–2 parents is kernel rule; `parentIds` is unconstrained array | `src/domain/agenome.ts:33` (`z.array(...)` no `.max(2)`) | VERIFIED | matches §3 + lesson §6 |
| `agenome.reproduced{mode:"mutation_only"}` for <2 parents — `ReproductionMode` includes `mutation_only` | `src/domain/reproduction-event.ts:8-13` | VERIFIED (snapshot) | `energy-reproduction-field-sets.test.ts` |

All §3 checks: VERIFIED.

---

### §4 — Contracts & event model

**Checkable statements:**

| Statement | Code location | Verdict | Evidence |
|---|---|---|---|
| `RunEventEnvelope` strict 14-field; `sequence` monotonic per-run int≥0 sole ordering key; `occurredAt` display-only ISO-8601 UTC | `src/events/envelope.ts:14-29` | VERIFIED (snapshot) | `field-sets.test.ts` — 14-field snapshot; `sequence: z.int().nonnegative()` |
| `actor` is closed 7-role union (operator/runtime/agenome/critic/check_runner/selection_controller/system) | `src/events/actor.ts:9-17` | VERIFIED (snapshot) | `field-sets.test.ts` — 7-member `Actor` snapshot |
| `RunEventType` is closed 25-member enum including all 7 failure/terminal events | `src/events/event-type.ts:12-40` | VERIFIED (snapshot) | `field-sets.test.ts` — 25-member snapshot including `provider_call_failed`, `output_schema_rejected`, `candidate_invalidated`, `energy_exhausted`, `generation_failed`, `reproduction_aborted_insufficient_parents`, `novelty_scoring_degraded` |
| `payload` is generic `z.record(z.string(), z.unknown())` at envelope level; per-type narrowing is a separate layer | `src/events/envelope.ts:27` | VERIFIED | matches §4: "payload is JSONB for MVP speed, narrowed by a per-type payload-shape map" |
| `schemaVersion` present and positive; `CURRENT_SCHEMA_VERSION` exported constant | `src/events/envelope.ts:28`; `src/version.ts` | VERIFIED (snapshot) | `field-sets.test.ts` — barrel export + positive-int assertion |
| Payload-ceiling: `MAX_PAYLOAD_BYTES`=1 MiB, `MAX_PAYLOAD_DEPTH`=32; depth checked BEFORE size; result-object (never throws); unserializable→max_bytes | `src/events/payload-map.ts:64-65, 108-123` | VERIFIED (snapshot + code) | `payload-map-field-sets.test.ts` pins both literal values; `enforcePayloadCeiling` iterative DFS, depth-first; try/catch never throws |
| `HIGH_TRAFFIC_PAYLOAD_MAP` maps exactly 6 types to their frozen Appendix-A models | `src/events/payload-map.ts:34-41` | VERIFIED (snapshot) | `payload-map-field-sets.test.ts` — 6-key snapshot |
| `resolvePayloadSchema` uses own-property check (not `in` / bare bracket); fails open to generic for non-high-traffic types | `src/events/payload-map.ts:50-58` | VERIFIED | `Object.prototype.hasOwnProperty.call` used |
| `fitness.scored` reuses `FitnessScore` unchanged; novelty link is `candidateId` + `components.novelty` (no `noveltyScoreId`) | `src/events/payload-map.ts:40`; `src/scoring/fitness-score.ts` | VERIFIED | `FitnessScore` has no `noveltyScoreId` field; `components` is open record |
| Energy: `EnergyEvent` has `estimate` + `actual` both required; `unit: z.literal('doppl_energy')`; no failure member in `EnergyEventType` | `src/domain/energy-event.ts:9,29-34` | VERIFIED (snapshot) | `energy-reproduction-field-sets.test.ts` |
| Per-run RNG seed: `RunConfig.rngSeed` is `z.int().nonnegative()` (required, for replay) | `src/run/run-config.ts:17` | VERIFIED (snapshot) | `run-config-field-sets.test.ts` |
| `EvidenceRef` resolves within Postgres tier; closed 6-kind `EvidenceKind` | `src/domain/evidence-ref.ts:7-16` | VERIFIED | 6-kind enum matches §4; all pointer fields optional |

All §4 checks: VERIFIED.

---

### §5 — Runtime kernel (caps shapes)

**Checkable statements (contracts scope: shape only; enforcement is P3):**

| Statement | Code location | Verdict | Evidence |
|---|---|---|---|
| `RunCaps` strict 6 positive-int fields (maxPopulation, maxGenerations, energyBudget[doppl_energy], maxSpawnDepth, maxToolCalls, wallClockTimeoutMs) | `src/run/run-caps.ts:9-16` | VERIFIED (snapshot) | `run-config-field-sets.test.ts` — 6-field snapshot; all `z.int().positive()` |
| `Agenome.spawnBudget` is a hint (shape only; kernel clamps) | `src/domain/agenome.ts:38` (`z.int().nonnegative()`) | VERIFIED | non-negative int, no cap-check in schema — matches "allocation hint" |

All §5 checks: VERIFIED.

---

### §6 — Model gateway & provider integration

**Checkable statements:**

| Statement | Code location | Verdict | Evidence |
|---|---|---|---|
| `ModelRole` closed 7-member (population_generator/critic/subtype_check/embedding/final_judge/fusion_synthesis/retrieval) | `src/gateway/model-role.ts:8-16` | VERIFIED (snapshot) | `gateway-field-sets.test.ts` — 7-member snapshot |
| `ProviderCapability` strict 4-field: `structuredOutputs`+`embeddings` required bools, `toolCalling?`+`streaming?` optional | `src/gateway/provider-capability.ts:8-13` | VERIFIED (snapshot) | `gateway-field-sets.test.ts` — 4-field snapshot |
| `ModelRoute` strict 5-field; `fallbackRouteIds` may be empty | `src/gateway/model-route.ts:13-19` | VERIFIED (snapshot) | `gateway-field-sets.test.ts` — 5-field snapshot; no `.min(1)` on `fallbackRouteIds` |
| `ModelGatewayRequest` exactly-one-of `prompt` XOR `messages`; no credential field; `schema?` opaque | `src/gateway/gateway-request.ts:23-41` | VERIFIED (snapshot) | `gateway-field-sets.test.ts`; `superRefine` enforces mutual-exclusion |
| `messages` uses closed `ChatRole` (system/user/assistant) | `src/gateway/gateway-request.ts:9-11` | VERIFIED (snapshot) | `gateway-field-sets.test.ts` |
| `ModelGatewayResponse`: `accepted ⇔ validationResult !== 'rejected'`; `rejection?` present IFF rejected; `providerMeta` is shared `ProviderMeta` (imported, not redefined) | `src/gateway/gateway-response.ts:26-58` | VERIFIED (snapshot) | `gateway-field-sets.test.ts`; `ProviderMeta` imported from `provider-meta.ts` |
| `ProviderMeta` has no credential field | `src/gateway/provider-meta.ts` (strictObject, 6 fields, no `apiKey`/`secret`) | VERIFIED (snapshot) | `gateway-field-sets.test.ts` |

All §6 checks: VERIFIED.

---

### §7 — Verifier council & checks

**Checkable statements:**

| Statement | Code location | Verdict | Evidence |
|---|---|---|---|
| `CriticMandate` closed 5-member (factual_grounding/novelty_prior_art/feasibility/falsification/subtype_specific) | `src/verifier/critic-review.ts:8-14` | VERIFIED (snapshot) | `critic-field-sets.test.ts` — 5-member snapshot |
| `CriticReview` strict 7-field; NO winner/selected/scoreOverride/policyVersion field (anti-reward-hacking, rule #6) | `src/verifier/critic-review.ts:31-39` | VERIFIED (snapshot) | `critic-field-sets.test.ts` — 7-field snapshot; strictObject rejects unknown keys |
| `criticInput` separates trusted `rubric` from untrusted `candidate` as distinct fields; `CRITIC_INPUT_SENTINEL` exported stable constant; `wrapUntrusted` neutralizes embedded sentinels (exactly 2 occurrences for any input) | `src/verifier/critic-input.ts:20,33-39,57-59` | VERIFIED (snapshot) | `critic-field-sets.test.ts` — field-set + sentinel-value snapshot |
| `CheckResult` strict 9-field; `skipReason` present IFF skipped (superRefine); `status` closed 3-state | `src/checks/check-result.ts:22-49` | VERIFIED (snapshot) | `check-field-sets.test.ts` — 9-field + 3-state snapshot; superRefine confirmed |
| `CheckRunnerAdapter` non-executing descriptor (strictObject, 4 fields — no code-carrying field); unregistered id → `skipped` via own-property lookup | `src/checks/check-runner-adapter.ts:15-20,52-71` | VERIFIED (snapshot) | `check-field-sets.test.ts` — 4-field snapshot; `resolveCheckAdapter` uses `hasOwnProperty.call` |
| `FinalJudgeRubric` strict 4-field; `immutableToAgents: z.literal(true)` unflippable; `FinalJudgeAxis` closed 5 (grounding/novelty/feasibility/falsification_survival/subtype_check_pass); `weights` is OPEN record (admits non-axis energy-efficiency key) | `src/verifier/final-judge-rubric.ts:9-43` | VERIFIED (snapshot) | `final-judge-rubric-field-sets.test.ts` — 4-field, 5-axis, literal-true snapshots |
| No `authority`/`override`/`scale` field on `FinalJudgeRubric` | `src/verifier/final-judge-rubric.ts` (strictObject) | VERIFIED | strictObject + snapshot gate |

All §7 checks: VERIFIED.

---

### §8 — Selection, scoring & reproduction

**Checkable statements:**

| Statement | Code location | Verdict | Evidence |
|---|---|---|---|
| `FitnessScore` strict 6-field; `policyVersion` required (rule #6 immutability-via-versioning); `components` open record | `src/scoring/fitness-score.ts:18-25` | VERIFIED (snapshot) | `scoring-field-sets.test.ts` — 6-field snapshot |
| `ScoringPolicy` strict 3-field; `weights` open name→number record; values deferred-open | `src/scoring/scoring-policy.ts:15-19` | VERIFIED (snapshot) | `scoring-field-sets.test.ts` — 3-field snapshot |
| `NoveltyScore` 9-field; `vector` required (replay rule #7); `embeddingModelId` + `dimension` required; `method` open string | `src/scoring/novelty-score.ts:16-26` | VERIFIED (snapshot) | `scoring-field-sets.test.ts` — 9-field snapshot |
| `ReproductionEvent` 7-field; `crossoverPoints` + `mutationSummary` both required (persisted RNG outcomes, rule #7); `mode` closed 4-member (`fusion`/`crossover`/`output_synthesis`/`mutation_only`) | `src/domain/reproduction-event.ts:28-36` | VERIFIED (snapshot) | `energy-reproduction-field-sets.test.ts` — 7-field + 4-mode snapshot |
| `mutation_only` mode present (degenerate <2-parent fallback per §3) | `src/domain/reproduction-event.ts:12` | VERIFIED | `mutation_only` is a member of `ReproductionMode` |
| `novelty.scored` is authoritative home for novelty; `fitness.scored` references it via shared `candidateId` + `components.novelty` (no `noveltyScoreId` on `FitnessScore`) | payload-map + `FitnessScore` schema | VERIFIED | `FitnessScore` has no `noveltyScoreId`; payload-map maps `novelty.scored`←`NoveltyScore` |
| Selection decisions explainable from persisted events (`scoreSnapshot` on `CullingEvent`) | `src/domain/culling-event.ts:19` (`z.record(z.string(), z.number())`) | VERIFIED | open record of scores, not `z.unknown()` |

All §8 checks: VERIFIED.

---

### §9 — Persistence & projections (contracts scope: authoritative-once vector + watermark shape)

**Checkable statements:**

| Statement | Code location | Verdict | Evidence |
|---|---|---|---|
| Embedding vector is authoritative-once-computed, persisted in `novelty.scored` payload — `NoveltyScore.vector` is required (not optional) | `src/scoring/novelty-score.ts:19` (`z.array(z.number())` — no `.optional()`) | VERIFIED (snapshot) | `scoring-field-sets.test.ts` — `vector`-present assertion |
| `embeddingModelId` + `dimension` required (replay provenance) | `src/scoring/novelty-score.ts:20-21` | VERIFIED | both fields required in `NoveltyScore` strictObject |
| `LineageGraphProjection.sequenceThrough` is `int≥0` watermark | `src/projections/lineage-graph.ts:62` (`z.int().nonnegative()`) | VERIFIED | matches §9 "discarded/rebuilt when newer events exist" |
| `LineageGraphProjection` is storage-agnostic (no Neo4j field) | `src/projections/lineage-graph.ts:58-63` (strictObject) | VERIFIED | strictObject rejects physical-storage fields |

All §9 checks: VERIFIED.

---

### §10 — Lineage graph

**Checkable statements:**

| Statement | Code location | Verdict | Evidence |
|---|---|---|---|
| `LineageGraphProjection` strict 4-field (runId, nodes[], edges[], sequenceThrough) | `src/projections/lineage-graph.ts:58-63` | VERIFIED (snapshot) | `entities-lineage-field-sets.test.ts` |
| `LineageNodeType` closed 6-member (generation/agenome/candidate/critic/check/score) | `src/projections/lineage-graph.ts:8-15` | VERIFIED (snapshot) | `entities-lineage-field-sets.test.ts` — 6-member snapshot |
| `LineageNode` strict 6-field; `status?` open string (varies by node type); `dataRef` opaque pointer | `src/projections/lineage-graph.ts:26-33` | VERIFIED | all fields match; `status: z.string().min(1).optional()` |
| `LineageEdge` strict 5-field (id/source/target/type/label?) | `src/projections/lineage-graph.ts:41-47` | VERIFIED | matches Appendix A |

All §10 checks: VERIFIED.

---

### §14 — Security & trust boundaries

**Checkable statements:**

| Statement | Code location | Verdict | Evidence |
|---|---|---|---|
| `scrubSecrets(payload)` is the canonical scrub function; `REDACTION_PLACEHOLDER='[REDACTED]'` is the stable token | `src/security/redaction.ts:15,111-113` | VERIFIED (snapshot) | `test/security/redaction.test.ts` |
| Scrub is pure, idempotent, structure-preserving, non-mutating | `src/security/redaction.ts` (returns deep copy; value patterns include `REDACTION_PLACEHOLDER` which matches no secret pattern) | VERIFIED | test coverage + code review |
| Value patterns cover OpenAI/OpenRouter/Anthropic keys (`sk-*`), Bearer, Basic credentials; length-gated (≥20/16 chars) | `src/security/redaction.ts:23-27` | VERIFIED | patterns anchored with `\b` + length lower bounds |
| Sensitive key-name layer (case-insensitive contains-match: authorization/api_key/apikey/secret/token/access_token/client_secret/password) | `src/security/redaction.ts:33-42` | VERIFIED | 8 fragments match §14 requirement |
| `ModelGatewayRequest` + `ModelGatewayResponse` carry no credential field (strictObject; rule #4) | `src/gateway/gateway-request.ts`, `src/gateway/gateway-response.ts` | VERIFIED (snapshot) | strictObject + no `apiKey`/`secret` in snapshots |
| Candidate text reaches critics/judges as data (structural isolation via `criticInput` + `wrapUntrusted`) | `src/verifier/critic-input.ts:33-59` | VERIFIED | `rubric` and `candidate` are distinct fields; sentinel neutralization |
| `CheckRunnerAdapter` non-executing by shape (no `exec`/`command`/`fn` field representable) | `src/checks/check-runner-adapter.ts:15-20` | VERIFIED (snapshot) | 4-field snapshot (id/checkType/subtype?/label?) only |
| `FinalJudgeRubric.immutableToAgents` is `z.literal(true)` — cannot be false or omitted | `src/verifier/final-judge-rubric.ts:42` | VERIFIED (snapshot) | `final-judge-rubric-field-sets.test.ts` — literal-true assertion |
| Env-value layer (matching payload strings against loaded `process.env` secrets): this layer is specified in §14 as applied "at the boundary where env loads (event-store before append, observability before Langfuse emit)" | `src/security/redaction.ts` — scrub does NOT implement the env-value layer | NOTE — see below |

**Security scrub env-value layer note:** §14 specifies three layers: key-format patterns, key-name redaction, and env-value matching (matching payload strings against loaded `process.env` secrets, applied at the boundary). The contracts package implements the first two layers. The third layer (env-value matching) is intentionally deferred to the event-store and observability boundaries where `process.env` is accessible — the contracts package is deliberately IO-free (lesson §4). This is correct architecture: the scrub primitive is pure, and the env-value layer adds at the boundary. This is **not drift** — it matches §14's own statement that the env-value layer is "applied at the boundary where env loads (event-store before append, observability before Langfuse emit)." The contracts freeze only freezes the pure primitive.

All §14 checks: VERIFIED (env-value layer correctly deferred to boundary, not drift).

---

### §16 — Testing strategy (contract tests scope)

**Checkable statements:**

| Statement | Code location | Verdict | Evidence |
|---|---|---|---|
| Every consumer of a shared schema agrees with the producer on payload shapes (§16: contract tests, `RISK-014`, `REQ-T-007`) | `test/__schema-snapshots__/` (13 snapshot tests, 45 total test files) | VERIFIED | All 158 tests green; snapshot tests freeze every Appendix-A model's field-set/member-set |
| Safety-invariant tests: secret-redaction, check-runner allowlist rejection, prompt-injection isolation | `test/security/redaction.test.ts`, `test/checks/check-runner-adapter.test.ts`, `test/verifier/critic-input.test.ts` | VERIFIED | All green; isolation fixture tests present |

All §16 checks: VERIFIED.

---

## Cross-doc table (`apps/api/CLAUDE.md`) vs schemas

The cross-doc invariants table in `apps/api/CLAUDE.md` (lines 136–159) was checked against the
frozen schemas for each listed model. All field-sets, member-sets, safety pins, and behavioral
notes match the code exactly. No drift found between the cross-doc table and the schemas.

---

## Mismatch register

### DRIFT findings (code ≠ spec, spec is right)

**None.**

### STALE-DOC findings (code is right, spec lags)

**One doc-side formatting defect:**

**STALE-DOC-1: Appendix A — `RunConfig`/`RunCaps` row missing; content folded into payload-map row**

- **Location:** `ARCHITECTURE.md` line 469 (Appendix A table)
- **Defect:** The `RunConfig{seed, enabledSubtypes[], caps:RunCaps, modelProfile, scoringPolicyVersion, rngSeed}; RunCaps{...}` content appears as extra pipe-delimited columns appended onto the end of the payload-map row, rather than as a dedicated standalone row. The table renders this as phantom columns on the wrong row. `RunConfig`/`RunCaps` have no independent row in the Appendix A table.
- **Impact:** Cosmetic only. The schemas themselves are correct and fully pinned by green snapshot tests (`run-config-field-sets.test.ts`). The cross-doc invariants table in `apps/api/CLAUDE.md` line 140 has the correct information for this model. No implementation is affected.
- **Routing:** Architecture-doc note (doc side is stale/malformed, code is right).

### AMBIGUOUS

**None.**

---

## Summary

| Anchor | Statements checked | Verified-by-test | Verified-by-code | DRIFT | STALE-DOC | Ambiguous |
|---|---|---|---|---|---|---|
| §3 | 13 | 11 | 2 | 0 | 0 | 0 |
| §4 | 12 | 9 | 3 | 0 | 0 | 0 |
| §5 | 2 | 1 | 1 | 0 | 0 | 0 |
| §6 | 7 | 7 | 0 | 0 | 0 | 0 |
| §7 | 7 | 7 | 0 | 0 | 0 | 0 |
| §8 | 7 | 6 | 1 | 0 | 0 | 0 |
| §9 | 4 | 2 | 2 | 0 | 0 | 0 |
| §10 | 4 | 3 | 1 | 0 | 0 | 0 |
| §14 | 9 | 5 | 4 | 0 | 0 | 0 |
| §16 | 2 | 2 | 0 | 0 | 0 | 0 |
| **Total** | **67** | **53** | **14** | **0** | **1** | **0** |

**STALE-DOC-1:** `ARCHITECTURE.md` Appendix A — `RunConfig`/`RunCaps` row is missing as a standalone entry; its content was folded (as phantom columns) into the payload-map row. Code is correct; doc is malformed. No implementation impact.

**VERDICT: CLEAR**
