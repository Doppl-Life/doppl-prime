# /tdd brief — check_runner_allowlist_registry

## Feature
The check-runner **allowlist registry + run harness**: a static, boot-fixed registry of non-executing
`CheckRunnerAdapter` descriptors (keyed by adapter id) and a `runCheck` harness that resolves an adapter
(or a `skipped` result for an unregistered/execution-requiring id), emits the `check.started`
operation-start marker, runs the registered non-executing adapter deterministically, and emits exactly
one `check.completed` event whose payload is the validated `CheckResult`. **Key safety rule #3 (no
arbitrary code execution) — solo invariant slice.**

## Use case + traceability
- **Task ID:** P4.5
- **Architecture sections it implements:** `ARCHITECTURE.md §7` (Check runners — resolved mechanism:
  static allowlist registry, non-executing adapters, unregistered/execution-requiring → `skipped`+reason),
  `§4` (the `check.started`/`check.completed` event types + operation-start marker semantics; no energy
  debit), `§14` (allowlist adapters, no arbitrary code).
- **Related context:**
  - Key safety rule #3 (checks run only through an allowlisted registry of non-executing adapters; an
    unregistered or execution-requiring check returns `check.completed{status:skipped, reason}`).
  - Key safety rule #8 (operation-start markers do NOT debit energy — they fall back to the generic
    payload, never narrow to `EnergyEvent`).
  - **Frozen contract already ships the gate** (P0.7, `packages/contracts/src/checks/check-runner-adapter.ts`):
    `CheckRunnerAdapter` (non-executing BY SHAPE — no `exec`/`command`/`handler`/`fn`/`script`/`code`
    field representable), `CheckRunnerRegistry = z.record(id, CheckRunnerAdapter)`, and
    `resolveCheckAdapter(registry, req)` — a pure own-property (`hasOwnProperty.call`) gate that fails
    safe to a `skipped` `CheckResult{reason:'unregistered_adapter'}` (defeats `__proto__`/`constructor`
    bypass; never reflects the untrusted id into the reason). **ADOPT these — the registry is the gate,
    don't reimplement** (lesson 11).
  - **Event-store append path is live** (P1.3): `createEventStore({db, secretValues}) → {append(AppendInput),
    readByRun(runId)}` where `AppendInput = RunEventEnvelope.omit({sequence, occurredAt})`. The integration
    pattern (testcontainers, real PG) is `apps/api/test/integration/event-store/append.test.ts` — mirror
    it (`inject('pgConnectionUri')`, `createEventStore`, `append`, `readByRun`).
  - `check.completed` narrows to `CheckResult` via the frozen `HIGH_TRAFFIC_PAYLOAD_MAP` (P0.10);
    `check.started` is an operation-start marker → generic payload, actor `check_runner`, no energy.
  - Contract-test surface (P0.14): `validCheckResult`, `validCheckRunnerAdapter` from `@doppl/contracts`.

## Acceptance criteria (what "done" means)
- [ ] Checks run ONLY through a static allowlist registry keyed by adapter id; an unregistered id yields a `check.completed{status:'skipped', reason}` (the frozen `resolveCheckAdapter` skip), never an error-free pass and never code execution.
- [ ] An adapter that would require executing arbitrary/candidate-supplied code is recorded `skipped` with a reason (a registered descriptor with NO registered non-executing impl → `skipped`; there is no code-carrying field in the descriptor and no exec path in the harness).
- [ ] The registry is **closed/fixed at boot** — the module exposes NO runtime API to add/register an adapter (the registry object is frozen; no mutating export).
- [ ] A registered non-executing adapter runs **deterministically** (same input → same output) and produces a **schema-valid** `CheckResult` (`CheckResult.safeParse` passes).
- [ ] Each `runCheck` invocation emits the `check.started` operation-start marker (actor `check_runner`, generic payload) — and that marker debits **NO energy** (no `EnergyEvent`/`energy.spent` emitted).
- [ ] Every invocation (pass/fail/skip) emits exactly one `check.completed` event whose payload is the **validated** `CheckResult`; the two events land in order (`check.started` then `check.completed`) via the real append path.
- [ ] All unit tests in `apps/api/test/unit/check-runners/*.test.ts` pass; the integration test in `apps/api/test/integration/check-runners/run-check.test.ts` passes against the real Postgres event store.
- [ ] `/preflight` clean.

## Wiring / entry point (Step 7.5)
**none (full runtime invocation) — wiring lands in P4.9/P4.10 (subtype adapters register descriptor+impl
pairs) and the P3 generation `verifying` phase (the real caller).** The harness IS exercised end-to-end
by the integration test against the real append path; the registry/harness modules are the production
surface. `runCheck` takes the `EventStore` port (`{append, readByRun}`) + an injected `runContext`
(`{runId, generationId?, candidateId}`) — no P3 runtime dependency. Confirm at Step 7.5 that emission
goes through `store.append` (never a raw `run_events` write — forbidden pattern #4).

## Files expected to touch
**New:**
- `apps/api/src/check-runners/registry.ts` — the closed boot-fixed allowlist `CheckRunnerRegistry` + the parallel closed non-executing impl-map (see Q1); re-exports the frozen `resolveCheckAdapter`.
- `apps/api/src/check-runners/run-check.ts` — `runCheck({store, registry, request, runContext})`: resolve → emit `check.started` → run-or-skip → emit `check.completed` (validated `CheckResult`).
- `apps/api/test/unit/check-runners/registry.test.ts`, `apps/api/test/unit/check-runners/run-check.test.ts` — unit (resolution/skip/closed/determinism, fake `EventStore`).
- `apps/api/test/integration/check-runners/run-check.test.ts` — integration (real PG: events land in order, payload = validated `CheckResult`, no energy event).

**Modified:**
- `apps/api/vitest.integration.config.ts` — only if the integration glob doesn't already pick up `test/integration/check-runners/**` (flag at Step 2.5 if a config touch is needed).

> **Tracker path drift (FYI):** P4.5 cites `apps/api/check-runners/...`; correct path is `apps/api/src/check-runners/...`. If implementation needs files beyond this list, **flag at Step 2.5**.

## RED test outline

**Unit (`test/unit/check-runners/registry.test.ts` + `run-check.test.ts`)** — fake `EventStore`:
1. **`test_unregistered_adapter_resolves_to_skip`** — Asserts: an unknown adapter id → `skipped` `CheckResult`, `reason:'unregistered_adapter'`, no impl invoked. Why: §7 / rule #3 fail-safe (positive guard first, lesson 10).
2. **`test_registry_is_closed_no_runtime_register`** — Asserts: the registry module exposes no mutating/register fn; the registry object is frozen (`Object.isFrozen`). Why: §7 "closed/fixed at boot".
3. **`test_registered_adapter_runs_deterministically`** — Asserts: a registered non-executing adapter, run twice on the same input, yields identical schema-valid `CheckResult`s. Why: §7 acceptance #4.
4. **`test_execution_requiring_adapter_skipped_with_reason`** — Asserts: a registered descriptor with NO non-executing impl → `skipped` + a fixed reason, no code run. Why: §7/§14 rule #3 (no arbitrary code path).
5. **`test_proto_pollution_id_falls_through_to_skip`** — Asserts: adapter id `__proto__`/`constructor` → `skipped` (own-property lookup inherited from frozen `resolveCheckAdapter`). Why: rule #3 allowlist-bypass defense (lesson 11).

**Integration (`test/integration/check-runners/run-check.test.ts`)** — real PG, mirror `append.test.ts`:
6. **`test_started_then_completed_emitted_in_order`** — Asserts: one `runCheck` → exactly two events for the run, `check.started` (actor `check_runner`, generic payload) at sequence N then `check.completed` at N+1. Why: §4 operation-start marker pairing.
7. **`test_completed_payload_is_validated_checkresult`** — Asserts: the persisted `check.completed` payload `CheckResult.safeParse`s and equals the produced result (producer-agreement, lesson 20; payload-map `check.completed`→`CheckResult`). Why: §7/§4 acceptance #6.
8. **`test_skip_path_still_emits_completed_with_skipped_result`** — Asserts: an unregistered/execution-required invocation still emits `check.started` + `check.completed` carrying the `skipped` `CheckResult` (skip recorded, never silent). Why: §7 acceptance #1/#6.
9. **`test_marker_debits_no_energy`** — Asserts: only `check.started` + `check.completed` land for the invocation — no `energy.spent`/`EnergyEvent`. Why: rule #8 (markers never narrow to `EnergyEvent`).

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** **none.** Consumes frozen `CheckResult`/`CheckRunnerAdapter`/`CheckRunnerRegistry`/`resolveCheckAdapter` (P0.7) + the frozen `check.started`/`check.completed` event types + payload map (P0.1-amend/P0.10). No Appendix-A change.
- **§2.5-seam (shared-contract) model touched?** No *change* → no schema-snapshot test. The `CheckResult.safeParse` on the persisted `check.completed` payload (test 7) IS the producer-agreement pin (lesson 20).
- **Orchestrator doc rows to write hot (Step 9 routing):** likely **none** (no contract change). Possible **Architecture-doc note** (§7) naming `apps/api/src/check-runners/{registry,run-check}.ts` as the concrete allowlist mechanism — flag at Step 9.

## Things to flag at Step 2.5
1. **Impl-map design — how does an adapter id map to its non-executing check function (rule-#3-compliant)?** The frozen `CheckRunnerAdapter` descriptor has NO code field (non-executing by shape) — so the pure check function can't live on the descriptor. My default vote: **a SEPARATE closed `Record<adapterId, CheckRunner>` impl-map** in the check-runners module (pure functions), parallel to the descriptor registry; `runCheck` resolves the descriptor (the gate) then looks up the pure impl by the same id. A registered descriptor with no impl → `skipped`. (P4.9/P4.10 register descriptor+impl pairs.) Alternative (impl injected into `runCheck` as a param) is also viable — but a module-closed map better matches "fixed at boot".
2. **Skip-reason taxonomy.** My default vote: reuse the frozen `'unregistered_adapter'` (from `resolveCheckAdapter`) for unknown ids; add ONE fixed constant (e.g. `'execution_required'`) for a registered descriptor with no non-executing impl. Both feed a schema-valid `skipped` `CheckResult`; **never reflect the untrusted id into the reason** (IDs-opaque; the frozen gate already uses a fixed reason).
3. **`check.started` payload shape.** It's a generic-payload marker (no narrow). My default vote: a **minimal correlation payload** `{adapterId, checkType, candidateId}`, actor `check_runner`, no energy. (`candidateId`/`adapterId` opaque.)
4. **Who builds the envelopes?** My default vote: **`runCheck` constructs both `AppendInput` envelopes** (`check.started`, `check.completed`) from the injected `runContext` + resolved result and calls `store.append` — it depends only on the `EventStore` port, never a raw `run_events` write (forbidden #4). `runContext` is injected (no P3 dependency).
5. **The one registered adapter that proves the deterministic path (test 3).** My default vote: register **a single prepared/allowlisted deterministic toy adapter** in P4.5 (clearly a placeholder the subtype slices extend) so acceptance #4 has a real registered impl to exercise; the real transfer/zeitgeist adapters land P4.9/P4.10.

## Dependencies + sequencing
- **Depends on:** P0.7 `CheckResult`/`CheckRunnerAdapter`/`resolveCheckAdapter` (frozen ✅); P4.2 (adopt — folds in here); the P1.3 append path + P1.4 migrations/testcontainers harness (merged from kernel ✅); frozen `check.started`/`check.completed` types + payload map (✅). **No P3 dependency** — `runContext` is injected.
- **Blocks:** P4.9 (transfer adapters) + P4.10 (zeitgeist adapters) — both register descriptor+impl pairs into this registry and emit through this harness; the P3 `verifying` phase (the real caller).

## Estimated commit count
**1.** Safety-invariant pin (key safety rule #3 — allowlist + no arbitrary code execution). **Solo — never
bundled** (root `CLAUDE.md` TDD posture). The registry + run-harness are ONE safety mechanism (not two
features), so they share the slice; the real subtype adapters are separate later slices.

## Lessons-logged candidates anticipated
- **Convention candidate** — "Checks run through a closed descriptor-registry (the allowlist gate) PLUS a parallel closed pure-impl-map (rule #3 non-executing by shape — no code on the descriptor); `runCheck` resolves→`check.started`→run-or-skip→`check.completed`, every invocation emits exactly one validated `CheckResult`, a skip is always recorded with a fixed reason (never the untrusted id)."
- **Architecture-doc note candidate** — §7: name the registry + run-harness modules as the concrete allowlist mechanism.
- **Future TODO (next-brief)** — P4.9/P4.10 register the real transfer/zeitgeist descriptor+impl pairs; grounding adapters persist retrieval outcomes into the originating event so replay never re-calls the web (rule #7).

## How to invoke
1. **Read this brief end-to-end** (session already oriented from P4.4 — no `/session-start` needed).
2. **Run `/tdd check_runner_allowlist_registry`.**
3. **Step 0 (Restate)** — confirm against the Feature line.
4. **Step 1 (Identify files)** — confirm against Files expected to touch (note the path-drift FYI).
5. **Step 2.5 (test review pause)** — answer the 5 design questions (or take defaults); ping the orchestrator. Don't go GREEN until signed off.
6. **Step 9 (summarize)** — surface anything beyond the anticipated lessons-logged candidates. **security-reviewer is mandatory (invariant slice).**
