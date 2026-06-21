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
| `RunEventEnvelope` | §4 | Strict 14-field envelope; `actor` = closed 7-role union (operator/runtime/agenome/critic/check_runner/selection_controller/system); `sequence` sole ordering key; `occurredAt` display-only; generic object `payload` (P0.10 narrows per-type); `schemaVersion` + exported `CURRENT_SCHEMA_VERSION=3` (bumped 1→2 by P0.1-amend, 2→3 by the judge-output amendment; readers accept all `schemaVersion ≤ current`, so v1/v2 envelopes still validate). Frozen in `packages/contracts` (P0.1); enforced by field-name schema-snapshot (`spec(§4)`). |
| `RunEventType` | §4 | Closed **37-member** registry: the 18 lifecycle + 7 failure/terminal types (RISK-006) + **11 operation-start / in-flight observability markers** (P0.1-amend — generation.verifying/scoring/reproducing, candidate.generation_started, critic.review_started, check.started, novelty.scoring_started, judge.review_started, fusion.started, tool_call.started/finished; persisted + replay-faithful + **no energy debit** rule #8 — they fall back to the generic payload, never narrow to EnergyEvent) + the **terminal `judge.reviewed`** (judge-output amendment — the held-out-judge acceptance result; narrows to `JudgeResult`, the §2.5 verifier→selection seam; the terminal half of the `judge.review_started` marker, NOT itself a marker); rejects unlisted values. Frozen in `packages/contracts` (P0.1 + P0.1-amend + judge-output amendment, schemaVersion 3); member-set snapshot (`spec(§4)`). |
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
| per-type payload map (`events/payload-map.ts`) | §4 | Narrowing layer OVER the generic frozen `RunEventEnvelope.payload` — does NOT mutate the envelope. `HIGH_TRAFFIC_PAYLOAD_MAP: Partial<Record<RunEventType, ZodType>>` maps the 7 §4 high-traffic types to their frozen model (energy.spent←EnergyEvent, candidate.created←CandidateIdea, critic.reviewed←CriticReview, check.completed←CheckResult, novelty.scored←NoveltyScore, fitness.scored←FitnessScore, judge.reviewed←JudgeResult — same schema validates write + model). `resolvePayloadSchema(type)` = own-property lookup (lesson §11), fails OPEN to `GENERIC_PAYLOAD_SCHEMA` (= envelope's `z.record(z.string(),z.unknown())`) for non-high-traffic types, fails CLOSED (reject) on a high-traffic mismatch. `enforcePayloadCeiling(payload)` = bounded payload-DoS primitive: **depth-first (iterative DFS, early-exit) THEN size** (`MAX_PAYLOAD_BYTES`=1 MiB, `MAX_PAYLOAD_DEPTH`=32, literal-value-pinned), result-object, never throws (unserializable→`max_bytes`). `validateEventPayload(type,payload)` composes both for the P1 append path. `fitness.scored`↔novelty link = `candidateId` + `components.novelty` (Q1=A; frozen `FitnessScore` unchanged, `noveltyScoreId` strict-rejected). Frozen `packages/contracts` (P0.10); key-set + per-key mapping + literal-constant schema-snapshot (`spec(§4)`). |
| `Run` / `Generation` (+ `RunStatus`, `GenerationStatus`) | §3 | `Run` = strict 7-field {id, seed, enabledSubtypes[], caps:RunCaps, status, startedAt, completedAt?}. `seed` = run/problem-scenario string (= `RunConfig.seed` by name, lesson §5; **DISTINCT from the RNG seed** `RunConfig.rngSeed`:int). `enabledSubtypes` = `z.array(Subtype)` with **NO `.min(1)`** (count ≥1 is a kernel rule §6 — `RunConfig.enabledSubtypes` carries the boot-gate `.min(1)`, the entity does not). `caps` imports frozen `RunCaps` (P0.3). `RunStatus` = closed 8 (configured/running/completing/completed/stopping/stopped/failed/cancelled). `Generation` = strict 6-field {id, runId, index(int≥0), status, startedAt, completedAt?}; `GenerationStatus` = closed 8 (pending/running/verifying/scoring/reproducing/completed/failed/skipped). Frozen `packages/contracts` (P0.15 partial); field/status schema-snapshot (`spec(§3)`). |
| `CullingEvent` | §3, §8 | Strict 6-field {id, runId, generationId, targetIds[], reason, scoreSnapshot}; `targetIds` = array of ids (empty array parses — count is a kernel rule §6); `reason` = non-empty string; `scoreSnapshot` = `record<string,number>` (inspectable cull justification, §8 explainability; empty `{}` parses). The persisted shape behind the `lineage.culled` event type. Frozen `packages/contracts` (P0.15 partial); field-set schema-snapshot (`spec(§8)`). |
| `LineageGraphProjection` (+ `LineageNode`, `LineageNodeType`, `LineageEdge`) | §10 | Strict 4-field {runId, nodes[], edges[], sequenceThrough}; **storage-agnostic** (no physical-storage/Neo4j field — strict). `LineageNode` = strict 6-field {id, type, label, status?, metrics?, dataRef}; `type` = closed 6 `LineageNodeType` (generation/agenome/candidate/critic/check/score); `status?` = open string (varies by node type); `metrics?` = `record<string,number>`; `dataRef` = opaque `string.min(1)` pointer (resolution is the projection-builder's job, §9, like `EvidenceRef`). `LineageEdge` = strict 5-field {id, source, target, type, label?}. `sequenceThrough` = int≥0, the per-run sequence watermark the projection was built through (§9 — rebuilt/discarded when newer events exist). Frozen `packages/contracts` (P0.13); field/node-type schema-snapshot (`spec(§10)`). |
| `FinalJudgeRubric` (+ `FinalJudgeAxis`) | §7 | **Held-out judge anchor — key safety rule #6 (immutable to agents, anti-reward-hacking).** Strict 4-field {axes, weights, policyVersion, immutableToAgents}. `FinalJudgeAxis` = closed 5 (grounding/novelty/feasibility/falsification_survival/subtype_check_pass) — no agent can add a judging axis. `axes` = `z.array(FinalJudgeAxis)` (shape-only; full-axis-set completeness is a kernel/load rule §6). `weights` = OPEN `record<string,number>` — structure frozen, values deferred-open; OPEN is REQUIRED by the §7 energy-efficiency tiebreak (a non-axis weight key). `policyVersion` = `string.min(1)` typed identically to `ScoringPolicy.version` (immutability-via-versioning, lesson §12; NO shared symbol — P0.8 YAGNI). `immutableToAgents` = `z.literal(true)` (false/omit rejected — flag unflippable). NO mutation/override/authority/scale field representable (strict + snapshot, lesson §9). **Strongest immutability pin in the package — stacks closed-axis + literal-true + required-version + no-authority.** Frozen `packages/contracts` (P0.15); field-set + `FinalJudgeAxis`(5) + literal-true schema-snapshot (`spec(§7)`). **Cross-track:** the P4/P5 held-out-judge LOAD path enforces no-agent-write + full-axis-set + `immutableToAgents:true` before scoring (Carry-forward). |
| `JudgeResult` | §7, §8 | **Held-out-judge persisted ACCEPTANCE OUTPUT (judge-output amendment).** Strict 7-field {id, candidateId, axisScores, acceptance, rubricPolicyVersion, providerMeta, langfuseTraceId?}. `axisScores`=`z.record(FinalJudgeAxis, z.number())` — the per-axis breakdown keyed by the single-source closed `FinalJudgeAxis` (lesson §5); in Zod v4 the enum-keyed record is **exhaustive + closed** (all 5 axes required, unknown axis rejected) → rule #6 defense-in-depth, the judge output can't drop/add a judging axis (⚠ Zod-v4-version-dependent — a major bump must re-run these contract tests). `acceptance`=`z.number()` — the overall metric selection consumes (surfaced as `FitnessScore.components.judge_acceptance`; the fitness↔judge link is by `candidateId` join + that component, NOT a duplicate authoritative copy — `judgeResultId` strict-rejected, mirroring the novelty link). `rubricPolicyVersion`=`string.min(1)` typed identically to `FinalJudgeRubric.policyVersion` (immutability-via-versioning, lesson §12/§17). `providerMeta`=shared `ProviderMeta` (lesson §5; rule #4 no-secret), REQUIRED. Rule #5: strict → malformed judge output rejected at persist. Rule #7: `axisScores`+`acceptance` REQUIRED so replay reads them, never re-judges (lesson §13). NO rubric/weights/immutableToAgents/scoreOverride field representable (rule #6, lesson §9). `judge.reviewed`←`JudgeResult` is the authoritative judge home (the §2.5 verifier→selection seam). Frozen `packages/contracts` (P0.16); field-set + payload-narrowing schema-snapshot (`spec(§7)`/`spec(§4)`). **Cross-track:** producer = P4.8 (verifier); consumer = P5.5 (selection). |

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
| 2 | 2026-06-20 | [greenfield package toolchain](LESSONS.md#2) | workspace globs + strict `tsconfig.base` + per-package scripts + root `pnpm -r --if-present`; TS6 `paths` w/o `baseUrl`; `.prettierignore` scopes code · accepted: convention (verified by /preflight) |
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
| 20 | 2026-06-21 | [judge-output seam + enum-keyed record](LESSONS.md#20) | a cross-subsystem ACCEPTANCE OUTPUT needs a first-class persisted model (not just a producer "persist it" bullet) — model it like its authoritative sibling (JudgeResult ~ NoveltyScore; `judge.reviewed`←JudgeResult ~ `novelty.scored`←NoveltyScore); key a closed-set breakdown with `z.record(ClosedEnum, …)` (exhaustive+closed in Zod v4 — version-dependent, gate a major bump) to derive the set from one source (lesson §5) + pin rule #6; link the downstream consumer by join + named component, never a duplicate authoritative copy · pin: `packages/contracts/test/verifier/judge-result.test.ts` |

<!-- Starts empty. Each row links to its `LESSONS.md` anchor. -->
