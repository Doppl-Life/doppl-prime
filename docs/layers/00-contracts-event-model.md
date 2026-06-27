# Contracts & Event Model

## Executive summary

This layer is the **single shared dictionary** the whole system speaks. It is a tiny package (`@doppl/contracts`, ~2,500 lines, one dependency: Zod) that defines, in one place, the exact shape of every piece of data that crosses a boundary — the events written to the database, the requests sent to AI providers, the candidate ideas, the scores, the judge verdicts. Every other layer imports these schemas and validates against them, so two parts of the system can never disagree about what a "candidate" or an "energy event" looks like.

Two ideas make it powerful. First, **the schema is the source of truth, and the TypeScript type is derived from it** (via Zod's `z.infer`) — never the other way round — so a runtime validator and a compile-time type can never drift apart. Second, **several safety invariants are enforced by SHAPE, not by code**: because a Zod "strict object" rejects any field it doesn't list, a critic literally has no field to declare itself the winner, and an energy event has no field to record a failure. There is no guard to forget or bypass; the unsafe state is simply *unrepresentable*.

It also owns the **event registry** — a closed list of the 42 event types the system can ever emit — and the **per-type payload map** that says which of those events carry a strongly-typed payload. This package contains **no I/O, no provider SDKs, no database code**; it is pure data definitions and a handful of pure functions (redaction, payload validation, sentinel-wrapping). Everything that *does* something with these shapes lives in the layers around it.

Two newer surfaces live here too, both **additive** (schema version is now **10**): an **agent tool-use wire contract** (a frozen 4-member research-tool allowlist plus the request/response shapes for the model↔tool loop — see [12-tool-use-research.md](12-tool-use-research.md)) and a single derived-projection field (`LineageNode.generationIndex?`) that the dashboard's [Shared Knowledge Space](11-shared-knowledge-space.md) and lineage views consume.

## Responsibilities

- **Owns:** the frozen Zod schemas for every Appendix-A domain model (`Run`, `Generation`, `Agenome`, `CandidateIdea`, scores, energy/reproduction/culling events, gateway request/response, projections), the closed `RunEventType` registry (`packages/contracts/src/events/event-type.ts:28`), the append-only `RunEventEnvelope` (`packages/contracts/src/events/envelope.ts:14`), the per-type payload-narrowing map + DoS ceiling (`packages/contracts/src/events/payload-map.ts`), the gateway tool-use surface (`packages/contracts/src/gateway/tool.ts`), and `CURRENT_SCHEMA_VERSION` (`packages/contracts/src/version.ts:51`).
- **Owns four pure safety primitives** that ride downstream enforcement paths: `scrubSecrets` (redaction), `wrapUntrusted` + `CRITIC_INPUT_SENTINEL` (injection isolation), `validateEventPayload` (append-path gate), `resolveCheckAdapter` (allowlist gate).
- **Owns the cross-track regression gate:** the field-name snapshot harness (`packages/contracts/src/__schema-snapshots__/field-sets.ts`) + canonical fixtures, so any added/removed/renamed field on a shared model breaks a test *before* parallel build tracks fork.
- **Is NOT** the enforcer of *behavioral* rules. The schema pins **shape only**. Cap enforcement, energy non-negativity, ≥1-claim counts, parent-count limits, state-machine transitions, and `vector.length === dimension` are all **kernel rules** — the schema deliberately admits structurally-valid-but-rule-violating values so a buggy producer is caught by the kernel *with an event*, not silently masked by the schema (e.g. `packages/contracts/src/domain/agenome.ts:21`).
- **Is NOT** a place for I/O. The package is env-less — `validateRunConfig` takes already-loaded config objects and never reads files or `process.env` (`packages/contracts/src/config/validate.ts:50`).

## Key components

| Component | What it does | Where |
|-----------|--------------|-------|
| `RunEventEnvelope` | The strict 14-field append-only `run_events` row shape; `sequence` is the sole ordering key | `packages/contracts/src/events/envelope.ts:14` |
| `RunEventType` | The CLOSED 42-member event registry; any unlisted type is rejected | `packages/contracts/src/events/event-type.ts:28` |
| `resolvePayloadSchema` / `HIGH_TRAFFIC_PAYLOAD_MAP` | Narrows 8 high-traffic event types to their frozen model; fails open to generic, closed on mismatch | `packages/contracts/src/events/payload-map.ts:38` |
| `validateEventPayload` / `enforcePayloadCeiling` | The single append-path gate: depth-then-size DoS ceiling + schema validation | `packages/contracts/src/events/payload-map.ts:120` |
| `scrubSecrets` / `REDACTION_PLACEHOLDER` | Pure redaction scrub run at the persistence boundary (safety rule #4) | `packages/contracts/src/security/redaction.ts:121` |
| `wrapUntrusted` / `CRITIC_INPUT_SENTINEL` | Sentinel-wraps untrusted candidate text so it's data, never instructions (safety rule #5) | `packages/contracts/src/verifier/critic-input.ts:57` |
| `FinalJudgeRubric` / `JudgeResult` | The immutable held-out-judge anchor + its persisted acceptance output (safety rule #6) | `packages/contracts/src/verifier/final-judge-rubric.ts:38` |
| `ToolName` / `ToolDescriptor` / `ToolCallRequest` | The frozen 4-member research-tool allowlist + non-executing descriptor + the model's requested call (sv10 tool-use; safety rules #3/#5) | `packages/contracts/src/gateway/tool.ts:17` |
| `ChatMessage` union | One `messages[]` entry — chat \| assistant-tool-call echo \| tool-result; widens the array without widening the closed 3-member `ChatRole` | `packages/contracts/src/gateway/gateway-request.ts:49` |
| `FIELD_SET_SNAPSHOTS` / `objectFieldNames` | Frozen per-model field-name sets; the mechanical cross-track regression gate | `packages/contracts/src/__schema-snapshots__/field-sets.ts:26` |
| `index.ts` (barrel) | The single import boundary — every track imports `@doppl/contracts`, never a deep path | `packages/contracts/src/index.ts` |

## Interfaces & contracts

**The barrel is the only public surface.** `packages/contracts/src/index.ts` re-exports every schema, type, constant, and pure function. Per lesson §5 (single import boundary), no consumer redefines a shape and no consumer imports a deep file path — they import `@doppl/contracts`. The barrel even ships the test harness (`field-sets`) and `test-fixtures` so downstream tracks reuse the same canonical fixtures for consumer/producer agreement tests (`packages/contracts/src/index.ts:46-49`).

The contracts fall into three families:

1. **Closed unions (19 of them)** — `z.enum([...])` value sets where any out-of-set value is rejected. Examples: `RunEventType`, `Actor` (the 7-role union, `packages/contracts/src/events/actor.ts:9`), `ModelRole`, `Subtype`, `CandidateStatus`, `FinalJudgeAxis`, `GenerationOperator`, and `ToolName` (the new 4-member research-tool allowlist added at sv10, `packages/contracts/src/gateway/tool.ts:17`). The contract-surface test sweeps all 19, asserting a valid member parses and a bogus value rejects (`packages/contracts/test/__schema-snapshots__/contract-surface.test.ts:169`).

2. **Strict object models** — `z.strictObject({...})` where **unknown keys are rejected, never stripped**. This is the mechanism behind most safety invariants: a field that doesn't exist on the schema cannot be expressed.

3. **Pure functions** — the few behaviors that belong in the frozen layer because every consumer must apply them identically: `scrubSecrets`, `wrapUntrusted`, `validateEventPayload`/`enforcePayloadCeiling`/`resolvePayloadSchema`, `resolveCheckAdapter`, `validateRunConfig`, `objectFieldNames`.

**What it expects from callers:** producers hand in plain JSON-shaped objects; the schema validates them. The model-gateway path validates structured model outputs against these schemas (accept / repair ≤1 / reject) before anything is persisted. The event-store path runs `scrubSecrets` then `validateEventPayload` before every append.

**The gateway seam** is also defined here: `ModelGatewayRequest` (`packages/contracts/src/gateway/gateway-request.ts:63`) and `ModelGatewayResponse` are the **only** request/response types domain code names — no vendor SDK type leaks into the runtime (safety rule #9). The request enforces "exactly one of `prompt` or `messages`" via a `superRefine`, and carries **no credential field** (unrepresentable by `strictObject`).

**The tool-use surface (sv10, additive)** rides this seam. `ModelGatewayRequest` gained an optional 7th field `tools?: ToolDescriptor[]` (`gateway-request.ts:76`) and `ModelGatewayResponse` gained an optional 7th field `toolCallRequests?: ToolCallRequest[]` (`gateway-response.ts:39`); both `superRefine`s are unchanged. A response with `accepted: true` / `validationResult: 'accepted'`, **no `output`**, but `toolCallRequests` set is a valid *intermediate* turn — the model is asking to run a tool, not answering. The `messages` array also widened: `ChatMessage` (`gateway-request.ts:49`) is now a union of three strict variants — the original `{role: ChatRole, content}` chat message, an assistant-tool-call echo `{role:'assistant', content, toolCalls[≥1]}`, and a tool-result `{role:'tool', toolCallId, toolName, content}` — **without** widening the closed 3-member `ChatRole` (`system`/`user`/`assistant`), so the trusted/untrusted isolation reasoning (rule #5) rests on an unchanged set. The runtime that drives this loop is [12-tool-use-research.md](12-tool-use-research.md).

## Data & state

This layer holds **no runtime state** — it defines the *shapes* of state that live elsewhere (Postgres `run_events`, projections, in-flight kernel memory). The important structures:

**The event envelope** (`packages/contracts/src/events/envelope.ts:14`) — exactly 14 fields, 8 required + 6 optional:

```
id, runId, generationId?, agenomeId?, candidateId?,
type (RunEventType), sequence (int ≥ 0, SOLE ordering key),
occurredAt (ISO-8601 UTC, display-only — never orders),
actor (closed 7-role union), correlationId?,
langfuseTraceId?, langfuseObservationId?,
payload (generic JSON object), schemaVersion (positive int)
```

**The event registry** (`event-type.ts:28`) — 42 closed members in four groups:
- **20 lifecycle** events (`run.configured` … `energy.spent`, including the sv5 terminals `run.cancelled` / `generation.skipped`).
- **9 failure/terminal** events (`provider_call_failed`, `output_schema_rejected`, `energy_exhausted`, … `agenome.failed`, `candidate.rejected`) — so every §3/§5 failure path has a persisted, replayable event (closes RISK-006).
- **11 operation-start / in-flight markers** (`generation.verifying`, `critic.review_started`, `candidate.generation_started`, `tool_call.started`, …) — persisted, replay-faithful, and **debit no energy** (rule #8).
- **1 terminal `judge.reviewed`** + **1 high-traffic `llm_call_telemetry`**.

> **Count reconciled (no drift):** the registry header comment (`event-type.ts:8`), the live `z.enum` array, and the snapshot test (`field-sets.test.ts` asserts `toHaveLength(42)`) now **all agree at 42**. (An earlier revision of this doc flagged a 42-vs-41 mismatch; the live count is **42** — the four groups above sum to 20 + 9 + 11 + 1 + 1.) `event-type.ts` is unchanged across the diff window that produced this refresh.

**Two markers double as replay carriers for derived features.** `candidate.generation_started` (a pre-existing op-start marker that no-ops in current-state) now also carries the [Shared Knowledge Space](11-shared-knowledge-space.md) in-run-retrieval payload — `{agenomeId, retrievedNoteIds[], retrievalDirection, retrievalMethod}` — and `tool_call.started` / `tool_call.finished` carry the [tool-use](12-tool-use-research.md) detail fields. All of these ride the **generic** payload (`GENERIC_PAYLOAD_SCHEMA = z.record(z.string(), z.unknown())`, `payload-map.ts:30`) rather than a narrowed model, so they needed **no `schemaVersion` bump** — the closed registry already admits the event type, and the generic payload admits the new keys.

**The per-type payload map** (`payload-map.ts:38`) narrows **8** high-traffic event types to a frozen model so the *same* Zod schema validates the event-store write and the domain model:

```
energy.spent       → EnergyEvent          novelty.scored  → NoveltyScore
candidate.created  → CandidateIdea        fitness.scored  → FitnessScore
critic.reviewed    → CriticReview         judge.reviewed  → JudgeResult
check.completed    → CheckResult          llm_call_telemetry → LlmCallTelemetry
```

> **DRIFT (count, harmless):** ARCHITECTURE.md §4 and several doc comments still describe the map as "seven high-traffic types" (`payload-map.ts:17`). The live map has **8** keys — `judge.reviewed` (P0.16) and `llm_call_telemetry` (FB.6) were added after that prose was written. The code + `FIELD_SET_SNAPSHOTS` are the authority.

**Replay-required persisted fields** — schemas deliberately make certain fields *required* so the event log carries everything replay needs and no provider is ever re-called (rule #7): `NoveltyScore.vector`/`embeddingModelId`/`dimension` (`novelty-score.ts:16`), `ReproductionEvent.crossoverPoints`/`mutationSummary` (`reproduction-event.ts:28`), `JudgeResult.axisScores`/`acceptance` (`judge-result.ts:40`), `LlmCallTelemetry.samplingParams` (the executed temperature, `llm-call-telemetry.ts:38`).

**Frozen field-set snapshots that moved this refresh** (the `FIELD_SET_SNAPSHOTS` map is the cross-track regression gate — `packages/contracts/src/__schema-snapshots__/field-sets.ts`):
- `ModelGatewayRequest` widened **6 → 7** — `+tools` (`field-sets.ts:175`).
- `ModelGatewayResponse` widened **6 → 7** — `+toolCallRequests` (`field-sets.ts:185`).
- `LineageNode` widened **6 → 7** — `+generationIndex` (`field-sets.ts:198`). `generationIndex?: z.int().nonnegative()` is a **derived projection field** (a zero-based generation ordinal the renderer buckets into per-generation columns); it is additive + optional, so **no `schemaVersion` implication** — old projections without it still parse (`lineage-graph.ts:35`).
- `FinalJudgeRubric` is **byte-identical** — still the 4 fields `axes`/`weights`/`policyVersion`/`immutableToAgents` (`field-sets.ts:200`, unchanged in the diff). This is the **load-bearing rule-#6 proof** that the sv10 tool-use bump did not touch the scoring anchor (see Safety & invariants).

## Dependencies

- **Depends on:** **only Zod 4.4.3** (`packages/contracts/package.json`). Nothing else — no Node I/O on the public path, no provider SDK, no database driver. This is the innermost layer; it depends on *nothing else in the repo*.

- **Used by (everyone):**
  - [01-persistence-event-store.md](01-persistence-event-store.md) — calls `scrubSecrets` + `validateEventPayload` before every append; the `run_events` table mirrors `RunEventEnvelope`.
  - [02-model-gateway-providers.md](02-model-gateway-providers.md) — speaks `ModelGatewayRequest`/`Response`; validates structured outputs against these schemas.
  - [03-runtime-kernel.md](03-runtime-kernel.md) — enforces `RunCaps`, drives the state machines whose status enums are frozen here.
  - [04-verifier-council-checks.md](04-verifier-council-checks.md) — uses `wrapUntrusted`, emits `CriticReview`/`CheckResult`/`JudgeResult`; `resolveCheckAdapter` is the allowlist gate.
  - [05-selection-scoring-reproduction.md](05-selection-scoring-reproduction.md) — emits `NoveltyScore`/`FitnessScore`/`CullingEvent`/`ReproductionEvent`.
  - [06-projections-read-models.md](06-projections-read-models.md) — builds `LineageGraphProjection`; uses `ProjectionWatermark`.
  - [07-backend-api-rest-sse.md](07-backend-api-rest-sse.md) / [08-frontend-dashboard.md](08-frontend-dashboard.md) — validate REST/SSE payloads against the same shared schemas.
  - [09-observability.md](09-observability.md) — re-runs `scrubSecrets` before every Langfuse emit.
  - [11-shared-knowledge-space.md](11-shared-knowledge-space.md) — consumes `LineageNode.generationIndex?` and the generic-payload `candidate.generation_started` fields (the in-run-retrieval replay carrier).
  - [12-tool-use-research.md](12-tool-use-research.md) — consumes the sv10 tool-use surface (`ToolName`/`ToolDescriptor`/`ToolCallRequest`, `ChatMessage` union, `tools?`/`toolCallRequests?`) — the wire contract its runtime registry + orchestrator implement.

## How it works (flow)

The layer is consumed, not "run." The two load-bearing flows that pass through its pure functions:

**Append path — what guards every write to the authoritative log:**

```
producer builds payload  (e.g. an EnergyEvent)
        │
        ▼
 scrubSecrets(payload)            redaction.ts:121  (rule #4 — strip credentials)
        │
        ▼
 validateEventPayload(type,p)     payload-map.ts:152
        │
        ├─ enforcePayloadCeiling  payload-map.ts:120
        │      DEPTH first  → reject max_depth   (so JSON.stringify can't stack-overflow)
        │      THEN size    → reject max_bytes   (true UTF-8 bytes, ≤ 1 MiB)
        │
        ├─ resolvePayloadSchema(type)   payload-map.ts:58
        │      own-property lookup → narrowed model OR generic record
        │
        └─ schema.safeParse(payload)
               fail → {ok:false, reason}  → caller emits a rejection event (never throws)
               ok   → {ok:true, payload:PARSED}  → the PARSED value is persisted, not the input
```

The order is load-bearing and called out in the code (`payload-map.ts:122`): depth is checked *before* size because `JSON.stringify` itself recurses and would throw a `RangeError` on a deeply-nested attacker payload before any size check could run.

**Injection-isolation path — how untrusted candidate text reaches a critic:**

```
attacker-controlled candidate text
        │
        ▼
 wrapUntrusted(text)              critic-input.ts:57
   replaceAll(SENTINEL, "[neutralized-sentinel]")   ← embedded sentinels neutralized
   return  SENTINEL \n text \n SENTINEL              ← the boundary appears EXACTLY twice
        │
        ▼
 carried in a `user` chat message — NEVER interpolated into a system/instruction string
```

## Design decisions & rationale

- **Zod schemas as the single authoring mechanism; types via `z.infer`.** One schema validates both event-store writes and model-gateway structured outputs — no parallel TS + JSON-Schema definitions (ARCHITECTURE.md §4 "Authoring mechanism"). The repo-wide rule: TS types derive from schemas, never the reverse.
- **Strict objects everywhere, so invariants are unrepresentable, not merely rejected at runtime** (lesson §9 / LESSONS.md:133). An emit-only actor (critic, judge, check-runner) gets *no authority field* — there is no enforcement code to forget. The field-name snapshot then makes *adding* such a field later a caught regression.
- **Closed unions reject out-of-set values** (lesson §1). Every status/role/kind is a `z.enum`, swept by `contract-surface.test.ts:163`.
- **Shape-only contracts; behavior is the kernel's.** Counts, ranges, monotonicity, `vector.length === dimension` are kernel rules so a buggy producer is caught *with an event* rather than masked by a permissive-or-strict schema (e.g. `enabledSubtypes` carries `.min(1)` on `RunConfig` for the boot gate but **not** on the `Run` entity — `run-config.ts:23` vs `run.ts:36`).
- **`CURRENT_SCHEMA_VERSION = 10`, additive-only, freeze-before-fork.** Each bump is the deliberate, snapshot-pinned signal that a closed set changed; every bump is additive and forward-compatible, and readers accept all `schemaVersion ≤ current` (the version history is documented in full at `version.ts:7`). The two independently-numbered build lines (judge vs kernel) were linearized onto one monotonic counter (kernel-020 reconcile). The latest bump **9 → 10 (tool-use TU.1)** added the gateway tool-use surface (`ToolName` / `ToolDescriptor` / `ToolCallRequest`, the optional `tools?` / `toolCallRequests?`) and is purely additive: tools attach **only** to the `population_generator` route, so the held-out judge / critic path never sees a tool, and the rule-#6 anchor (`ScoringPolicy` / `FinalJudgeRubric` / `FinalJudgeAxis`, incl. `immutableToAgents`) is **byte-identical** across the bump (`version.ts:38`). Backward-compat is structural, not gated by the contract: `envelope.ts:28` types `schemaVersion: z.int().positive()` with **no upper bound**, so any positive int (incl. v1–v9) parses — the `≤ current` ceiling is enforced by the **replay reader (P1.8)**, not the schema.
- **`ProviderMeta` / `SamplingParams` defined once, imported never redefined** (lesson §5) — the shared shape with the no-secret pin propagates to every consumer.
- **Two deferred-open pieces only:** the numeric *values* in `ScoringPolicy.weights` and `FinalJudgeRubric.weights` are the single deferred-open contract piece (§7/§8); the *structure* is frozen, later policy versions fill the values (`scoring-policy.ts:11`).

## Safety & invariants

This layer is where four of the nine load-bearing invariants are pinned *structurally*. The mechanism, file, and how it's enforced:

- **Safety rule #2 — the event log is append-only and authoritative.** Mechanism: `RunEventEnvelope` is a `z.strictObject` with `sequence` as a per-run monotonic `z.int().nonnegative()` (the **sole** ordering key) and `occurredAt` typed as a display-only ISO string the contract never orders by (`envelope.ts:14`). The closed `RunEventType` registry rejects any unlisted type (`event-type.ts:28`). The per-type payload map (`payload-map.ts`) is the resolver: `resolvePayloadSchema` fails **open** to the generic JSONB payload for non-high-traffic types and the narrowed schema then fails **closed** (rejects) on a mismatch (`payload-map.ts:58`). Lookup is an own-property check (`Object.prototype.hasOwnProperty.call`, lesson §11) so a crafted `__proto__`/`constructor` type can't borrow a value off `Object.prototype` (`payload-map.ts:59`).

- **Safety rule #4 — secrets never leave the server.** Mechanism: `scrubSecrets` (`redaction.ts:121`) is the pure deep-copy scrub the event-store runs before every append AND observability runs before every Langfuse emit. It redacts provider-key value patterns (`sk-…`, `Bearer …`, `Basic …`, length-gated so dictionary words survive — `redaction.ts:25`) and whole-redacts values under sensitive key-names (`authorization`, `api_key`, `token`, …) to `REDACTION_PLACEHOLDER` (`redaction.ts:17`) — **except** a number/boolean value, which is never a credential and must round-trip (so `ProviderMeta.tokensIn`, whose key merely contains "token", survives). It is idempotent and rebuilds objects on a normal prototype to avoid prototype pollution (`redaction.ts:67`). Reinforced structurally: `ProviderMeta`, `ModelGatewayRequest`/`Response`, and `ModelRouteOverrideEntry` are all `strictObject`s with **no credential field representable** (`provider-meta.ts:14`, `gateway-request.ts:63`, `model-route-override.ts:10`). The sv10 tool-use additions hold the line: `ToolDescriptor`/`ToolCallRequest` are also `strictObject`s with no credential field — the provider key stays env-only, in the `Authorization` header, never on the wire contract.

- **Safety rule #5 — model output is untrusted; candidate text is data, not instructions.** Mechanism: `criticInput` (`critic-input.ts:33`) models the trusted `rubric` and untrusted `candidate` as **distinct, non-conflatable** strict fields. `wrapUntrusted(text)` (`critic-input.ts:57`) bounds candidate text with the public `CRITIC_INPUT_SENTINEL` AND neutralizes any embedded sentinel first (`replaceAll`), so the result holds the sentinel **exactly twice** for *any* input — an attacker who knows the public token still cannot forge a boundary (the neutralization marker contains a char the sentinel lacks, so no neighbour-splice can reform one; one pass is provably complete). The untrusted text is carried in a `user` chat message, never an instruction string. The sv10 tool-use surface extends the same posture: `ToolCallRequest.arguments` (`tool.ts:43`) is a **raw provider JSON string kept as a string** — DATA, parsed only inside the orchestrator's SSRF/allowlist guard, never interpolated as code; the tool-result `ChatMessage` variant carries its `content` (often fetched web text — the prime injection vector) wrapped via `wrapUntrusted`; and `ChatRole` stays a closed 3-member set, so the trusted(`system`)/untrusted(`user`) isolation reasoning is unchanged by the new message variants.

- **Safety rule #6 — the held-out judge, its rubric, and scoring policy are immutable to agents.** Mechanism: `FinalJudgeRubric` (`final-judge-rubric.ts:38`) is the strongest pin in the package, stacking four legs so a future widening fails the field-name snapshot mechanically: `axes` is an array of the **closed** `FinalJudgeAxis` (no new judging axis), `immutableToAgents` is `z.literal(true)` (cannot be set false or omitted), `policyVersion` is required (immutability-via-versioning — the rubric is never mutated in place, a new version supersedes), and the strict object admits **no** `mutable`/`scoreOverride`/`weightOverride`/`agentWritable` field. `JudgeResult` (`judge-result.ts:40`) carries the judge's measurement but no rubric/weights/override field; its `axisScores` is a Zod enum-keyed record over `FinalJudgeAxis` — **exhaustive and closed** (all 5 axes required, an unknown axis rejected), so a tampered judge output that drops or invents an axis fails closed at the persist boundary. `CriticReview` (`critic-review.ts:31`) is the same emit-only pattern — no `winner`/`selected`/`scoreOverride` field representable. **Proof the sv10 tool-use bump did not move this anchor:** the `FinalJudgeRubric` field-set snapshot is byte-identical across BASE..HEAD (`field-sets.ts:200`, still `axes`/`weights`/`policyVersion`/`immutableToAgents`), no `ScoringPolicy`/`FinalJudgeRubric`/`FinalJudgeAxis` file appears in the diff, and `tools?` attaches **only** to the `population_generator` route (`gateway-request.ts:76`) — a critic/judge request can never carry it, so the held-out judge path is structurally unreachable from tool-use.

- **Safety rule #8 — energy = successful productive spend only.** Mechanism: `EnergyEventType` is the closed union `['llm','tool','spawn']` with **no failure member** (`energy-event.ts:9`), and `EnergyEvent` is a `strictObject` with no failed/retried/repaired field representable (`energy-event.ts:23`). A failed attempt is a separate `provider_call_failed` event type, never an `energy.spent`. The 11 in-flight markers also debit no energy (they fall back to the generic payload, never narrow to `EnergyEvent`).

- **Safety rule #3 (touched here) — no arbitrary code execution.** `CheckRunnerAdapter` (`check-runner-adapter.ts:15`) is a `strictObject` of pure descriptor fields, so any code-carrying field (`exec`/`command`/`handler`/`fn`/`script`) is unrepresentable; `resolveCheckAdapter` returns a `skipped` CheckResult on an unregistered id via own-property lookup, never executing (`check-runner-adapter.ts:52`). The sv10 tool-use surface mirrors this allowlist-by-shape: `ToolName` (`tool.ts:17`) is a closed 4-member enum (`web_search`/`fetch_url`/`x_search`/`youtube_search`) so an unlisted/arbitrary tool is **unrepresentable**, and `ToolDescriptor` (`tool.ts:29`) is a `strictObject` of pure descriptor fields — a code-carrying field (`exec`/`handler`/`fn`/`script`/`code`/`run`) is rejected as unknown. The descriptor deliberately carries **no parameter JSON-schema**: that lives in the runtime tool registry keyed by name (see [12-tool-use-research.md](12-tool-use-research.md)), so the contract stays closed, minimal, and code-free.

## Gotchas & sharp edges

- **The schema does NOT enforce behavior.** A structurally-valid `Agenome` with a 5-element `parentIds` or an out-of-range `spawnBudget` *parses* — the kernel rejects it with an event (`agenome.ts:21`). Don't read a passing parse as "this value is legal." Same for empty `claims`, empty `targetIds`, `vector.length`, status transitions.
- **Count comments — partly reconciled, one still stale:** the event registry is now **42** and `event-type.ts:8` ("42 members (31 + 11 markers)"), the live enum, and `field-sets.test.ts` (`toHaveLength(42)`) all agree (the earlier 42-vs-41 doc note is resolved). BUT `payload-map.ts:16` still says "seven high-traffic event types" while the map actually has **8** keys (`llm_call_telemetry` — an unquoted identifier key at `payload-map.ts:48` — was added after that prose). The live map + `FIELD_SET_SNAPSHOTS` are authoritative; the "seven" comment is stale-but-harmless.
- **DRIFT (LineageNode field count, confirmed):** the contract is now a **strict 7-field** object (`generationIndex?` added — `lineage-graph.ts:35`) and the field-set snapshot matches (`field-sets.ts:198`), but the `apps/api/CLAUDE.md` cross-doc invariants table still describes `LineageNode` as "**strict 6-field** {id, type, label, status?, metrics?, dataRef}" (the `LineageNodeType` row in the same table is still correct — closed 6-member). The prose mirror is stale; `generationIndex` is additive/optional and sv-neutral, so the contract is fine — only the doc row is behind.
- **`ToolDescriptor` carries no parameter schema, by design** (`tool.ts:29`) — the offered-tool descriptor is name + description only; the tool's argument JSON-schema lives in the runtime model-gateway registry keyed by name. Reading the contract alone tells you *which* tools exist, not their argument shapes.
- **`toolCallRequests` on an `accepted` response is NOT a final answer** (`gateway-response.ts:39`): `accepted: true` / `validationResult: 'accepted'` with **no `output`** but `toolCallRequests` set is a valid *intermediate* turn (the `accepted ⇔ !rejected` refine still holds). A consumer that treats every `accepted` response as a finished generation will mis-handle the tool-call turn.
- **The `ChatMessage` tool variants are committed ahead of their full consumer.** `version.ts:43` frames the assistant-tool-call echo + tool-result message variants as landing "later in the epic with the tool-orchestrator"; the contract surface is present now, and the `'tool'` literal does **not** widen `ChatRole` (still 3-member). A bare `{role:'tool', content}` missing the tool-result fields still rejects.
- **DRIFT (deferred terminals):** `agenome.failed` and `candidate.rejected` are in the registry (sv5) but flagged as not-yet-emitted by the loop / defined-on-a-seam in the kernel comments (`event-type.ts:63`). They are representable, but documenting them as actively emitted would overstate the MVP.
- **`degraded` and `repairing` are status enum members with NO matching event type.** They are state-machine-internal transient states; the event-log-derived current-state reducer adds *no* transition for them (ARCHITECTURE.md §3 line 167, pinned by `current-state.test.ts`). A reader folding events will never see a "degraded" transition.
- **`validateEventPayload` returns the PARSED value, not the caller's input** (`payload-map.ts:164`) — so a future schema transform/coercion can't slip a pre-transform value onto the authoritative append path. Callers must persist the returned `payload`, not what they passed in.
- **`wrapUntrusted` is NOT idempotent** — re-wrapping nests the wrappers as data; callers must wrap exactly once (`critic-input.ts:55`).
- **`scrubSecrets` assumes JSON-plain input** — a `Date`/`Map`/`Set`/class instance is not specially handled and its contents are not preserved (`redaction.ts:115`). The real path is always a Zod-validated `z.record` payload, so this holds; ad-hoc callers must pass the JSON-serializable form.
- **The enum-keyed-record closure on `JudgeResult.axisScores` is Zod-v4-version-dependent** — a major Zod bump must re-run these contract tests, or the "unknown axis rejected" defense could silently weaken (noted in `apps/api/CLAUDE.md:163`).
- **UNVERIFIED:** I did not separately confirm at runtime that `enforcePayloadCeiling`'s "depth-first then size" ordering actually prevents a `JSON.stringify` stack overflow on a pathological input — the claim is asserted in the code comment and pinned by the payload-map tests, which I read but did not execute.

## Connects to

- [01-persistence-event-store.md](01-persistence-event-store.md) — the handoff is `scrubSecrets` → `validateEventPayload` before each `run_events` append; the table mirrors `RunEventEnvelope`.
- [02-model-gateway-providers.md](02-model-gateway-providers.md) — handoff is `ModelGatewayRequest`/`ModelGatewayResponse` + structured-output validation (accept/repair/reject).
- [03-runtime-kernel.md](03-runtime-kernel.md) — handoff is `RunCaps` + the frozen status enums the kernel's state machines drive.
- [04-verifier-council-checks.md](04-verifier-council-checks.md) — handoff is `wrapUntrusted`/`CRITIC_INPUT_SENTINEL`, `resolveCheckAdapter`, and the `CriticReview`/`CheckResult`/`JudgeResult` emit-only shapes.
- [05-selection-scoring-reproduction.md](05-selection-scoring-reproduction.md) — handoff is `NoveltyScore`/`FitnessScore`/`CullingEvent`/`ReproductionEvent` + `ScoringPolicy`/`FinalJudgeRubric`.
- [06-projections-read-models.md](06-projections-read-models.md) — handoff is `LineageGraphProjection` + `ProjectionWatermark`.
- [10-cross-cutting-safety.md](10-cross-cutting-safety.md) — the safety invariants pinned here (rules #2/#3/#4/#5/#6/#8) are the structural half of the cross-cutting safety story.
- [11-shared-knowledge-space.md](11-shared-knowledge-space.md) — the handoff is `LineageNode.generationIndex?` (derived projection field) + the generic-payload `candidate.generation_started` fields that carry the in-run retrieval set replay re-folds.
- [12-tool-use-research.md](12-tool-use-research.md) — the handoff is the sv10 gateway tool-use wire contract (`gateway/tool.ts` + the `ChatMessage` union + `tools?`/`toolCallRequests?`); that layer is the runtime registry, SSRF guard, and orchestrator that *implement* these shapes.
- System spine: see `OVERVIEW.md`.
