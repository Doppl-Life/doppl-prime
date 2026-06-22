# P4 Security Review — Verifier Surface (phase-boundary)

**Dispatch:** `/phase-exit` phase-boundary, `security-reviewer` policy = `invariant` (this slice surface is invariant-touching — rules #3/#4/#5/#6/#7).
**Date:** 2026-06-21 · **Branch:** `track/verifier`
**Reviewer pass:** own pass (no delegation). CodeGraph MCP unavailable for this project (`not initialized`) — fell back to `git log` + filesystem `grep`/`Read`. Context7 not needed (no external-library security semantics in scope).

## Scope + over-approximation note

Phase-boundary review surface = the **accumulated branch diff** for the Phase 4 verifier work (24 files, +1835 LOC, `main...HEAD`), NOT a single slice diff. Per the phase-boundary policy this **over-approximates to the accumulated track diff** for the verifier track's P4 phase — acceptable and stated here. Files reviewed:

- `apps/api/src/verifier/**` — `isolation/candidate-as-data.ts`, `council/{rotation,run-council,critic-call}.ts`, `judge/{judge-call,rubric}.ts`
- `apps/api/src/check-runners/**` — `registry.ts`, `run-check.ts`, `live-rerun.ts`, `shared.ts`, `transfer/*`, `zeitgeist/*`
- `packages/contracts/src/verifier/**` — `critic-input.ts`, `critic-review.ts`, `final-judge-rubric.ts`, `judge-result.ts`
- Supporting (read for context, not in P4 diff): `runtime/rng/seededRng.ts`, `gateway/provider-meta.ts`

The runtime **wiring** of `selectCriticMandates` / `runCouncil` / `runJudge` / `liveRerun` is named-deferral to the P3/P5/demo tracks (no production callers yet — confirmed by grep). This review covers the components as built; the trust-boundary crossing into the live generation loop is re-reviewable when P3 wires it.

## Invariant pass (invariant_touching: yes)

### Rule #3 — No arbitrary code execution (allowlisted, non-executing check-runners) — **PASS**

- `CHECK_RUNNER_REGISTRY` + `CHECK_RUNNER_IMPLS` are both `Object.freeze`d, boot-fixed, closed maps (`registry.ts:102,186`). No runtime/agent/candidate registration path exists.
- The gate is the frozen `resolveCheckAdapter` (re-exported, never reimplemented, `registry.ts:41`); the harness resolves through it (`run-check.ts:97`). Unregistered id → schema-valid `skipped` CheckResult; registered-but-no-impl → `skipped{execution_required}` (`run-check.ts:104-115`). No execution path exists for either.
- Own-property lookup defeats `__proto__`/`constructor` bypass: `ownLookup` uses `Object.prototype.hasOwnProperty.call` (`run-check.ts:51-53`); the frozen gate uses the same (lesson 11).
- `transfer/allowlisted-executable.ts` — the highest-risk-by-name adapter — **never executes** the candidate's `executableCheckIdea`; it checks only *presence* + prepared-problem allowlist membership (`PREPARED_PROBLEM_ALLOWLIST`, closed `ReadonlySet`, `:26`) and returns a deterministic prepared verdict (`:31-49`). Candidate code is read as DATA only.
- `grep` for `eval | new Function | child_process | exec | spawn | require( | import( | vm.` across the surface → **zero** code hits (only docstring mentions). All candidate parsing is `JSON.parse` wrapped fail-to-`null` (`shared.ts:21-45`), never executed.

### Rule #4 — Secrets never leave the server — **PASS**

- `ProviderMeta` (the only provider metadata persisted on `critic.reviewed`/`judge.reviewed`/`JudgeResult`) is a strict 6-field object — `provider, modelId, gatewayRequestId, tokensIn, tokensOut, costEstimate?` — with **no credential field representable** (`provider-meta.ts`, rule #4 by shape).
- All event writes go through the `EventStore` port (`store.append`), never a raw `run_events` write (grep `(insert|update|delete).*run_events` → none). The append path runs the redaction scrub at the persistence boundary before insert (lessons 21/26) — the P4 producers add no payload path that bypasses it.
- No `process.env` / fetch / provider-SDK import anywhere in the surface (grep → none). The verifier reaches providers only through the injected `ModelGateway` port.

### Rule #5 — Candidate text is DATA, never instructions — **PASS**

- Single isolation chokepoint `assembleIsolatedRequest` (`candidate-as-data.ts:51`): the trusted `instruction` + fixed `ISOLATION_DATA_FRAMING` build the `system` message **byte-identically regardless of candidate text**; the candidate rides alone in a `user` message via the **frozen** `wrapUntrusted` (`:59`), never a local sentinel.
- `wrapUntrusted` (`critic-input.ts:57`) neutralizes embedded sentinels → output holds the sentinel exactly twice for any input (single-pass-complete, lesson 8) — an evolved agenome cannot forge a delimiter boundary.
- Both consumers funnel through the seam: `critic-call.ts:96-101` and `judge-call.ts:122-127` pass `serializeCandidate(candidate)` into the `candidate:` param ONLY. Verified every `serializeCandidate` call site lands in `candidate:`, never `instruction:`. The trusted instruction is a closed const map (`MANDATE_INSTRUCTIONS`, `run-council.ts:18`) / fixed `JUDGE_INSTRUCTION` (`judge-call.ts:65`) — never candidate-derived.
- `grep` for template-interpolation of candidate text into an instruction/system string → only deterministic-id construction (`runId`/`candidateId`, not free candidate text) and internal DATA-only token comparison inside pure check adapters. No injection surface.

### Rule #6 — Emit-only council + immutable judge anchor (anti-reward-hacking) — **PASS**

- `CriticReview` is strict 7-field — no `winner`/`selected`/`scoreOverride`/`policyVersion` representable (`critic-review.ts:31`). `runCouncil` returns `CriticReview[]` and nothing else (`run-council.ts:46`) — cannot select/mutate/alter policy. The council-local `CriticModelOutput` is `z.object` (strips any model-sent identity/authority field, `critic-call.ts:34`); the **council** sets the trusted identity (`:125-133`), the model fills only evidence.
- Judge: the **runner** computes the acceptance aggregate (`computeAcceptanceMetric`, `judge-call.ts:76-85`); `JudgeModelOutput` is `z.object` of the 5 axis scores only and strips any model-sent `acceptance`/`total`/`id` (`:44`). `FinalJudgeRubric` is strict + `immutableToAgents: z.literal(true)` (`final-judge-rubric.ts:38`); `loadJudgeRubric` re-asserts full-axis-set completeness + `immutableToAgents===true` through an `unknown`-typed local so it stays a live runtime check (`rubric.ts:38-73`); `DEFAULT_JUDGE_RUBRIC` is a `deepFreeze`d in-code const (`:96`). No agenome/candidate-derived rubric path (`rubricSource` defaults to the frozen const; always re-validated).
- **P4.7 rotation (`rotation.ts`, `selectCriticMandates`) — explicit re-check:**
  - Codomain confined to `CriticMandate.options` (`:59`, partial Fisher-Yates over the closed universe) — cannot touch the judge anchor.
  - Signature takes **only scalars** (`rngSeed`, `generationIndex`, `activeCount?`) — **no `CandidateIdea`/`Agenome`/candidate-content param** (`SelectCriticMandatesParams`, `:30`) → uninfluenceable by candidate text or agenome metric-mutation.
  - Imports only `CriticMandate` + `createSeededRng` (`:1-2`) — **no `FinalJudgeRubric`/judge/`ScoringPolicy`/scoring symbol**. Cannot add/remove/reweight a judging axis. Confirmed PASS.

### Rule #7 — Replay calls no providers (closed-form re-derivation) — **PASS**

- Rotation is a pure closed-form fn of persisted inputs (`RunConfig.rngSeed` + `Generation.index`) → re-derived on replay, no outcome log, no event (lesson 37). Import-list has no provider/web/store seam, no `persistOutcomes`; only randomness is the deterministic seed-derived `createSeededRng` (`:63`). `deriveGenSeed` is pure integer ops, no `Math.random`/`Date.now` (`:45-50`).
- `createSeededRng` (`seededRng.ts:35`) is pure mulberry32 — reads only its own seeded integer state; no OS randomness, no clock, no provider/web seam. `grep Math.random|Date.now|new Date(` across the whole surface → **zero** code hits (only docstrings).
- Judge `computeAcceptanceMetric` recomputes deterministically from persisted per-axis scores (`judge-call.ts:76`); `JudgeResult.axisScores`+`acceptance` are REQUIRED persisted fields → replay reads, never re-judges.
- Check adapters are pure (input → CheckResult), make **no provider call** — grounding adapters consume caller-fetched `retrievalResults` as DATA; absent → `skipped{retrieval_unavailable}`, never a re-fetch (`shared.ts:131`, `prior-art.ts`, `current-signal-grounding.ts`, `falsifiability.ts`).
- `liveRerun` fallback is READ-ONLY: `findRecordedFallback` reads `store.readByRun` for the latest usable recorded `check.completed` (`live-rerun.ts:52-73`); on live failure it serves the recorded verdict or a non-fabricated skip — never re-samples a provider, never appends (`:75-106`).

## General security pass

- **Input validation:** all model output schema-validated before use (`CriticModelOutput`/`JudgeModelOutput` `safeParse`; `CriticReview.parse`/`JudgeResult.parse`/`CheckResult.parse` at the persist boundary). Untrusted candidate JSON parsed fail-to-`null`, never thrown (`shared.ts`).
- **Injection:** covered by rule #5 — no string-concat-to-instruction or string-concat-to-system surface.
- **DoS / unbounded loops:** rotation loop bounded by `k=min(activeCount,N)` over the 5-member closed universe; council loop bounded by the injected mandate set; check adapters bounded by candidate payload (the append path's `enforcePayloadCeiling`, lesson 16, bounds persisted size upstream). No unbounded user-controlled loop introduced.
- **Information disclosure:** skip reasons + rejection reasons are fixed constants — the untrusted candidate id/text is never reflected into a skip reason or error message (`allowlisted-executable.ts:17`, `shared.ts:108`). Authoritative-path errors don't echo payload.
- **Error handling:** the family is fail-not-throw (unparseable → `failed`/`null`, never an exception escaping the harness); `groundingRefs` drops empty-source results so a degraded fetch can't produce an invalid `EvidenceRef` that throws downstream `CheckResult.parse` (`shared.ts:149-154`).

## Findings

**None.** No critical / high / medium / low findings. Every P4 safety invariant is enforced structurally (by frozen shape + import-list + pure construction), with runtime re-asserts where the contract can't pin the property (judge full-axis-set + `immutableToAgents` re-assert). No bypass surface, no execution path, no provider reach on the replay path, no candidate-to-instruction interpolation, no credential-bearing persisted field.

## Verdict

**CLEAR** — no findings; no Step-9 escalation. Re-review the trust-boundary crossing when P3/P5/demo wires `selectCriticMandates`/`runCouncil`/`runJudge`/`liveRerun` into the live generation loop (the only remaining unreviewed seam, currently named-deferral).
