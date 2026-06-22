# P4 Reachability Audit — verifier + check-runners

**Audit date:** 2026-06-21  
**Branch:** `track/verifier`  
**Area:** `apps/api/src/verifier/**` + `apps/api/src/check-runners/**`  
**Auditor:** reachability-auditor subagent

---

## Scope

All exported symbols from the verifier subsystem (council, judge, isolation) and the
check-runners subsystem (registry, run-check, live-rerun, shared utilities, transfer
adapters, zeitgeist adapters).

Production entry-point set for `apps/api` as a backend service:
- HTTP/REST route handlers (Fastify routes registered under `apps/api/src/routes/`)
- The `apps/api/src/index.ts` package barrel
- The `apps/api/src/runtime/index.ts`, `event-store/index.ts`, `model-gateway/index.ts` sub-barrels
- Any production module outside the test tree that imports from the audited paths

---

## Enumeration of exported symbols

### `apps/api/src/verifier/council/critic-call.ts` (4 exports)

| Symbol | Kind |
|---|---|
| `CouncilRunContext` | interface |
| `RunCriticCallParams` | interface |
| `serializeCandidate` | function |
| `runCriticCall` | async function |

### `apps/api/src/verifier/council/rotation.ts` (3 exports)

| Symbol | Kind |
|---|---|
| `DEFAULT_ACTIVE_CRITIC_COUNT` | const |
| `SelectCriticMandatesParams` | interface |
| `selectCriticMandates` | function |

### `apps/api/src/verifier/council/run-council.ts` (2 exports)

| Symbol | Kind |
|---|---|
| `RunCouncilParams` | interface |
| `runCouncil` | async function |

### `apps/api/src/verifier/isolation/candidate-as-data.ts` (3 exports)

| Symbol | Kind |
|---|---|
| `ISOLATION_DATA_FRAMING` | const |
| `AssembleIsolatedRequestParams` | interface |
| `assembleIsolatedRequest` | function |

### `apps/api/src/verifier/judge/judge-call.ts` (3 exports)

| Symbol | Kind |
|---|---|
| `JudgeRunContext` | interface |
| `RunJudgeParams` | interface |
| `runJudge` | async function |

### `apps/api/src/verifier/judge/rubric.ts` (2 exports)

| Symbol | Kind |
|---|---|
| `loadJudgeRubric` | function |
| `DEFAULT_JUDGE_RUBRIC` | const |

### `apps/api/src/check-runners/registry.ts` (8 exports)

| Symbol | Kind |
|---|---|
| `resolveCheckAdapter` (re-export from `@doppl/contracts`) | function |
| `PREPARED_TOY_ADAPTER_ID` | const |
| `EXECUTION_REQUIRING_ADAPTER_ID` | const |
| `RetrievalResult` | interface |
| `CheckRunnerInput` | interface |
| `CheckRunner` | type |
| `CHECK_RUNNER_REGISTRY` | const |
| `CHECK_RUNNER_IMPLS` | const |

### `apps/api/src/check-runners/run-check.ts` (5 exports)

| Symbol | Kind |
|---|---|
| `EXECUTION_REQUIRED_REASON` | const |
| `CheckRequest` | interface |
| `CheckRunContext` | interface |
| `RunCheckParams` | interface |
| `runCheck` | async function |

### `apps/api/src/check-runners/live-rerun.ts` (4 exports)

| Symbol | Kind |
|---|---|
| `LiveAttempt` | type |
| `LIVE_NO_FALLBACK_REASON` | const |
| `LiveRerunParams` | interface |
| `liveRerun` | async function |

### `apps/api/src/check-runners/shared.ts` (11 exports)

| Symbol | Kind |
|---|---|
| `MIN_TOKEN_LEN` | const |
| `parseTransferCandidate` | function |
| `parseZeitgeistCandidate` | function |
| `normalize` | function |
| `wordCount` | function |
| `tokenSet` | function |
| `tokenOverlap` | function |
| `decided` | function |
| `groundedResult` | function |
| `skipped` | function |
| `unparseable` | function |
| `RETRIEVAL_UNAVAILABLE_REASON` | const |
| `retrievedCorpus` | function |
| `groundingRefs` | function |

### Transfer check adapters (5 files, 5 adapter consts + 5 ID consts + misc consts)

| Symbol | File | Kind |
|---|---|---|
| `ALLOWLISTED_EXECUTABLE_ADAPTER_ID`, `NO_EXECUTABLE_IDEA_REASON`, `PROBLEM_NOT_PREPARED_REASON`, `PREPARED_PROBLEM_ALLOWLIST`, `allowlistedExecutableCheck` | `transfer/allowlisted-executable.ts` | consts / const |
| `MAPPING_QUALITY_ADAPTER_ID`, `MAPPING_QUALITY_MIN_WORDS`, `mappingQualityCheck` | `transfer/mapping-quality.ts` | consts / const |
| `PRIOR_ART_ADAPTER_ID`, `PRIOR_ART_MAX_OVERLAP`, `priorArtCheck` | `transfer/prior-art.ts` | consts / const |
| `SOURCE_VALIDITY_ADAPTER_ID`, `sourceValidityCheck` | `transfer/source-validity.ts` | consts / const |
| `TARGET_FIT_ADAPTER_ID`, `TARGET_FIT_MIN_OVERLAP`, `targetFitCheck` | `transfer/target-fit.ts` | consts / const |

### Zeitgeist check adapters (5 files)

| Symbol | File | Kind |
|---|---|---|
| `ZEITGEIST_COHERENCE_ADAPTER_ID`, `COHERENCE_MIN_OVERLAP`, `zeitgeistCoherenceCheck` | `zeitgeist/coherence.ts` | consts / const |
| `CURRENT_SIGNAL_GROUNDING_ADAPTER_ID`, `GROUNDING_MIN_OVERLAP`, `currentSignalGroundingCheck` | `zeitgeist/current-signal-grounding.ts` | consts / const |
| `FALSIFIABILITY_ADAPTER_ID`, `FALSIFIABILITY_MIN_PREDICTION_OVERLAP`, `falsifiabilityCheck` | `zeitgeist/falsifiability.ts` | consts / const |
| `ZEITGEIST_NOVELTY_ADAPTER_ID`, `NOVELTY_MAX_PRIORART_OVERLAP`, `zeitgeistNoveltyCheck` | `zeitgeist/novelty.ts` | consts / const |
| `ZEITGEIST_TIMING_ADAPTER_ID`, `TIMING_MIN_SIGNAL_OVERLAP`, `zeitgeistTimingCheck` | `zeitgeist/timing.ts` | consts / const |

**Total distinct exported symbols:** approximately 70 across 14 source files.

---

## Reachability classification

### Methodology

1. Checked the top-level `apps/api/src/index.ts` package barrel — contains only a placeholder
   constant `DOPPL_API_PACKAGE`; no verifier or check-runner symbols are re-exported.
2. Checked the three sub-barrels (`runtime/index.ts`, `event-store/index.ts`,
   `model-gateway/index.ts`) — none re-export any verifier or check-runner symbol.
3. Searched all production source files under `apps/api/src` (excluding `*.test.*` / `*.spec.*`)
   for any `import … from … verifier` or `import … from … check-runner` statement. Zero
   production-side import statements found.
4. Confirmed the full call-graph within the two areas: intra-area internal wiring is present and
   correct (`run-council` → `runCriticCall` → `assembleIsolatedRequest`; `runCheck` →
   `CHECK_RUNNER_IMPLS`; `liveRerun` → `runCheck`; `runJudge` → `loadJudgeRubric` +
   `assembleIsolatedRequest` + `serializeCandidate`). The subgraph is self-consistent but has
   no edge that exits the area into a production caller.
5. Checked for any HTTP route file, cron registration, or script entry-point referencing the
   area — none exist yet (the `routes/` directory is a future Phase 6 deliverable).

**Result:** All ~70 exported symbols in the verifier and check-runners area are referenced
**exclusively from test files** (`apps/api/test/unit/verifier/**`, `apps/api/test/unit/check-runners/**`,
`apps/api/test/integration/verifier/**`, `apps/api/test/integration/check-runners/**`).
No production-path caller exists at this phase boundary.

---

## Intentional-deferral register

Per audit instructions, the following symbols are **intentionally-deferred-wiring** — they
are tested end-to-end and slated for a named future P3 caller. They are **not** genuine gaps.

| Symbol | Task | Future caller | Deferral evidence |
|---|---|---|---|
| `selectCriticMandates` (rotation.ts) | P4.7 | P3 generation `verifying` phase — the generation loop's `verifying` step selects the per-generation critic mandate set | `IMPLEMENTATION_PLAN.md` P4.7 + §3 `GenerationStatus.verifying` state; lesson §37 (closed-form re-derivation, re-derived on replay) |
| `runCouncil` (run-council.ts) | P4.6 | P3 generation `verifying` phase | `IMPLEMENTATION_PLAN.md` P4.6; `transfer/prior-art.ts` comment "the CALLER (the P3 …)"; `ARCHITECTURE.md` §7 verifier→generation loop seam |
| `runJudge` (judge-call.ts) | P4.8 | P3 generation loop terminal step (judge acceptance outside breeding loop) | `IMPLEMENTATION_PLAN.md` P4.8 + P5.5 `JudgeResult` consumer; `ARCHITECTURE.md` §7 §2.5 verifier→selection seam |
| `runCheck` + `CHECK_RUNNER_REGISTRY` + `CHECK_RUNNER_IMPLS` | P4.5 | P3 generation `verifying` phase (check dispatch) + P4.11 live-rerun demo path | `IMPLEMENTATION_PLAN.md` P4.5 + P4.11 |
| `liveRerun` (live-rerun.ts) | P4.11 | Demo operator path (replay-backed fallback affordance) | `IMPLEMENTATION_PLAN.md` P4.11; REQ-E-003 |
| All check adapter consts + runner fns (transfer + zeitgeist, 10 files) | P4.9, P4.10 | P3 `verifying` phase via `runCheck` → `CHECK_RUNNER_IMPLS` map | `IMPLEMENTATION_PLAN.md` P4.9, P4.10 |
| `assembleIsolatedRequest` + `ISOLATION_DATA_FRAMING` | P4.4 | Called internally by `runCriticCall` and `runJudge` (already wired intra-area); externally by P3 if it ever calls judge/critic directly | `IMPLEMENTATION_PLAN.md` P4.4 |
| `loadJudgeRubric` + `DEFAULT_JUDGE_RUBRIC` | P4.3, P4.8 | Called internally by `runJudge`; P3 boot path must call `loadJudgeRubric` before scoring | `IMPLEMENTATION_PLAN.md` P4.8 Carry-forward (held-out judge LOAD path validation) |
| `serializeCandidate` | P4.6, P4.8 | Called internally by `runCriticCall` and `runJudge` | Intra-area wiring confirmed |
| All `shared.ts` utilities (parse, normalize, tokenOverlap, decided, etc.) | P4.9, P4.10 | Called internally by all check-adapter fns; transitively P3 via `runCheck` | Intra-area wiring confirmed |

---

## Genuine gaps (new or unverified)

**None found.**

Every exported symbol in the area is either:
- (a) internally wired within the verifier/check-runners sub-graph (e.g. `shared.ts` utilities
  used by adapter runners), and/or
- (b) listed in the intentional-deferral register above with a named future P3/demo caller, and
- (c) covered by a dedicated test file (`test/unit/verifier/…`, `test/unit/check-runners/…`,
  `test/integration/verifier/…`, `test/integration/check-runners/…`).

No symbol is exported, untested, and lacking a named future caller.

---

## Summary for orchestrator

- **~70 exports audited** across `apps/api/src/verifier/**` (6 files) and
  `apps/api/src/check-runners/**` (14 files).
- **REACHABLE (production path):** 0 — the runtime generation loop (`verifying` phase) that
  calls into this area is a **Phase 3 kernel deliverable** not yet built.
- **INTENTIONALLY DEFERRED:** ~70 — all exports are slated for the P3 generation
  `verifying`-phase caller (primary) or the P4.11 demo live-rerun affordance (secondary).
  Named callers: P3 generation loop + P5 selection (`JudgeResult` consumer).
- **GENUINE UNREACHABLE GAPS:** 0

### Phase-exit gate: CLEAR

All Phase 4 verifier/check-runner symbols are tested end-to-end and explicitly deferred to
the P3 generation loop's `verifying` phase — the design intent documented in
`IMPLEMENTATION_PLAN.md` §P4.6/P4.7/P4.8/P4.9/P4.10/P4.11. No exported symbol is
orphaned (untested and lacking a named future caller). The gate is CLEAR.

**Wiring tasks recommended:** 0 for this phase boundary. The P3 wiring tasks
(generation-loop `verifying` phase → `runCouncil`, `runCheck`, `runJudge`) belong to
Phase 3 (`IMPLEMENTATION_PLAN.md` P3.9–P3.13 generation loop) and are tracked there.
