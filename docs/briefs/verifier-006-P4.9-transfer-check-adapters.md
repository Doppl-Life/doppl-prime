# /tdd brief — transfer_check_adapters

## Feature
Bundle B — the **deterministic cross-domain-transfer check adapters**: four non-executing pure
`CheckRunner` adapters (source-domain-validity, target-fit, mapping-quality, allowlisted-executable)
registered into the P4.5 allowlist registry + impl-map, each parsing the candidate as a
`CrossDomainTransferPayload` (data, never executed) and emitting a schema-valid `CheckResult` through the
existing `runCheck` harness. The retrieval-gated **prior-art** adapter is **DEFERRED** (needs retrieval
P2.6/P2.7 + a harness async-extension — see Q1). Feature slice (consumes the rule-#3 allowlist — not a
new safety invariant; the rule-#3 pins live in P4.5).

## Use case + traceability
- **Task ID:** P4.9
- **Architecture sections it implements:** `ARCHITECTURE.md §7` (cross_domain_transfer checks: source-domain-validity
  / target-fit / mapping-quality / prior-art / prepared toy-or-allowlisted-executable; non-executing allowlist;
  retrieval-grounded prior-art with curated-corpus fallback), `§14` (candidate-as-DATA; allowlist, no arbitrary code).
- **Related context:**
  - Key safety rule #3 (checks run ONLY through the static allowlist of non-executing adapters) — **already pinned in P4.5**; this slice ADDS adapters to that registry, it does not re-pin the invariant.
  - **P4.5 harness (landed `89ab697`):** `runCheck({store, registry, request, runContext})` → resolve (frozen `resolveCheckAdapter`) → `check.started` → run-or-skip → one validated `check.completed`. The impl contract is **`type CheckRunner = (input: CheckRunnerInput) => CheckResult`** — **PURE + SYNCHRONOUS, no IO** (rule #3). `CheckRunnerInput = {resultId, candidateId, checkType, candidate: string}`. Adapters are registered as a `CHECK_RUNNER_REGISTRY` descriptor + a parallel `CHECK_RUNNER_IMPLS` entry (both frozen, same id).
  - **The 4 transfer adapters here are deterministic** → they fit the pure-sync `CheckRunner` exactly: parse `candidate` (JSON) → `CrossDomainTransferPayload.safeParse` → a deterministic structural/heuristic check → `CheckResult`. **No harness change.**
  - **Frozen `CrossDomainTransferPayload` (P0.5):** strict `{sourceDomain, sourceTechnique, targetDomain, targetProblem, transferMapping, expectedMechanism, executableCheckIdea?}` — all strings `.min(1)`, the schema already guarantees presence+non-empty, so the adapters check RELATIONAL/heuristic properties (see Q2), not mere presence.
  - **Frozen `CheckResult` (P0.7):** the adapter output (status passed/failed/skipped, skipReason iff skipped, evidenceRefs[] resolve within the Postgres tier).
  - **Lead direction (2026-06-21):** Bundle B; flag the grounding/prior-art sub-adapters stub-now-or-defer (gated on kernel P3 / retrieval P2.6/P2.7). This brief DEFERS prior-art (see Q1) — pre-authorized by the lead, not a new scope cut.

## Acceptance criteria (what "done" means)
- [ ] Four non-executing adapters are registered (descriptor in `CHECK_RUNNER_REGISTRY` + pure impl in `CHECK_RUNNER_IMPLS`, same id, both still frozen): `transfer.source_validity`, `transfer.target_fit`, `transfer.mapping_quality`, `transfer.allowlisted_executable`.
- [ ] Each adapter is a pure `CheckRunner` (same input → same `CheckResult`; no IO, no code execution) that parses `candidate` as a `CrossDomainTransferPayload` (data) and emits a schema-valid `CheckResult`.
- [ ] A `candidate` that does NOT parse as a valid `CrossDomainTransferPayload` yields a `failed` (or `skipped`-with-reason — Q3) `CheckResult`, never a throw and never code execution.
- [ ] **source-validity:** passes iff the parsed transfer crosses domains (`sourceDomain` ≠ `targetDomain`, case/whitespace-normalized) — a same-domain "transfer" fails (Q2 default).
- [ ] **target-fit:** passes iff the `transferMapping` (or `expectedMechanism`) references the target (a deterministic token-overlap with `targetDomain`/`targetProblem` above a fixed threshold) — Q2 default.
- [ ] **mapping-quality:** passes iff `transferMapping` AND `expectedMechanism` are both substantive by a fixed deterministic heuristic (e.g. token count ≥ N each) — Q2 default.
- [ ] **allowlisted-executable:** runs ONLY when `executableCheckIdea` is present AND the problem id is in a fixed prepared-allowlist; otherwise `skipped` with a reason — it never executes candidate-supplied code (deterministic prepared check only; extends the P4.5 toy pattern).
- [ ] Each adapter run end-to-end through `runCheck` emits the `check.started` + one validated `check.completed` (the existing harness — unchanged) — verified by an integration test against real Postgres.
- [ ] **prior-art is DEFERRED** (Q1): not registered/built here; recorded as a flagged follow-up (retrieval P2.6/P2.7 + harness async-extension). No silent omission.
- [ ] All unit tests in `apps/api/test/unit/check-runners/transfer/*.test.ts` pass; the integration test passes; `/preflight` clean.

## Wiring / entry point (Step 7.5)
**none (full runtime invocation) — first caller is the P3 generation `verifying` phase** (runs each registered
transfer check per cross_domain_transfer candidate via `runCheck`). The adapters + their registry entries are
the deliverable; exercised end-to-end via `runCheck` in the integration test (real append path). Confirm at
Step 7.5: each adapter is reachable through `runCheck` (registered id resolves to its impl) and emits only via
`store.append` (inherited from the P4.5 harness — no new persistence path).

## Files expected to touch
**New:**
- `apps/api/src/check-runners/transfer/source-validity.ts` · `target-fit.ts` · `mapping-quality.ts` · `allowlisted-executable.ts` — the 4 pure `CheckRunner` adapters (+ their adapter-id consts).
- `apps/api/test/unit/check-runners/transfer/{source-validity,target-fit,mapping-quality,allowlisted-executable}.test.ts`.
- `apps/api/test/integration/check-runners/transfer/run-transfer-checks.test.ts` — end-to-end through `runCheck` (real PG).

**Modified:**
- `apps/api/src/check-runners/registry.ts` — register the 4 descriptor+impl pairs; **Q4:** retire or keep the P4.5 `PREPARED_TOY`/`EXECUTION_REQUIRING` placeholders.

> **Tracker path drift (FYI):** P4.9 cites `apps/api/check-runners/transfer/...`; correct path is `apps/api/src/check-runners/transfer/...`. The tracker also lists `prior-art.ts (NEW)` — **DEFERRED** here (Q1).

## RED test outline
**Unit (`test/unit/check-runners/transfer/*.test.ts`)** — each adapter is a pure fn; test directly:
1. **`source_validity_passes_cross_domain` / `fails_same_domain`** — Asserts: `sourceDomain≠targetDomain` → passed; equal (normalized) → failed (positive guard first, lesson 10). Why: §7 transfer must cross domains.
2. **`target_fit_passes_when_mapping_references_target` / `fails_when_unrelated`** — Asserts: token-overlap ≥ threshold → passed; none → failed. Why: §7 target-fit.
3. **`mapping_quality_passes_substantive` / `fails_degenerate`** — Asserts: both mapping+mechanism ≥ N tokens → passed; a one-word mapping → failed. Why: §7 mapping-quality.
4. **`allowlisted_executable_runs_for_prepared_skips_otherwise`** — Asserts: `executableCheckIdea` present + prepared-allowlisted problem → runs (passed/failed deterministically); absent or unprepared → skipped+reason; NEVER executes candidate code. Why: §7/rule #3.
5. **`invalid_payload_fails_not_throws`** — Asserts: a `candidate` that isn't a valid `CrossDomainTransferPayload` → failed/skipped (Q3), no throw, no exec. Why: §7/rule #3 (untrusted data).
6. **`adapters_are_pure_deterministic`** — Asserts: same input → identical `CheckResult` (no random/clock). Why: replay-faithful (rule #7-adjacent) + lesson 28.

**Integration (`test/integration/check-runners/transfer/run-transfer-checks.test.ts`)** — real PG via `runCheck`:
7. **`registered_transfer_adapter_runs_through_harness`** — Asserts: `runCheck` for `transfer.source_validity` emits `check.started` + one validated `check.completed` (payload `CheckResult.safeParse`s). Why: §7/§4 (the harness path, lesson 28).
8. **`all_four_transfer_adapters_resolve_and_complete`** — Asserts: each of the 4 ids resolves to its impl (not skipped-unregistered) and completes. Why: §7 (registration correctness).

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** **none.** Consumes frozen `CrossDomainTransferPayload`/`CheckResult` + the P4.5 registry/harness. No Appendix-A change.
- **§2.5-seam model touched?** No frozen-model change → no schema-snapshot. The `CheckResult.safeParse` on the persisted `check.completed` (test 7) is the producer-agreement pin (lesson 20).
- **Orchestrator doc rows to write hot (Step 9):** likely **none**. Possible **Architecture-doc note** (§7) naming the transfer adapter modules + recording **prior-art DEFERRED** (retrieval-gated) so the §7 transfer-check list reflects what shipped. Flag at Step 9.

## Things to flag at Step 2.5
1. **(LOAD-BEARING) prior-art — DEFER (default) vs. stub-now.** prior-art needs the retrieval source (gateway `retrieval` role; §7 live-grounding + curated-corpus fallback) → it's **async + needs the gateway injected**, which the pure-sync `CheckRunner` + `runCheck` harness do NOT support. Stub-now would require (a) extending the rule-#3 harness for async + injected gateway AND (b) building against a retrieval-call shape P2.6/P2.7 haven't pinned. My default: **DEFER prior-art** — build the 4 deterministic adapters now (zero harness change), land prior-art with retrieval + the harness async-extension. (Lead pre-authorized stub-now-or-defer; I'm choosing defer + flagging it.) If you'd rather stub-now, it's a separate larger slice (harness refactor of a safety module) — I'd want that as its own brief, not bundled here.
2. **Deterministic check semantics per adapter.** The payload schema already guarantees field presence, so the checks must test RELATIONAL/heuristic properties. My defaults: source-validity = cross-domain (`sourceDomain≠targetDomain`); target-fit = token-overlap of `transferMapping`/`expectedMechanism` with `targetDomain`/`targetProblem` ≥ a fixed threshold; mapping-quality = both `transferMapping`+`expectedMechanism` ≥ N tokens. These are crude MVP signals (real quality is critics/judge) — pin the exact thresholds as fixed consts. Refine at Step 2.5 if you have a better deterministic signal.
3. **Invalid-payload outcome — `failed` vs `skipped`.** A `candidate` that doesn't parse as a `CrossDomainTransferPayload`. My default: **`failed`** (the check ran and the candidate is malformed for this subtype) — reserve `skipped` for "adapter not applicable" (e.g. allowlisted-executable on a non-prepared problem). Alternative: `skipped{reason:'unparseable_payload'}`. Confirm.
4. **P4.5 placeholders.** `PREPARED_TOY_ADAPTER_ID` / `EXECUTION_REQUIRING_ADAPTER_ID` were placeholders "superseded by P4.9/P4.10". My default: **keep `EXECUTION_REQUIRING`** (it's the skip-path test fixture for the registered-but-no-impl case — still useful) and **retire `PREPARED_TOY`** (superseded by `allowlisted_executable`). Or keep both. Confirm — don't want a dangling unreferenced placeholder.

## Dependencies + sequencing
- **Depends on:** P4.5 registry + `runCheck` harness (`89ab697` ✅); frozen `CrossDomainTransferPayload` (P0.5 ✅) + `CheckResult` (P0.7 ✅); the event store (P1.3 ✅). **No P3 dependency** (runContext injected). prior-art depends on retrieval (P2.6/P2.7, kernel-track — not landed → deferred).
- **Blocks:** the P3 `verifying` phase (runs these per cross_domain_transfer candidate); P4.11 live-rerun (re-runs an allowlisted check).

## Estimated commit count
**1.** A cohesive bundle (4 sibling deterministic adapters + registry wiring — same area, same pattern, shared
test setup). NOT a safety-invariant slice (the rule-#3 allowlist invariant is pinned in P4.5; this ADDS
adapters to it) → bundling the 4 is correct (lead's bundle-where-safe directive). **security-reviewer:
invariant-touching** (confirm the adapters are genuinely non-executing — no eval/Function/exec path; candidate
parsed as data only; allowlisted-executable never runs candidate code).

## Lessons-logged candidates anticipated
- **Convention candidate** — "a subtype check adapter is a pure `CheckRunner` that parses the candidate as its frozen subtype payload (data, never executed), runs a deterministic relational/heuristic check (the schema already guarantees presence, so check relations not presence), and fails-not-throws on an unparseable payload; retrieval-grounded checks are deferred until the retrieval source + an async harness exist (a pure-sync harness can't host them)."
- **Architecture-doc note candidate** — §7: name the transfer adapter modules + record prior-art DEFERRED (retrieval-gated) so the shipped transfer-check set is accurate.
- **Future TODO (next-brief)** — prior-art (transfer) + current-signal-grounding/falsifiability (zeitgeist, P4.10) land when retrieval P2.6/P2.7 + a harness async-extension exist; they persist retrieval outcomes into the originating event (rule #7 replay).

## How to invoke
1. **Read this brief end-to-end** (session re-engaged from the P4 round — no `/session-start`; if the session was idle, a quick `/session-start` re-orient is fine). **Q1 is load-bearing.**
2. **Run `/tdd transfer_check_adapters`.**
3. **Step 0/1** — confirm Feature + file list (note the path-drift + prior-art-deferred FYI).
4. **Step 2.5** — answer the 4 design questions (Q1 load-bearing); ping the orchestrator before GREEN.
5. **Step 9** — surface anything beyond the anticipated candidates. **security-reviewer (invariant-touching).**
