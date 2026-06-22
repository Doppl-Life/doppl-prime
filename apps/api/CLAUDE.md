# Doppl `apps/api/` — Build Guide

> **You're in `apps/api/`.** This file plus root `CLAUDE.md` both load. The root file covers global project conventions + shared comm rules (track-prefix, escalation taxonomy, messaging budget); this file owns code-area conventions for the backend (Doppl kernel + subsystems).

## Launch protocol

| Working on... | cwd | Loads |
|---|---|---|
| Planning / docs / commits | repo root (`Capstone/`) | root `CLAUDE.md` only |
| the backend (Doppl kernel + subsystems) code | `apps/api/` | this `CLAUDE.md` + root |
| the React dashboard code | `apps/web/` | `apps/web/CLAUDE.md` + root |

If you find yourself fighting the wrong conventions, check your cwd.

## Session start/end protocol

**At session start:**
1. Read `IMPLEMENTATION_PLAN.md` (repo root) **by section, not whole** — `grep -n "^##" IMPLEMENTATION_PLAN.md` for offsets, then Read with offset/limit just "Currently in progress" + the active phase. (The file grows; never load it whole.)
2. Confirm with the user what feature this session is targeting.
3. Read the relevant section of `ARCHITECTURE.md` from the lookup table below.

**At session end** (only when the user explicitly says we're done):

1. **Implementer runs `/session-end`.** Implementer writes ONLY:
   - `apps/api/` code files (the slice's implementation)
   - test files (the slice's tests)
   - dependency manifest / lockfile (deps the slice adds)
   - `docs/sessions/<NNN>-<date>-<topic>.md` (session doc, created at `/session-end` Step 5)

   **Implementer must NOT touch (all orchestrator territory).** *This list is the canonical statement
   of the territory rule — `/session-end`, the brief template, and the generated
   `scripts/guards/territory-guard.sh` PreToolUse hook (which mechanically enforces it in team mode)
   all point here.*
   - `IMPLEMENTATION_PLAN.md`
   - `apps/api/LESSONS.md`
   - `apps/api/CLAUDE.md` (entire file — both the Cross-doc invariants table AND the Lessons logged index)
   - `ARCHITECTURE.md`
   - `docs/orchestrator-briefing.md` / `docs/tdd-brief-template.md` / `docs/briefs/` / `docs/runbooks/` / `docs/audits/` _(NOT `docs/sessions/` — implementer's; NOT `docs/team-handoffs/` — lead's)_
   - other top-level deliverable / design docs
   - `.gitignore` and root-level dotfiles (unless adding a new artifact to ignore, flagged at Step 9)

   At Step 10: **explicit `git add <path>` per slice file; never `git add -A`/`.`; never stage an orchestrator-territory file.** Changes to any orchestrator-territory file (a new cross-doc model, a lesson, an arch note) are **flagged at Step 9**, not edited here — the orchestrator writes them hot (root `CLAUDE.md` + the Step-9 matrix).

2. **Orchestrator runs `/orchestrate-end`** for round close-out + Carry-forward triage + round terminal commit + push.

## Lookup table — where to find canonical info

Don't paste these sections into the prompt. Grep the file:section, read only what you need. `/check-arch <topic>` dispatches off this table.

| Topic | File (relative to repo root) | Section |
|---|---|---|
| Contracts & event model (RunEventEnvelope, RunEventType, energy unit, replay/RNG) | `ARCHITECTURE.md` | §4 |
| Runtime kernel (state machines, caps, energy ledger, worker, crash-forward) | `ARCHITECTURE.md` | §5 |
| Model gateway & provider integration (registry, OpenRouter, embeddings, retrieval) | `ARCHITECTURE.md` | §6 |
| Verifier council & checks (held-out judge, rotation, allowlist, injection isolation) | `ARCHITECTURE.md` | §7 |
| Selection, scoring & reproduction (fitness, novelty, fusion, mutation) | `ARCHITECTURE.md` | §8 |
| Persistence & projections (Postgres, migrations, replay reader, embeddings) | `ARCHITECTURE.md` | §9 |
| Lessons logged (full prose) | `apps/api/LESSONS.md` | by lesson # |

<!-- Starts near-empty. Add a row whenever a topic is looked up twice. (Seeded with the backend's load-bearing § anchors — this area touches most subsystems.) -->

**Code intelligence & docs (when available):** prefer a code-intelligence MCP / docs MCP over grep+read loops — see root `CLAUDE.md` "Code intelligence & docs."

## Stack

<!-- ▼ EXAMPLE BLOCK [id=area-stack]: stack quick-reference for implementer sessions. Canonical stack lives in root CLAUDE.md + ARCHITECTURE.md; this is the cheat sheet. ▼ -->

- **Runtime:** Node 22 LTS (pnpm workspace)
- **Framework:** Fastify (REST commands/queries + SSE run-event stream)
- **Validation:** Zod (shared schemas from `packages/contracts`; `z.infer` for types)
- **Persistence:** Drizzle + Postgres (append-only `run_events`; pgvector optional)
- **Lint / types / tests:** ESLint / `tsc --noEmit` (strict) / Vitest (unit + integration against a real Postgres)

<!-- ▲ END EXAMPLE BLOCK [id=area-stack] ▲ -->

## Standard commands

```bash
# Install deps (run once; re-run when the manifest changes)
pnpm install

# Run the dev server (if applicable)
pnpm dev

# Tests
pnpm test

# Quality
pnpm lint
pnpm format:check
pnpm typecheck

# Preflight (use before saying "done" with a feature)
pnpm lint && pnpm typecheck && pnpm test
```

## TDD protocol

**Write the failing test first.** Applies to deterministic code — see the TDD posture in root `CLAUDE.md` for what is test-first vs. exempt (the LLM-driven generation/critics/judge are eval-tested via `/eval`, not `/tdd`).

**Commit per slice when practical.** Never bundle a safety-critical slice with anything else.

## Forbidden patterns

<!-- ▼ EXAMPLE BLOCK [id=forbidden-patterns]: forbidden patterns — 3-5 narrow, enforceable, domain-specific rules. Shape: "Don't <pattern X> because <reason / past incident>; use <alternative Y>." Test-pin them where possible. Starts small; accretes as lessons surface. ▼ -->

Do not:

1. **Write code without a failing test first** (for deterministic code). Even one-line functions.
2. **Import a provider SDK (openai, @anthropic, openrouter, …) into a domain/runtime module** — vendor-couples the kernel, breaks replay, and is untestable; route through the `ModelGateway` port (safety rule 9).
3. **Enforce a cap or permission in prompt text** — a prompt can be ignored or injected; caps are kernel invariants enforced in the runtime (safety rule 1).
4. **Write to `run_events` outside the append-only writer** — bypasses the per-run `sequence`, the redaction scrub, and schema validation (safety rules 2, 4).
5. **Re-call a model / embedding / web provider on the replay path** — persist the outcome at run time; replay reads it (safety rule 7).
6. **Treat a projection as authoritative** — projections are derived; write the event, then rebuild the projection (safety rule 2).

**Enforcement patterns (machine-readable — `/preflight` warn-greps the staged diff against these).**
One `grep -E` (or `ast-grep`) expression per line, each tied to a numbered rule above. Rules that can't
be expressed as a pattern carry a `pin:` (test ref) or `accepted:` note on the rule itself instead.

```forbidden-patterns
# rule 2 (no provider SDK in domain/runtime): from ['"](openai|@anthropic-ai|openrouter)
# rule 4 (no raw event-table writes): (insert|update|delete).*run_events
# rule 1: pin: every slice opens with a failing test (Step 3); enforced by /tdd, not grep
# rule 3: pin: cap-enforcement tests in apps/api/test (kernel rejects over-cap spawn)
# lesson 14 (pinned-binary checks, not npx): npx\s+(prettier|eslint|tsc)
```

<!-- ▲ END EXAMPLE BLOCK [id=forbidden-patterns] ▲ -->

## Cross-doc invariants — schema/docs mirroring

Several typed models in this codebase are **contracts** mirrored in `ARCHITECTURE.md` and indexed in the table below. The architecture doc is the canonical contract; the model is the executable enforcement. Drift produces silent disagreement.

**Downstream tracks (P1–P7) validate against the P0.14 contract-test surface** — import `CANONICAL_FIXTURES` (one valid fixture per Appendix-A model) + `objectFieldNames` / `FIELD_SET_SNAPSHOTS` from `@doppl/contracts` for consumer/producer agreement tests; never redefine a shape (single import boundary, lesson §5).

**Authoring discipline (orchestrator owns this table).** The implementer never edits this table or `ARCHITECTURE.md` directly — it flags a field add/remove/rename at Step 9 as a `Cross-doc invariant change`; the orchestrator writes the row + the arch edit hot the same round (see root `CLAUDE.md` + `docs/orchestrator-briefing.md`). Commits stagger; the working tree stays aligned within the round.

| Model | `ARCHITECTURE.md` section | Notes |
|---|---|---|
| `RunEventEnvelope` | §4 | Strict 14-field envelope; `actor` = closed 7-role union (operator/runtime/agenome/critic/check_runner/selection_controller/system); `sequence` sole ordering key; `occurredAt` display-only; generic object `payload` (P0.10 narrows per-type); `schemaVersion` + exported `CURRENT_SCHEMA_VERSION=2` (bumped by P0.1-amend; readers accept all `schemaVersion ≤ current`, so v1 envelopes still validate). Frozen in `packages/contracts` (P0.1); enforced by field-name schema-snapshot (`spec(§4)`). |
| `RunEventType` | §4 | Closed **36-member** registry: the 18 lifecycle + 7 failure/terminal types (RISK-006) + **11 operation-start / in-flight observability markers** (P0.1-amend — generation.verifying/scoring/reproducing, candidate.generation_started, critic.review_started, check.started, novelty.scoring_started, judge.review_started, fusion.started, tool_call.started/finished; persisted + replay-faithful + **no energy debit** rule #8 — they fall back to the generic payload, never narrow to EnergyEvent); rejects unlisted values. Frozen in `packages/contracts` (P0.1 + P0.1-amend, schemaVersion 2); member-set snapshot (`spec(§4)`). |
| `RunConfig` / `RunCaps` | §4, §5 | `RunCaps` = strict 6 positive-int caps (maxPopulation/maxGenerations/energyBudget[doppl_energy]/maxSpawnDepth/maxToolCalls/wallClockTimeoutMs); `RunConfig` = seed, enabledSubtypes[≥1], caps, modelProfile, scoringPolicyVersion, rngSeed (required, §4 replay). Closed `Subtype` union (`cross_domain_transfer`\|`zeitgeist_synthesis`) defined canonically in P0.3 (`src/domain/subtype.ts`) for P0.5 to import. Pure `validateRunConfig` (defaults<file<env deep-merge, fail-fast). Frozen `packages/contracts` (P0.3); field/member schema-snapshot (`spec(§4)`). |
| `Agenome` | §3 | Strict 11-field agent-genome (id, runId, generationId, parentIds[], systemPrompt, personaWeights, toolPermissions[], decompositionPolicy, spawnBudget, mutationMeta?, status) + closed 7-state `AgenomeStatus` (seeded/active/spent/eligible_parent/failed/reproduced/culled). Schema encodes SHAPE only — parentIds 0–2 + spawnBudget clamp are kernel-enforced (P3), not the contract. Frozen `packages/contracts` (P0.4); field/status schema-snapshot (`spec(§3)`). |
| `CandidateIdea` | §3 | Subtype-discriminated 11-field unit-of-work (id, runId, generationId, agenomeId, subtype, title, summary, claims[], evidenceRefs[], status, subtypePayload) via `z.discriminatedUnion('subtype',[cdt,zeit])` — correlation structural (lesson §7); closed 8-state `CandidateStatus` (created/under_review/checked/scored/selected/rejected/culled/invalid); `subtype` imported from P0.3 `Subtype` (not redefined, §5); `claims[]` permissive on count (≥1 is a kernel rule, §6 — empty array parses, empty-string element rejected). Frozen `packages/contracts` (P0.5); per-variant field-set + status schema-snapshot (`spec(§3)`). |
| `CrossDomainTransferPayload` / `ZeitgeistSynthesisPayload` | §3 / DATA_MODEL.md | Strict subtype payloads: CDT = sourceDomain/sourceTechnique/targetDomain/targetProblem/transferMapping/expectedMechanism (+ `executableCheckIdea?`); Zeit = thesis/audience/currentSignals[]/whyNow/falsifiablePredictions[]/comparablePriorArt[]. String fields + array elements `.min(1)`; empty arrays OK. Frozen `packages/contracts` (P0.5); field-set schema-snapshot (`spec(§3)`). |
| `EvidenceRef` | §4 | Strict ref: closed 6-kind `EvidenceKind` (trace/check_output/prior_art/signal/raw_output/other) + all-optional `.min(1)` pointers (eventId?/uri?/label?/langfuseObservationId?). Resolves WITHIN the Postgres tier — *resolution* is the P1.7 resolver's job, not the schema (§9, lesson §6). Consumed by P0.6 `CriticReview.evidenceRefs[]` + P0.7 `CheckResult.evidenceRefs[]`. Frozen `packages/contracts` (P0.5); field-set + kind schema-snapshot (`spec(§4)`). |
| `CriticReview` / `CriticMandate` | §7 | Strict 7-field review (id, candidateId, mandate, scores{name→number}, critique, confidence∈[0,1], evidenceRefs[] of `EvidenceRef`) + closed 5-member `CriticMandate` (factual_grounding/novelty_prior_art/feasibility/falsification/subtype_specific). **Emit-only (safety rule #6):** NO winner/selected/scoreOverride/policyVersion field is representable — pinned by strict + 7-field snapshot (lesson §9, anti-reward-hacking). Frozen `packages/contracts` (P0.6); field/member schema-snapshot (`spec(§7)`). |
| `criticInput` (+ `CRITIC_INPUT_SENTINEL`, `wrapUntrusted`) | §14 | Injection-isolation shape (safety rule #5): strict 2-field — trusted `rubric` ({mandate, instructions}) vs untrusted `candidate` (string) as DISTINCT fields so candidate text is data, never instructions (T-002/RISK-008). `wrapUntrusted(text)` bounds the candidate with the exported `CRITIC_INPUT_SENTINEL` AND neutralizes embedded sentinels (output has it exactly twice for any input; single-pass-complete, lesson §8). Per-call nonce delimiter = P4 future hardening (non-pure). Frozen `packages/contracts` (P0.6); field-set + rubric sub-shape + sentinel-value snapshot (`spec(§14)`). |
| `CheckResult` / `CheckRunnerAdapter` | §7 | `CheckResult` = strict 9-field (id, candidateId, checkType[open string], status, score?, output?, skipReason?, evidenceRefs[] of `EvidenceRef`, error?); closed 3-state `CheckStatus` (passed/failed/skipped); `skipReason` present IFF skipped. `CheckRunnerAdapter` = allowlist-registry descriptor `{id, checkType, subtype?, label?}`, **non-executing by shape** (no code-carrying field representable — rule #3, lesson §11). `resolveCheckAdapter(registry, req)` fails safe to a `skipped` CheckResult on an unregistered id (own-property lookup; never executes). Frozen `packages/contracts` (P0.7); field/status schema-snapshot (`spec(§7)`). |
| `NoveltyScore` | §8 | Strict 9-field (id, candidateId, vector, embeddingModelId, dimension, comparisonSet, method, score, explanation). **Rule #7 (replay):** `vector`(array&lt;number&gt;) + `embeddingModelId` + `dimension`(int&gt;0) all REQUIRED → replay reads the persisted vector, never re-embeds (lesson §13). `method` = OPEN string (no closed enum); `comparisonSet` = array&lt;string&gt;; `score` permissive number; `length===dimension` is a kernel check (§6). Frozen `packages/contracts` (P0.8); field-set + `vector`-present snapshot (`spec(§8)`). |
| `FitnessScore` / `ScoringPolicy` | §8 | `FitnessScore` = strict 6-field (id, candidateId, total, components, policyVersion, explanation); **rule #6:** `policyVersion` REQUIRED + identically typed to `ScoringPolicy.version` → each score bound to its exact policy (immutability-via-versioning, lesson §12). `components` = OPEN name→number record (decomposed signals, §8 explainability). `ScoringPolicy` = strict {version, weights, normalization?}; `weights` = OPEN name→number record — STRUCTURE frozen, weight VALUES deferred-open (the only deferred-open contract values). Frozen `packages/contracts` (P0.8); field-set + `policyVersion`-present snapshot (`spec(§8)`). |
| `EnergyEvent` | §4, §5 | Strict 10-field (id, runId, generationId?, agenomeId?, eventType, estimate, actual, unit, reason, providerMeta?). **Rule #8 (success-only):** `eventType` closed `llm`/`tool`/`spawn` (no failure member); `estimate`+`actual` both REQUIRED; `unit`=`z.literal('doppl_energy')`; NO failed/retried/repaired/success field representable (strict + field-set snapshot incl. not-contains, lesson §9). estimate/actual int (sign=kernel); `providerMeta?` = shared `ProviderMeta`. Frozen `packages/contracts` (P0.9); field/eventType snapshot (`spec(§4)`). |
| `ReproductionEvent` | §8 | Strict 7-field (id, runId, parentAgenomeIds[], childAgenomeId, mode, crossoverPoints, mutationSummary). **Rule #7 (replay):** `crossoverPoints`(`int[]`) + `mutationSummary`(`record<string, string\|number\|boolean>`) both REQUIRED persisted RNG outcomes → replay reconstructs, never re-samples (lesson §13). `mode` closed `fusion`/`crossover`/`output_synthesis`/`mutation_only`; parentAgenomeIds count 0–2 = kernel (§6). Frozen `packages/contracts` (P0.9); field/mode snapshot (`spec(§8)`). |
| `ProviderMeta` | §6 | Shared provider-call metadata `{provider, modelId, gatewayRequestId, tokensIn:int≥0, tokensOut:int≥0, costEstimate?:number}`; NO credential field (env-only, §14). Canonical in `src/gateway/provider-meta.ts` (P0.9, first consumer = `EnergyEvent.providerMeta?`); **P0.12's `ModelGatewayResponse.providerMeta` imports it, never redefines** (lesson §5). Frozen `packages/contracts` (P0.9); field-set snapshot (`spec(§6)`). |
| `ModelRole` / `ProviderCapability` / `ModelRoute` | §6 | `ModelRole` closed 7-union (population_generator/critic/subtype_check/embedding/final_judge/fusion_synthesis/retrieval). `ProviderCapability` strict {structuredOutputs, embeddings (both required bools), toolCalling?, streaming?}. `ModelRoute` strict {role, provider, modelId, capability, fallbackRouteIds[] (may be empty)} — does NOT force a single provider (embedding=OpenAI + critic=OpenRouter both valid). Frozen `packages/contracts` (P0.11); field/role snapshot (`spec(§6)`). |
| `ModelGatewayRequest` / `ModelGatewayResponse` | §6 | The ONLY provider seam domain code sees (no vendor SDK leak, §2.5). `Request` {role(ModelRole), prompt XOR messages, schema?, maxTokens?} — messages carry closed `ChatRole` (system/user/assistant); exactly-one-of prompt/messages. `Response` {accepted, output?, validationResult, providerMeta(shared P0.9 `ProviderMeta`), langfuseTraceId?, rejection?} — `validationResult` closed `accepted\|repaired\|rejected`, `accepted ⇔ result≠rejected`, `rejection` present IFF rejected. NO credential field (rule #4/§14). `output?`/`schema?` opaque `z.unknown()` — the PERSISTENCE boundary scrubs (P0.2), not the contract. Frozen `packages/contracts` (P0.12); field/validationResult/ChatRole snapshot (`spec(§6)`). |
| per-type payload map (`events/payload-map.ts`) | §4 | Narrowing layer OVER the generic frozen `RunEventEnvelope.payload` — does NOT mutate the envelope. `HIGH_TRAFFIC_PAYLOAD_MAP: Partial<Record<RunEventType, ZodType>>` maps the 6 §4 high-traffic types to their frozen model (energy.spent←EnergyEvent, candidate.created←CandidateIdea, critic.reviewed←CriticReview, check.completed←CheckResult, novelty.scored←NoveltyScore, fitness.scored←FitnessScore — same schema validates write + model). `resolvePayloadSchema(type)` = own-property lookup (lesson §11), fails OPEN to `GENERIC_PAYLOAD_SCHEMA` (= envelope's `z.record(z.string(),z.unknown())`) for non-high-traffic types, fails CLOSED (reject) on a high-traffic mismatch. `enforcePayloadCeiling(payload)` = bounded payload-DoS primitive: **depth-first (iterative DFS, early-exit) THEN size** (`MAX_PAYLOAD_BYTES`=1 MiB, `MAX_PAYLOAD_DEPTH`=32, literal-value-pinned), result-object, never throws (unserializable→`max_bytes`). `validateEventPayload(type,payload)` composes both for the P1 append path. `fitness.scored`↔novelty link = `candidateId` + `components.novelty` (Q1=A; frozen `FitnessScore` unchanged, `noveltyScoreId` strict-rejected). Frozen `packages/contracts` (P0.10); key-set + per-key mapping + literal-constant schema-snapshot (`spec(§4)`). |
| `Run` / `Generation` (+ `RunStatus`, `GenerationStatus`) | §3 | `Run` = strict 7-field {id, seed, enabledSubtypes[], caps:RunCaps, status, startedAt, completedAt?}. `seed` = run/problem-scenario string (= `RunConfig.seed` by name, lesson §5; **DISTINCT from the RNG seed** `RunConfig.rngSeed`:int). `enabledSubtypes` = `z.array(Subtype)` with **NO `.min(1)`** (count ≥1 is a kernel rule §6 — `RunConfig.enabledSubtypes` carries the boot-gate `.min(1)`, the entity does not). `caps` imports frozen `RunCaps` (P0.3). `RunStatus` = closed 8 (configured/running/completing/completed/stopping/stopped/failed/cancelled). `Generation` = strict 6-field {id, runId, index(int≥0), status, startedAt, completedAt?}; `GenerationStatus` = closed 8 (pending/running/verifying/scoring/reproducing/completed/failed/skipped). Frozen `packages/contracts` (P0.15 partial); field/status schema-snapshot (`spec(§3)`). |
| `CullingEvent` | §3, §8 | Strict 6-field {id, runId, generationId, targetIds[], reason, scoreSnapshot}; `targetIds` = array of ids (empty array parses — count is a kernel rule §6); `reason` = non-empty string; `scoreSnapshot` = `record<string,number>` (inspectable cull justification, §8 explainability; empty `{}` parses). The persisted shape behind the `lineage.culled` event type. Frozen `packages/contracts` (P0.15 partial); field-set schema-snapshot (`spec(§8)`). |
| `LineageGraphProjection` (+ `LineageNode`, `LineageNodeType`, `LineageEdge`) | §10 | Strict 4-field {runId, nodes[], edges[], sequenceThrough}; **storage-agnostic** (no physical-storage/Neo4j field — strict). `LineageNode` = strict 6-field {id, type, label, status?, metrics?, dataRef}; `type` = closed 6 `LineageNodeType` (generation/agenome/candidate/critic/check/score); `status?` = open string (varies by node type); `metrics?` = `record<string,number>`; `dataRef` = opaque `string.min(1)` pointer (resolution is the projection-builder's job, §9, like `EvidenceRef`). `LineageEdge` = strict 5-field {id, source, target, type, label?}. `sequenceThrough` = int≥0, the per-run sequence watermark the projection was built through (§9 — rebuilt/discarded when newer events exist). Frozen `packages/contracts` (P0.13); field/node-type schema-snapshot (`spec(§10)`). |
| `FinalJudgeRubric` (+ `FinalJudgeAxis`) | §7 | **Held-out judge anchor — key safety rule #6 (immutable to agents, anti-reward-hacking).** Strict 4-field {axes, weights, policyVersion, immutableToAgents}. `FinalJudgeAxis` = closed 5 (grounding/novelty/feasibility/falsification_survival/subtype_check_pass) — no agent can add a judging axis. `axes` = `z.array(FinalJudgeAxis)` (shape-only; full-axis-set completeness is a kernel/load rule §6). `weights` = OPEN `record<string,number>` — structure frozen, values deferred-open; OPEN is REQUIRED by the §7 energy-efficiency tiebreak (a non-axis weight key). `policyVersion` = `string.min(1)` typed identically to `ScoringPolicy.version` (immutability-via-versioning, lesson §12; NO shared symbol — P0.8 YAGNI). `immutableToAgents` = `z.literal(true)` (false/omit rejected — flag unflippable). NO mutation/override/authority/scale field representable (strict + snapshot, lesson §9). **Strongest immutability pin in the package — stacks closed-axis + literal-true + required-version + no-authority.** Frozen `packages/contracts` (P0.15); field-set + `FinalJudgeAxis`(5) + literal-true schema-snapshot (`spec(§7)`). **Cross-track:** the P4/P5 held-out-judge LOAD path enforces no-agent-write + full-axis-set + `immutableToAgents:true` before scoring (Carry-forward). |

| `ProjectionWatermark` (+ `WatermarkedProjection<S>`) | §9 | **Demo-track-local projection contract — NOT an Appendix-A §2.5 cross-track seam.** Strict 2-field `{runId, sequenceThrough:int≥0}` — the executable form of the §9 invariant "any cached projection records the `(runId, sequence)` watermark it was built through and is discarded/rebuilt when newer events exist." `sequenceThrough` typed to match `LineageGraphProjection.sequenceThrough` (P0.13). Consumed by the `apps/api` projection builder (`buildProjection → WatermarkedProjection<S>{runId, sequenceThrough, state}`, P6.1); staleness via the pure `isStale(watermark, latestSequence)` predicate. Frozen `packages/contracts` (P6.1); field-name snapshot in `packages/contracts/test/projections/projection-watermark.test.ts` (`spec(§9)`), kept per-model NOT in the consolidated Appendix-A seam gate (it is not a §2.5 seam). |

<!-- Starts empty. The freeze-first contracts land in Phase 0 (packages/contracts); the orchestrator adds a row here as each contract model is consumed by apps/api. Canonical inventory: ARCHITECTURE.md Appendix A. -->

## Module organization

<!-- ▼ EXAMPLE BLOCK [id=module-layout]: module layout + layer dependency rule. Replace with the project's real directory tree and import-direction DAG. ▼ -->

```
apps/api/
  src/
    runtime/          # kernel: state machines, caps, energy ledger, RNG, generation loop, worker
    event-store/      # append-only writer (sequence + redaction + txn), migrations, replay reader
    model-gateway/    # ModelGateway port + provider adapters (OpenRouter, OpenAI embeddings, retrieval)
    verifier/         # critic council, held-out judge, critic rotation, injection isolation
    check-runners/    # allowlisted non-executing subtype check adapters
    selection/        # scoring, novelty, fitness, cull/parent-select, fusion, mutation
    projections/      # event-fold read models (current-state, lineage, replay summaries)
    routes/           # Fastify REST commands/queries + SSE stream + /runs/:id/health
  test/{unit,integration}/
```

Layer dependency direction (top depends on bottom, never reverse):

```
routes → projections → selection / verifier / check-runners → runtime → { event-store, model-gateway(port) } → packages/contracts
```

- Domain/runtime imports **only** `packages/contracts` + infrastructure ports — never a provider SDK, the frontend, or a projection read model.
- Provider adapters may import vendor SDKs; everything else sees only the `ModelGateway` port + `ProviderCapability`.

Cross-cutting layers can be imported from anywhere. Enforce the rule mechanically with a test where possible — the test *is* the spec for the rule (a dependency-cruiser/eslint boundary lint over §2.5 import rules).

<!-- ▲ END EXAMPLE BLOCK [id=module-layout] ▲ -->

## Subagents

See `.claude/agents/README.md` for the canonical inventory + integration points.

<!-- ▼ EXAMPLE BLOCK [id=area-subagent-candidates]: area-specific subagent candidates — list candidates that would earn their keep specifically in this area (e.g. an ABI/types syncer for a frontend area, a Pyth/feed verifier for a contracts area). Build only on real friction. ▼ -->

Candidates (build only on real friction):
- **event-schema/snapshot syncer** — when an Appendix-A model field changes, check the schema-snapshot test + the projection columns + the per-type payload map all moved together.
- **cap-invariant fuzzer** — generate over-cap spawn/energy/depth requests and assert the kernel fails closed (safety rule 1).

<!-- ▲ END EXAMPLE BLOCK [id=area-subagent-candidates] ▲ -->

## Lessons logged from prior sessions

The full prose for each lesson lives in `apps/api/LESSONS.md`. This index is the compact orientation surface.

**Lesson numbers are stable IDs** — once assigned, they don't change. New lessons get the next sequential number. `/session-end` proposes additions when it detects them; the user approves before the entry is written and a row is added here.

Lessons start at §1.

| # | Date | Topic | Rule (one-liner) |
|--:|---|---|---|
| 1 | 2026-06-20 | [strict closed contracts](LESSONS.md#1) | `z.strictObject` + `z.enum`, each pinned by a reject-out-of-set test AND a member-set/field-name snapshot · pin: `packages/contracts/test/__schema-snapshots__/field-sets.test.ts` |
| 2 | 2026-06-20 | [greenfield package toolchain](LESSONS.md#2) | workspace globs + strict `tsconfig.base` + per-package scripts + root `pnpm -r --if-present`; TS6 `paths` w/o `baseUrl` + omit `rootDir` for cross-package source (TS6059); `.prettierignore` scopes code + a doc-carrying pkg's `format:check` needs `--ignore-path ../../.prettierignore`; no per-pkg eslint config · accepted: convention (verified by /preflight) |
| 3 | 2026-06-20 | [secret-redaction scrub](LESSONS.md#3) | anchored+length-gated value-pattern + sensitive-key whole-value + secret-key de-collision; idempotent/structure-preserving/non-mutating; over-redact but keep patterns precise; env-value layer at the boundary · pin: `packages/contracts/test/security/redaction.test.ts` |
| 4 | 2026-06-20 | [contracts are pure / IO at boundary](LESSONS.md#4) | no env/file/network/clock reads in `packages/contracts`; pure fns over loaded sources, IO at the boot boundary; config deep-merge objects / replace arrays, skip JS-internal keys, field-identifying errors · pin: `packages/contracts/test/config/validate.test.ts` |
| 5 | 2026-06-20 | [shared union defined once](LESSONS.md#5) | a union/type shared by ≥2 models lives in its own module + imported, never redefined (`Subtype`) · accepted: convention (single-source-of-truth) |
| 6 | 2026-06-20 | [schema encodes shape, not kernel rules](LESSONS.md#6) | count/range/clamp invariants (parentIds 0–2, spawnBudget clamp) are kernel-enforced, NOT in the contract — the schema stays permissive so a buggy producer is rejected by the kernel with an event, not masked · accepted: convention |
| 7 | 2026-06-20 | [discriminated-union correlation](LESSONS.md#7) | a discriminant + its dependent payload = one `z.discriminatedUnion` (variant literals from the shared union §5) so a mismatch is unrepresentable; snapshot a union via `.options`+each variant `.shape` w/ a `safeParse` discriminant probe vs the shared union's `.options` · pin: `packages/contracts/test/domain/candidate-idea.test.ts` |
| 8 | 2026-06-20 | [injection-isolation primitive](LESSONS.md#8) | trusted-instructions vs untrusted-data as distinct fields + a single-source sentinel-wrap in the frozen pkg; the wrap NEUTRALIZES embedded sentinels (output has it exactly twice for any input), single-pass-complete (marker holds a char the sentinel lacks + no self-overlap → linear DoS bound) · pin: `packages/contracts/test/verifier/critic-input.test.ts` |
| 9 | 2026-06-20 | [emit-only / no-X-field via shape](LESSONS.md#9) | pin "actor emits evidence only / no authority" structurally — `z.strictObject` of exactly the evidence fields + field-name snapshot make a winner/policy/override field unrepresentable (anti-reward-hacking); SAME technique pins rule #8 success-only accounting (EnergyEvent has no failed/retried/repaired/success field) · pin: `packages/contracts/test/verifier/critic-review.test.ts` + `test/domain/energy-event.test.ts` |
| 10 | 2026-06-20 | [all-negative test needs a positive guard](LESSONS.md#10) | a reject-only test false-passes when the export is `undefined` (`undefined.parse` throws too) — lead with a positive `Schema.parse(valid)` guard so it fails loudly if the export vanishes · accepted: convention (testing discipline) |
| 11 | 2026-06-20 | [allowlist pinned two ways](LESSONS.md#11) | rule #3 allowlist pinned (a) non-executing BY SHAPE — `z.strictObject` makes a code field (exec/command/handler/fn/script/code) unrepresentable + (b) a single-source pure gate failing safe to a schema-valid skip on unregistered id via `hasOwnProperty.call` own-property lookup (defeats `__proto__`/`constructor` bypass), fixed skip reason · pin: `packages/contracts/test/checks/check-runner-adapter.test.ts` |
| 12 | 2026-06-20 | [immutability-via-versioning](LESSONS.md#12) | rule #6 — a source carries a `version`; every artifact carries a REQUIRED identically-typed `<thing>Version` (snapshot proves present + behavioral test proves required) so the source is never mutated in place + each artifact is bound to its exact version · pin: `packages/contracts/test/scoring/fitness-score.test.ts` |
| 13 | 2026-06-20 | [authoritative-once-computed value](LESSONS.md#13) | rule #7 — an expensive-once value (embedding vector, RNG outcome, provider result) is a REQUIRED field + its provenance (embeddingModelId, dimension) so it can't be omitted + replay reads it instead of recomputing · pin: `packages/contracts/test/scoring/novelty-score.test.ts` |
| 14 | 2026-06-20 | [pinned binary for checks](LESSONS.md#14) | run format/lint/type checks via the package-pinned binary (`pnpm format:check` / `./node_modules/.bin/<tool>`), NEVER bare `npx prettier`/`eslint`/`tsc` — npx can resolve a different version + report false-clean · pattern: `npx (prettier\|eslint\|tsc)` |
| 15 | 2026-06-20 | [per-type narrowing layer](LESSONS.md#15) | narrow a generic envelope payload in a SEPARATE layer (type→schema map + own-property resolver), never by mutating the frozen envelope; fail-open to generic for unknown types, fail-closed on a known-type mismatch; snapshot the map · pin: `packages/contracts/test/events/payload-map.test.ts` |
| 16 | 2026-06-20 | [bounded payload-DoS ceiling](LESSONS.md#16) | a payload ceiling is a bounded pure primitive — depth-before-size (stringify recurses), iterative early-exit, true-byte `Buffer.byteLength`, result-object never-throws, literal-pinned constants — a security primitive the append path calls, NOT a Zod range · pin: `packages/contracts/test/events/payload-map.test.ts` |
| 17 | 2026-06-20 | [agent-immutable anchor stacks all legs](LESSONS.md#17) | a must-be-immutable-to-agents contract stacks closed-enum set + `literal(true)` flag + required identical-typed version + strict no-authority-field + value/member snapshot; completeness + no-write-path pinned at the runtime load boundary · pin: `packages/contracts/test/verifier/final-judge-rubric.test.ts` |
| 18 | 2026-06-20 | [validator returns parsed value](LESSONS.md#18) | a boundary validator returns `parsed.data` (the validated/normalized value), never the caller's input, so a present-or-future transform/coercion can't bypass onto the authoritative path · pin: `packages/contracts/test/events/payload-map.test.ts` |
| 19 | 2026-06-21 | [amending-a-freeze playbook](LESSONS.md#19) | amend a frozen contract before downstream forks as a SOLO invariant slice — author spec into docs first, then extend closed enum + bump schemaVersion + update member-set snapshot + re-record fixtures (closure + safety semantics preserved; additive = non-breaking `feat`); re-`/phase-exit` delta-scoped + re-seal · accepted: convention (process) |
| 20 | 2026-06-20 | [subsystem seam over frozen contracts](LESSONS.md#20) | a seam = a TS interface whose I/O types ARE the frozen contracts (imported, never redefined; no vendor/infra type in the surface — rule #9); conformance-test via an in-test `implements` fake + `safeParse` + a `CANONICAL_FIXTURES` registry binding (`.toBe`) so a frozen-shape drift breaks loudly; explicit-deferral wiring with first-impl/first-consumer named as real tasks · pin: `apps/api/test/unit/model-gateway/port.test.ts` |
| 21 | 2026-06-20 | [boundary env-value redaction layer](LESSONS.md#21) | env-value redaction is boundary-local (the pure frozen scrub can't host it): compose frozen `scrubSecrets` + a local pass over INJECTED secrets redacting values + array elements + **KEYS with de-collision** (keys are producer-controlled — payload is an open-key `z.record`); guard empty/short secrets (≥8 + placeholder-substring); literal `split/join`, never a built regex · pin: `apps/api/test/unit/event-store/redaction.test.ts` |
| 22 | 2026-06-20 | [verify-then-narrow a safety scrub](LESSONS.md#22) | before narrowing a safety primitive's scope, verify the reachability premise against the actual schema/code (not intuition); when you narrow, point the Step-8 adversarial reviewer at exactly that boundary; defer to verified counter-evidence — a values-only env-value scope was a [high] rule-#4 leak caught this way · accepted: convention (process) |
| 23 | 2026-06-20 | [gateway structured-output discipline](LESSONS.md#23) | validate against the request schema → accept (`parsed.data`, §18) / repair ≤1 (invalid output as `wrapUntrusted` DATA in a user message, instruction in the system message only — rule #5; reuse the FROZEN sentinel §5/§8, never a local one) / reject (caller persists `output_schema_rejected` through the P1.2 scrub); ≤1 is a structural single-`await` bound; gateway emits/persists/debits nothing · pin: `apps/api/test/unit/model-gateway/structured-output.test.ts` |
| 24 | 2026-06-21 | [fake the provider layer, not the discipline](LESSONS.md#24) | fake a seam by injecting a fake `providerCall` into the REAL `createGateway` (runs the genuine discipline — can't drift); drive valid/repairable/reject via the fake's output, never bypass the discipline; keep it stateless + deterministic (detect a repair call via the sentinel in the message, NOT a cross-call counter) + env-free (selection config resolved by the boot caller) · pin: `apps/api/test/unit/model-gateway/stub/fake-gateway.test.ts` |
| 25 | 2026-06-21 | [DB append-only = triggers + least-privilege role](LESSONS.md#25) | rule #2 append-only needs a row-level UPDATE/DELETE trigger + a statement-level TRUNCATE trigger (row-level can't catch TRUNCATE) AND a least-privilege runtime role (non-owner/non-superuser; migrations as a separate owner) — triggers are privilege-defeatable (`session_replication_role`/`DISABLE TRIGGER`). testcontainers: shared container via `globalSetup`, real PG, vitest config split (preflight Docker-free) · pin: `apps/api/test/integration/event-store/migrations.test.ts` |
| 26 | 2026-06-21 | [authoritative append path = one txn](LESSONS.md#26) | one txn: validate (`RunEventEnvelope.omit` the server/DB-assigned `sequence`+`occurredAt` — caller can't set order/clock) → `validateEventPayload` ceiling (reject `{ok:false}`, caller emits the event) → `scrubSecrets` on the PARSED payload (§18) before the only insert → advisory-lock-serialized sequence (`pg_advisory_xact_lock(hashtext(run_id))`+`COALESCE(MAX+1,0)`, closes the TOCTOU; cross-run independent) → insert; writer surface = `{append, readByRun}` only; ids parameterized; authoritative-path error messages never echo payload · pin: `apps/api/test/integration/event-store/append.test.ts` |
| 27 | 2026-06-21 | [projection = pure ordered fold + watermark](LESSONS.md#27) | a projection is a generic reducer-injected PURE fold over `(runId, sequence)` → a watermark-tagged byte-stable result (exported `canonicalize` = sorted-key JSON, reused by P6.4); ASSERT strict consecutive monotonic ordering + reject `schemaVersion>current` + reject empty/mixed-run as a typed closed-reason `ProjectionError` (never silently fold/re-sort/skip); rebuild is provider-free (rule #7, no-import test §10); staleness = pure `isStale(watermark, latestSequence)` + thin parameterized `latestSequence(db, runId)` (runId opaque) · pin: `apps/api/test/unit/projections/projection-builder.test.ts` |
| 28 | 2026-06-21 | [a second persistence boundary mirrors the first exactly](LESSONS.md#28) | rule #4 second boundary (observability before Langfuse emit) mirrors the event-store twin's FULL discipline — same `enforcePayloadCeiling`-then-scrub ORDER (not just the scrub — a missing ceiling = unguarded recursion / stack-blow), same boundary-local env-value layer (keys+arrays+values, de-collision, ≥8 guard, literal split/join, proto-safe rebuild) composed over frozen `scrubSecrets` (never hoist/reimplement); inject the boundary IO (`createEmitBoundary`, L24) + fail safe (failed export → local warn, NO authoritative-log write, §13, no-DB-import test); cross-track consumer (P2.8) imports the canonical scrub, never duplicates · pin: `packages/observability/test/{redaction,emit}.test.ts` |
| 29 | 2026-06-21 | [concrete projection = reducer injected into the fold](LESSONS.md#29) | build a concrete projection as an immutable reducer INJECTED into the §27 `buildProjection` (never hand-roll the fold); rows keyed-by-id + SET (idempotent re-fold); high-traffic rows = frozen payload verbatim + read persisted values without recompute (rule #7); the event→entity-transition map is grounded in the FROZEN status enums (a marker is durable status only if the enum has the value — `generation.verifying/scoring/reproducing`→GenerationStatus; the 8 op-markers no-op for the live view §12); `energy_exhausted` mid-flight not terminal (§5); cull→status, reproduction→edges; an un-evented transition is DEFERRED as an integration-reconcile carry-forward, never guessed from side-effects · pin: `apps/api/test/unit/projections/current-state.test.ts` |
| 30 | 2026-06-21 | [secondary projection = pure transform; render-graph drops dangling edges](LESSONS.md#30) | a projection another already covers is a PURE TRANSFORM of it (carry the watermark through, never re-fold); as a producer of a frozen Appendix-A model don't touch the contract — pin producer-conformance (output `safeParse`s the frozen schema = the §2.5 check, no new snapshot); a render-bound graph's edge set must CONNECT the tree (genealogy lineage_edges + structural derivation edges over the open `LineageEdge.type`) and DROP an edge with a missing endpoint (React Flow breaks on dangling) + use UNIQUE edge ids (kind-prefix `struct:`/`repro:` so a shared source→target never collides — RF ALSO breaks on DUPLICATE edge ids, `demo-020` gate-fix); encode non-node concepts as status/metric on the CLOSED node-type set (winner = candidate status 'selected', novelty = metric); `dataRef` = within-tier id · pin: `apps/api/test/unit/projections/lineage-graph.test.ts` (incl. `test_edge_ids_unique`) |
| 31 | 2026-06-21 | [replay path = rule-#7 surface, structurally pinned](LESSONS.md#31) | enforce rule #7 at the replay path STRUCTURALLY: give the reader a narrowed type (`Pick<EventStore,'readByRun'>`) so append/writes are unreachable (rule #2+#7); pin no-provider two ways — an import-ban test (transitive path = only `@doppl/contracts` + relative modules + runtime-erased `import type`) AND a call-shape test (no `fetch(`/`Math.random(`/provider symbol); re-fold the persisted log via the §27/§29 builders (schemaVersion-≤-current gate ON the path, reused not bypassed) reading RNG/embedding/retrieval from persisted payloads verbatim (never re-sample/re-embed/re-call); state-equivalence = `canonicalize(replay)===canonicalize(captured)` (L27, a determinism guard); commit an older-`schemaVersion`(v1) fixture that replays · pin: `apps/api/test/unit/projections/replay-summary.test.ts` |
| 32 | 2026-06-21 | [REST write path: sanitizing boundary + ingestion gates](LESSONS.md#32) | Fastify write path = `bodyLimit` ingestion gate (before the P0.10 ceiling) + a `setErrorHandler` that SANITIZES 5xx to `{error:'internal_error'}` (no internal-message leak at the trust boundary; 4xx pass through; server-stdout `request.log.error` is OUTSIDE the rule-#4 event-log/Langfuse/UI boundary); `validateRunConfig` at ingestion (reject a non-object body, no event on invalid); cap overrides rejected above the validated maxima as an API DEFENSE layer (kernel = authoritative enforcer, rule #1); idempotency-key dedup + one-active-run via an in-memory hint RE-VALIDATED against the authoritative log (in-memory = §5 single-process MVP; persisted dedup + log-wide scan = hosted/P3 hardening); REST appends authoritative events ONLY, never mutates a projection (rule #2, no `.insert`/drizzle in the route) · pin: `apps/api/test/integration/routes/runs.test.ts` |
| 33 | 2026-06-21 | [REST read surface: rebuild-on-read + clean 404 + cross-track read-import](LESSONS.md#33) | the GET read surface registers on the shared Fastify server + REBUILDS each projection from `readByRun` on read (MVP — always fresh; dashboard_snapshots cache + watermark-staleness deferred); unknown id → clean 404 (never partial/empty 200); reads are read-only (no append/projection-write — rule #2); when a read needs another TRACK's area data, keep the reader IN-AREA + READ-IMPORT that area's schema (`listRunIds` in `projections/` read-imports `event-store/schema`, `selectDistinct` — zero kernel-file edits; a read-only cross-area import is fine, editing isn't) · pin: `apps/api/test/integration/routes/runs-read.test.ts` |
| 34 | 2026-06-21 | [run-health = read-only log-derived signal; count-based ops-in-flight; clamped caps](LESSONS.md#34) | `GET /runs/:id/health` is a read-only rebuild-on-read projection of the log (no provider, distinct from Langfuse): operations-in-flight = `max(0, count(*_started) − count(completion))` per op family (exclude durable generation phase-markers; judge pairing awaits sv3 `judge.reviewed`; a failed op stays counted — MVP, matches literal "unpaired" spec); caps-consumed CLAMPED `min(consumed, ceiling)` per cap (never over-report, null if no caps); candidates-in-flight = non-terminal status; lastEventAt = highest-sequence occurredAt; unknown id → 404; shape apps/api-internal (promote at P7.14) · pin: `apps/api/test/integration/routes/run-health.test.ts` |
| 35 | 2026-06-21 | [SSE run-event stream = delivery-only bridge polling readByRun; id=sequence resume](LESSONS.md#35) | `GET /runs/:id/stream` is a delivery-only, non-authoritative live feed (rule #2): a demo-owned async-generator bridge POLLS `readByRun` past the cursor (read-imports the event store — NO kernel-file edit, like P6.7 `listRunIds`; append→notify bus = deferred hosted/P3 optimization); SSE `id`=event `sequence` so `Last-Event-ID` (header + `?lastEventId` fallback, numeric-guard → 400 if present-but-invalid; absent → from 0) resumes gap/dup-free (`sequence>cursor` only); carries op-start markers AND completions (§4/§12 live window); pinned rule #2 two ways (event-count-unchanged + re-stream byte-identical) + drop+resync === uninterrupted (sequence sole ordering) + fallback `GET /events` reconstructs identical ids; unknown id → clean 404; `reply.hijack()` + raw `text/event-stream` single-line `data` framing (Fastify v5, no frame-injection), client-disconnect → `AbortController.abort()`; injected `sleep`/`maxIdlePolls=1` keeps tests timer-free (`buildServer` gains `sse?: EventBridgeOptions`, prod default real sleep/∞) · pin: `apps/api/test/integration/routes/run-stream.test.ts` + `test/unit/sse/event-bridge.test.ts` |
| 36 | 2026-06-21 | [runtime self-observability built ahead of the worker; logger stamps §4 correlation IDs (console local-unscrubbed, external reuses §28); heartbeat = injected-clock throttle + pure staleness](LESSONS.md#36) | two observability primitives built AHEAD of the live worker (P3 absent on the demo fork, like P6.1/P6.9) + injected-everything: the kernel-logger stamps the §4 envelope correlation IDs (runId req + generationId?/agenomeId?/correlationId?) to an injected sink (default console) — the local `log()`/console path is NOT scrubbed (process trust boundary, LESSONS §32; secrets never reach the input by the env-only guarantee), the ONLY external path `emitExternal` REUSES the §28 `createEmitBoundary` (ceiling-then-scrub, rule #4, never reimplemented; no boundary = no-op); the heartbeat is an injected-clock throttle (≤1 beat/intervalMs, no real setInterval/Date.now) + pure `isWorkerAlive(lastBeatAt, now, staleAfterMs)` (null-never-beat + stale-window → not-alive); BOTH modules structurally barred from the append path (import-ban test — never block/mutate the log) + emit NO `run_events` (a heartbeat/log is a side signal, not in the closed 36-type registry); console + injected sink only, no external metrics stack (§13 MVP, import-ban over datadog/prom-client/prometheus/statsd/@opentelemetry); worker-loop + `/health` last-heartbeat wiring DEFER to P3/integration · pin: `packages/observability/test/kernel-logger.test.ts` + `apps/api/test/unit/runtime/heartbeat.test.ts` |
| 37 | 2026-06-21 | [run format:check in the per-slice gate, not just /preflight](LESSONS.md#37) | the per-slice `/tdd` gate (`lint && typecheck && test`) does NOT run `pnpm format:check` — only `/preflight` + `/phase-exit` do — so a slice lands format-dirty + prettier drift ACCUMULATES silently across committed slices until the phase boundary trips on the pile-up (P6.9/P6.10 test files caught at the P6.11 boundary; same class as LESSONS §14 npx-false-clean); add `pnpm format:check`/`prettier --write` (package-pinned, never bare npx — §14) to the PER-SLICE gate; fix accumulated drift as a standalone format-only `style:` commit separate from the `feat:`; durable fix = fold format:check into the /tdd Step-8 gate (scaffold change → lead) · accepted: convention (process); durable fix = /tdd-gate scaffold edit |

<!-- Starts empty. Each row links to its `LESSONS.md` anchor. -->
