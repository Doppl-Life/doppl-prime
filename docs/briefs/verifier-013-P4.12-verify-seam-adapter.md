# /tdd brief — unified_verify_seam_adapter

## Feature
Build `createVerifySeam(deps) → VerifySeam` in `apps/api/src/verifier/verify-seam.ts` — the unified
verifier adapter that matches the kernel generation loop's injected `verify` port EXACTLY and, per
candidate handed in as DATA, drives the rotating critic council, the allowlisted check-runners, and the
held-out judge by **composing** the already-shipped P4.6/P4.7/P4.8/P4.5 modules behind the port. It emits
the verifier's events (`critic.reviewed`, `check.completed`, `judge.reviewed`) **only** through the
per-generation `ctx.append` it is handed; it authors no kernel-owned events and edits no contract.

## Use case + traceability
- **Task ID:** P4.12
- **Architecture sections it implements:** `ARCHITECTURE.md §7` (verifier council + critic rotation +
  allowlisted checks + held-out judge), `§5` (the runtime kernel generation loop's injected verify seam —
  the loop is pure orchestration over the seam ports), `§2.5` (the verifier→selection subsystem seam:
  `judge.reviewed`←`JudgeResult` is the cross-track acceptance home selection joins by candidateId), `§4`
  (the persisted event model + operation-start markers + replay reconstructs from persisted outcomes).
- **Widens phase scope because** the verifier verify-seam adapter is the composition point where the
  verifier subsystem (§7) plugs into the kernel generation loop's verify port (§5) and produces the
  §2.5 verifier→selection seam record — so it legitimately cites §5/§2.5/§4 beyond Phase 4's `§7` anchor.
  No kernel/selection/contract file is touched; the port TYPE is matched, never edited.
- **Related context:**
  - **Human-ratified cross-track reopen (2026-06-22):** the selection track has nothing real to inject for
    the loop's `verify` port (it stubs it). Verifier territory → verifier ships the adapter. The lead runs
    the additive `track/verifier`→cody merge + the cross-track handshake; the implementer does NOT merge or
    signal cross-track.
  - **The port (kernel-owned, frozen — MATCH, do not edit):** `apps/api/src/runtime/loop/generationLoop.ts`
    — `export type VerifySeam = (candidates: readonly CandidateIdea[], ctx: SeamContext) => Promise<void>`,
    `SeamContext = { runId: string; generationId: string; append: EventStore['append'] }`. The loop appends
    `generation.verifying` then calls `seams.verify(candidates, { runId, generationId, append: eventStore.append })`.
    **If the port type does not fit, STOP and escalate — that is a cross-track Finding for the human, never a port edit.**
  - **Modules to COMPOSE (do NOT rebuild):**
    - `verifier/council/run-council.ts` — `runCouncil({ gateway: ModelGateway, store: EventStore, candidate, mandates: readonly CriticMandate[], runContext: { runId, generationId, candidateId } }) → CriticReview[]`.
    - `verifier/council/rotation.ts` — `selectCriticMandates({ rngSeed: number, generationIndex: number, activeCount? }) → CriticMandate[]` (pure, replay-faithful K-of-N over the closed `CriticMandate` universe).
    - `verifier/judge/judge-call.ts` — `runJudge({ gateway, store, candidate, runContext: { runId, generationId, candidateId }, rubricSource? }) → JudgeResult | null`; emits `judge.reviewed`←`JudgeResult` keyed by candidateId; defaults `rubricSource` to the immutable `DEFAULT_JUDGE_RUBRIC`.
    - `check-runners/run-check.ts` — `runCheck({ store, registry: CheckRunnerRegistry, request: { adapterId, checkType, resultId, candidate: string, retrievalResults? }, runContext: { runId, generationId?, candidateId } }) → CheckResult`; the frozen allowlist gate.
    - `check-runners/registry.ts` — `CHECK_RUNNER_REGISTRY` (descriptors, each with an optional `subtype`) + `CHECK_RUNNER_IMPLS`.
  - **Key safety rules inherited from the composed modules (the seam adds NO new safety logic):** #5 candidate text reaches critics/judge only as sentinel-delimited DATA (via the modules' isolation seam); #3 checks run only through the frozen allowlist gate; #6 the held-out judge/rubric/policy is immutable to agents (judge loads `DEFAULT_JUDGE_RUBRIC` via `loadJudgeRubric`); #8 `*.started` markers + failed attempts debit NO energy (the seam debits none); #7/#9 provider calls only via the `ModelGateway` port, replay re-reads persisted outcomes and re-calls no providers.
  - **`ModelGateway` is the `.call` port** (`model-gateway/port.ts`), distinct from the loop's own `GenerationGateway.generate` (population). The seam's council + judge use `.call`.

## Acceptance criteria (what "done" means)
- [ ] `createVerifySeam(deps)` returns a value structurally assignable to the kernel's `VerifySeam` type — `(candidates, ctx) => Promise<void>` — with `deps = { gateway: ModelGateway, eventStore: EventStore, registry: CheckRunnerRegistry, config: AppConfig, rubricSource?, activeCount? }`.
- [ ] For each candidate in `candidates`, the seam invokes the council, the subtype-matched allowlisted checks, and the held-out judge exactly once each — producing the full marker→terminal pairs: per active mandate `critic.review_started`→`critic.reviewed`; per check `check.started`→`check.completed`; one `judge.review_started`→`judge.reviewed`.
- [ ] The persisted `judge.reviewed` payload is a validated `JudgeResult` carrying `candidateId === candidate.id` (selection's fitness join reads `components.judge_acceptance` off it BY candidateId — load-bearing).
- [ ] Mandates are selected ONCE per generation (not per candidate) via `selectCriticMandates({ rngSeed: readRngSeed(config.runConfig), generationIndex })`, and the same set is passed to `runCouncil` for every candidate that generation.
- [ ] `generationIndex` is derived from the authoritative persisted `generation.started{ generationId, index }` event (read via `deps.eventStore.readByRun(runId)`, matched on `ctx.generationId`) — NOT parsed from the generationId string.
- [ ] Every event the seam emits goes through `ctx.append` (the injected per-generation appender) — NOT through `deps.eventStore.append` or any deps-closure write. (Pinned by a spy/fake `ctx.append` capturing all writes; `deps.eventStore.append` is never called.)
- [ ] Subtype check selection: the seam runs the registry adapters whose descriptor `subtype` **strictly equals** `candidate.subtype` (TWEAK at Step-2.5 — subtype-less descriptors do NOT auto-apply, so the P4.5 `prepared.*` placeholders never fire into the authoritative log, which selection reads for fitness; a subtype-agnostic real check, if ever needed, is a deliberate future slice). Grounding adapters with no threaded `retrievalResults` record `check.completed{status:skipped, skipReason:'retrieval_unavailable'}` (never re-fetch — retrieval-FETCH is deferred + flagged).
- [ ] The seam debits NO energy and appends no kernel-owned lifecycle events (it authors only `critic.*`/`check.*`/`judge.*` — never `generation.*`/`candidate.created`/`energy.spent`/`agenome.*`).
- [ ] All unit tests in `apps/api/test/unit/verifier/verify-seam.test.ts` pass.
- [ ] Integration test in `apps/api/test/integration/verifier/verify-seam.test.ts` passes (real PG; drives `runGenerationLoop` with the REAL `createVerifySeam` injected).
- [ ] `/preflight` clean (incl. `format:check` — LESSONS §50/§61).

## Wiring / entry point (Step 7.5)
The seam's PRODUCTION composition (injecting `createVerifySeam(...)` as `seams.verify` into `runGenerationLoop`)
is **selection's boot composition root — cross-track, lands in selection P5 (the closing handshake after the
`track/verifier`→cody merge).** In-track, the slice's reachability is proven by the **integration test**, which
composes `createVerifySeam` and injects it into the REAL `runGenerationLoop`, asserting the verifier events
land through the real append path. So: `none (production wiring) — wiring lands in selection P5`; in-track
entry point = the integration test driving `runGenerationLoop`. Name this honestly at Step 7.5.

## Files expected to touch
**New:**
- `apps/api/src/verifier/verify-seam.ts` — `createVerifySeam(deps) → VerifySeam` + its `VerifySeamDeps` interface.
- `apps/api/test/unit/verifier/verify-seam.test.ts` — composition unit tests (fake `ctx.append`, fake gateway, real registry).
- `apps/api/test/integration/verifier/verify-seam.test.ts` — drives `runGenerationLoop` with the real seam (real PG).

**Modified:**
- (none expected) — if a barrel re-export (`apps/api/src/verifier/index.ts`) is wanted for selection to import the factory cleanly, flag at Step 2.5; it is additive and verifier-territory. Do NOT modify any kernel/selection file.

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)

### `apps/api/test/unit/verifier/verify-seam.test.ts`
1. **`test_seam_assignable_to_verify_port`** — a value from `createVerifySeam(deps)` is assignable to `VerifySeam` and runs `(candidates, ctx) => Promise<void>`.
   - Asserts: type-level + a smoke call returns `void` (Promise).
   - Why: §5 — the seam must match the kernel port exactly (the whole point of the slice).
2. **`test_three_subsystems_invoked_per_candidate`** — for N candidates, the captured `ctx.append` writes contain, per candidate: ≥1 `critic.review_started`+`critic.reviewed`, ≥1 `check.started`+`check.completed`, exactly one `judge.review_started`+`judge.reviewed`.
   - Asserts: event-type counts per candidateId.
   - Why: §7 — council + checks + judge each run per candidate.
3. **`test_judge_reviewed_keyed_by_candidate_id`** — every `judge.reviewed` write carries `candidateId === candidate.id` and a payload that `JudgeResult.safeParse`s.
   - Asserts: candidateId correlation + frozen-shape parse.
   - Why: §2.5 / §7 — selection joins acceptance BY candidateId (load-bearing).
4. **`test_mandates_selected_once_per_generation`** — across all candidates in one generation, the set of `critic.reviewed` mandates equals `selectCriticMandates({ rngSeed, generationIndex })` for that `(rngSeed, generationIndex)` — and the selector is invoked once, not per candidate.
   - Asserts: mandate set == the deterministic rotation set; identical across candidates.
   - Why: §7 critic rotation + LESSONS §37 (pure closed-form rotation).
5. **`test_generation_index_read_from_persisted_started_event`** — with `generation.started{ generationId, index: 2 }` in the store, the seam selects mandates for `generationIndex===2` (NOT 0, and NOT parsed from the id string). Pin: a generationId whose trailing integer DIFFERS from the persisted `index` proves the log (not the string) is the source.
   - Asserts: rotation set matches `index:2`; differs from `index:0`.
   - Why: Option A — authoritative + replay-safe; IDs-are-opaque discipline.
6. **`test_emits_only_via_ctx_append`** — all writes are captured by the injected `ctx.append` spy; `deps.eventStore.append` is a throwing/never-expected spy and is NOT called.
   - Asserts: `deps.eventStore.append` call-count === 0; `ctx.append` carries every emitted event.
   - Why: the seam contract — emit via the injected appender, never a deps-closure write.
7. **`test_no_kernel_owned_or_energy_events_authored`** — none of the seam's writes are `generation.*`, `candidate.created`, `energy.spent`, `agenome.*`, or any lifecycle/terminal type.
   - Asserts: emitted types ⊆ `{critic.review_started, critic.reviewed, check.started, check.completed, judge.review_started, judge.reviewed, output_schema_rejected}`.
   - Why: §5 ownership (loop owns lifecycle; seam owns only its evidence events) + rule #8 (no energy).
8. **`test_subtype_checks_selected_and_grounding_skips`** — for a `cross_domain_transfer` candidate with no `retrievalResults`, the 4 transfer deterministic checks run (passed/failed) and the grounding adapter (`transfer.prior_art`) records `check.completed{skipped, retrieval_unavailable}`; NEITHER zeitgeist adapters NOR the subtype-less `prepared.*` placeholders run.
   - Asserts: per-adapter status; strict subtype filter; placeholders excluded.
   - Why: rule #3 allowlist + LESSONS §44 caller-fetches split + strict-subtype TWEAK (no placeholder pollution of the authoritative log).
9. **`test_subtype_filter_runs_zeitgeist_for_zeitgeist_candidate`** — converse: a `zeitgeist_synthesis` candidate runs the zeitgeist adapters and NEITHER transfer adapters NOR the `prepared.*` placeholders.
   - Asserts: strict subtype filter is candidate-driven both ways; placeholders excluded.
   - Why: rule #3 allowlist + strict-subtype TWEAK.

### `apps/api/test/integration/verifier/verify-seam.test.ts` (real PG — mirror `run-council.test.ts` harness)
9. **`test_real_loop_with_verify_seam_injected_persists_verifier_events`** — compose `createVerifySeam({ gateway: createFakeGateway(), eventStore: realStore, registry: CHECK_RUNNER_REGISTRY, config })` and inject it as `seams.verify` into `runGenerationLoop` (fake `GenerationGateway` producing valid candidates for population; no-op `score`/`reproduce` seams; small caps — 1 generation, small population). After the loop, `readByRun(runId)` contains, for each created candidate: `critic.reviewed` (per active mandate), `check.completed`, and a `judge.reviewed` whose payload `JudgeResult.safeParse`s with `candidateId` matching the candidate.
   - Asserts: events present + keyed through the REAL P1.3 append path; markers paired in sequence order.
   - Why: the load-bearing proof — the seam works against the real loop + real append path (no mocks on the truth log).
10. **`test_replay_no_provider_recall_on_verifier_events`** *(if cheaply expressible — else flag as a follow-up)* — re-reading the persisted log reconstructs the verifier events with zero additional provider calls (the fake gateway call-count does not increase on a read/replay pass).
   - Asserts: provider call-count stable across a re-read.
   - Why: rule #7 replay-safety.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** none — consumes the frozen `VerifySeam` port + `CriticReview`/`CheckResult`/`JudgeResult`/`CandidateIdea` (all P0/P4 frozen). No new/extended Appendix-A model.
- **Orchestrator doc rows to write hot (Step 9 routing):** none expected (no contract change). If a `verifier/index.ts` barrel is added, that is a code change, not a cross-doc row.
- **§2.5-seam (shared-contract) model touched?** The seam PRODUCES the §2.5 `judge.reviewed`←`JudgeResult` record but does not change its shape — so no new schema-snapshot test is required (the producer-conformance is the `JudgeResult.safeParse` in tests 3 + 9). If the implementer finds itself wanting to change the port TYPE or any frozen model → STOP + Step-9 Finding (cross-track, human).

## Things to flag at Step 2.5
1. **`generationIndex` source — read the log (Option A) vs parse `ctx.generationId` (Option B).** Option A reads the authoritative `generation.started{index}` via `deps.eventStore.readByRun`; Option B parses the trailing integer of `${runId}-gen${g}`. **Default vote (lead-confirmed): Option A** — authoritative + replay-safe + no coupling to the loop's private id-string format (IDs are opaque). Cost: the seam's deps include `eventStore` for READ-only use (`readByRun`); emission still flows exclusively through `ctx.append`.
2. **The emit shim handed to the sub-runners.** `runCouncil`/`runJudge`/`runCheck` take a full `EventStore` but call only `.append`. Default vote: build a per-generation shim `{ append: ctx.append, readByRun: deps.eventStore.readByRun }` and pass it as their `store` — so their writes route through `ctx.append` (the contract) while reads (none today) delegate harmlessly. Purely additive — do NOT refactor the sub-runners' signatures (that would ripple to their existing tests). If you prefer narrowing their `store` param to `Pick<EventStore,'append'>`, flag it — but the shim keeps the slice additive.
3. **`rngSeed` + `activeCount` source.** Default vote: `rngSeed = readRngSeed(deps.config.runConfig)` (run-level constant, the exact source the loop uses at line 308); `activeCount` defaults to the rotation module's `DEFAULT_ACTIVE_CRITIC_COUNT` unless `deps.activeCount` is supplied. Confirm `verifier → runtime` import (`readRngSeed`) is a legal layer edge (it is — verifier sits above runtime; P4.7 already imports `createSeededRng` from the runtime barrel).
4. **Retrieval-grounded checks — skip vs fetch.** Default vote: the seam threads NO `retrievalResults`, so grounding adapters record `skipped{retrieval_unavailable}` (honest MVP; retrieval-FETCH + persistence is a separate caller concern — LESSONS §44). Flag a `Future TODO — phase` for the retrieval-fetch wiring so the shipped check set is honestly N-of-M. Do NOT add a gateway `retrieval` call to this slice.
5. **Per-candidate ordering.** Default vote: council → checks → judge per candidate (deterministic; event order is not load-bearing since the events are independent, but pick one order and keep it). Confirm.

## Dependencies + sequencing
- **Depends on:** P4.6 (`runCouncil`), P4.7 (`selectCriticMandates`), P4.8 (`runJudge`), P4.5 (`runCheck` + registry), P3.10 (the generation loop's verify port — present at the cody tip e99affe). All landed.
- **Blocks:** selection P5 (its boot composition root injects `createVerifySeam(...)` as `seams.verify` and runs `/phase-exit P5`) — cross-track, handled by the lead's closing handshake after the merge.

## Estimated commit count
**1.** One bundled additive slice — the adapter + its unit + integration tests are one logical unit, same code area (`verifier/`), dep-compatible, and the integration test is the wiring proof for the same unit (STANDING bundling directive). It is invariant-TOUCHING (rule #5/#6/#3 emission path) but composes already-safety-checked modules and introduces NO new safety logic, so it is not a safety-pin-isolation case — bundle is correct. `security-reviewer` runs at Step 8 (policy = invariant).

## Lessons-logged candidates anticipated
- **Convention candidate** — "a kernel↔subsystem seam adapter COMPOSES the subsystem's existing runners behind the injected port via a per-generation emit shim (`{append: ctx.append, readByRun: deps.read}`) — writes route through the injected appender, never a deps-closure write; the per-generation index comes from the authoritative `generation.started{index}`, never the id string." (extends LESSONS §64 loop-is-pure-orchestration + §20 seam-over-frozen-contracts.)
- **Future TODO — phase** — retrieval-FETCH + persistence for the grounding checks (so the shipped check set is N-of-N, not N-of-M) — caller-fetches split per LESSONS §44; lands with the selection/demo retrieval wiring.
- **Architecture-doc note candidate** — §7/§5: the verifier verify-seam is the composition point plugged into the loop's verify port; selection injects it at boot (the §2.5 seam realized in code).

## How to invoke
1. **Read this brief end-to-end** — especially "Things to flag at Step 2.5" (Option A is lead-confirmed; the shim + seed-source are pre-voted).
2. **Run `/tdd unified_verify_seam_adapter`** in the implementer session.
3. **Step 0 (Restate)** — confirm against the Feature line.
4. **Step 1 (Identify files)** — confirm against Files expected to touch.
5. **Step 2.5** — send the test-design write-up (asserted invariant per test + the per-acceptance-bullet coverage map) + your answers to the 5 design questions. Wait for `APPROVED.`/`TWEAK:`/`ADD:`.
6. **Step 9** — categorized flags + ship-ask. STOP + Finding if the port type or any frozen model needs a change.
