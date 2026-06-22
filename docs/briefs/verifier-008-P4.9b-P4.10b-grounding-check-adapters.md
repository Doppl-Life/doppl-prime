# /tdd brief — grounding_check_adapters

## Feature
The grounding sub-bundle — the three **retrieval-grounded** check adapters deferred from P4.9/P4.10:
prior-art (cross_domain_transfer), current-signal-grounding + falsifiability (zeitgeist_synthesis). Each is
a **pure** `CheckRunner` that scores the candidate against **retrieval results threaded in as DATA** (the
caller fetches retrieval; the adapter stays pure → rule #3 non-executing + rule #7 replay-safe by
construction). Adds an optional `retrievalResults` field to the harness input (threaded through `runCheck`,
unused by the existing deterministic adapters). The gateway retrieval FETCH + persistence + run/replay
distinction is **named-deferral to the P3 verifying phase** (Q1). Completes both subtypes' check sets
(transfer 5/5, zeitgeist 5/5).

## Use case + traceability
- **Task ID:** P4.9 + P4.10 (the deferred grounding sub-adapters: prior-art for transfer; current-signal-grounding + falsifiability for zeitgeist).
- **Architecture sections it implements:** `ARCHITECTURE.md §7` (prior-art + grounding/falsifiability checks consume
  the retrieval source with curated-corpus fallback; both subtypes equal-must-ship), `§9` (retrieval outcomes persisted
  into the originating event so replay never re-calls the web — rule #7), `§14` (candidate-as-DATA; allowlist non-executing).
- **Related context:**
  - **Lesson 32 (P4.9/P4.10):** the deferral note — "retrieval-grounded checks don't fit a pure-sync harness; the curated-corpus FAKE is available so the blocker is the harness SHAPE, not retrieval; defer to an async-harness OR caller-does-retrieval slice." This slice resolves that via **caller-does-retrieval** (Q1).
  - **The retrieval source is the gateway `retrieval` role** (`ModelRole` has `retrieval`). The fake gateway's retrieval fixture returns `{results:[{text, source:'curated-fallback-corpus', fallbackSourced:true}]}` — the curated-corpus fallback, available NOW. So grounding is buildable without LIVE retrieval (P2.6/P2.7).
  - **rule #7 (replay):** §9 — the retrieval OUTCOME is persisted into the originating event. With caller-does-retrieval, the caller fetches ONCE + persists the results in the `check.completed` `CheckResult` (output/evidenceRefs, `EvidenceKind` `prior_art`/`signal`); replay reads the persisted results + re-threads them into the pure adapter (deterministic recompute, no re-fetch). The pure adapter NEVER calls a provider → replay-safe by construction.
  - **P4.5 harness:** `runCheck` + pure `CheckRunner = (input) => CheckResult`. This slice adds `retrievalResults?` to `CheckRunnerInput` + `CheckRequest` and threads it through `runCheck` — the deterministic adapters ignore it (unused); the 3 grounding adapters consume it.
  - **`shared.ts` (P4.10):** reuse `tokenize`/`normalize`/`tokenOverlap`/result-builders + `parseTransferCandidate`/`parseZeitgeistCandidate`.
  - **Frozen `CrossDomainTransferPayload`/`ZeitgeistSynthesisPayload`/`CheckResult`/`EvidenceRef`.**
  - **Lead direction:** grounding sub-bundle, built against the curated-corpus fallback; live retrieval deferred as a swap-in.

## Acceptance criteria (what "done" means)
- [ ] `CheckRunnerInput` + `CheckRequest` carry an optional `retrievalResults?: RetrievalResult[]` (app-level type `{text, source, fallbackSourced}` — matches the fake; real shape arrives with P2.6/P2.7); `runCheck` threads it to the impl. The existing deterministic adapters are unaffected (they ignore it) — **the P4.9/P4.10 + P4.5 suites stay green**.
- [ ] Three non-executing adapters are registered (descriptor + pure impl, same id, both frozen): `transfer.prior_art`, `zeitgeist.current_signal_grounding`, `zeitgeist.falsifiability`.
- [ ] Each is a **pure** `CheckRunner` (same input → same `CheckResult`; no IO, no provider call, no code exec) that scores the candidate against the threaded `retrievalResults` (DATA).
- [ ] **prior-art:** given a transfer candidate + retrievalResults, passes iff the candidate's transferMapping/expectedMechanism does NOT substantially duplicate the retrieved prior-art texts (token-overlap < threshold = novel); high overlap → failed (it's prior art). Empty/absent retrievalResults → `skipped{reason:'retrieval_unavailable'}` (NOT a false pass — the check couldn't ground).
- [ ] **current-signal-grounding:** passes iff the candidate's `currentSignals[]` are corroborated by the retrieved texts (token-overlap ≥ threshold); absent results → `skipped{reason:'retrieval_unavailable'}`.
- [ ] **falsifiability:** passes iff the `falsifiablePredictions[]` are checkable against the retrieved evidence by a fixed deterministic heuristic (e.g. each prediction shares ≥1 grounding token with some retrieved text); absent results → `skipped{reason:'retrieval_unavailable'}`.
- [ ] Each adapter persists the retrieval outcome it used into its `CheckResult` (output/evidenceRefs, `EvidenceKind` `prior_art`/`signal`, resolving within the Postgres tier) so replay reads it (rule #7) — verified the persisted `check.completed` carries the grounding evidence.
- [ ] An unparseable candidate → `failed` (fail-not-throw); never a throw, never code execution.
- [ ] The gateway retrieval FETCH + the run/replay distinction is **named-deferral to P3** (Q1) — this slice's adapters are pure over the provided results; tests inject `retrievalResults` directly (the fake's shape).
- [ ] Both subtypes now equal-complete: transfer 5/5, zeitgeist 5/5. All unit tests in `apps/api/test/unit/check-runners/{transfer,zeitgeist}/*.test.ts` pass; integration passes; `/preflight` clean.

## Wiring / entry point (Step 7.5)
**none (full runtime invocation) — first caller is the P3 generation `verifying` phase**, which (deferred) does the
gateway retrieval call (role `retrieval`, candidate-as-DATA via the P4.4 isolation seam) + persists the outcome +
threads `retrievalResults` into `runCheck`, and on replay reads the persisted outcome instead of re-fetching. The
adapters + the `retrievalResults` harness field are the deliverable; exercised via `runCheck` with injected results in
the integration test. Confirm at Step 7.5: the adapters are pure (no gateway/provider import); the retrieval-fetch is
named-deferred to P3 (not built here); `skipped{retrieval_unavailable}` when results are absent (no false grounding).

## Files expected to touch
**New:**
- `apps/api/src/check-runners/transfer/prior-art.ts` · `apps/api/src/check-runners/zeitgeist/current-signal-grounding.ts` · `falsifiability.ts` — the 3 pure grounding `CheckRunner`s.
- `apps/api/test/unit/check-runners/transfer/prior-art.test.ts` · `zeitgeist/{current-signal-grounding,falsifiability}.test.ts`.
- `apps/api/test/integration/check-runners/grounding/run-grounding-checks.test.ts` — through `runCheck` with injected `retrievalResults` (real PG).

**Modified:**
- `apps/api/src/check-runners/run-check.ts` — add `retrievalResults?` to `CheckRequest`; thread it into the `CheckRunnerInput` passed to the impl.
- `apps/api/src/check-runners/registry.ts` — add `RetrievalResult` type + `retrievalResults?` to `CheckRunnerInput`; register the 3 descriptor+impl pairs.
- `apps/api/src/check-runners/shared.ts` — possibly a shared `groundingOverlap` helper (if it DRYs the 3).

> **Tracker path drift (FYI):** correct paths are `apps/api/src/check-runners/...`. These three were the deferred sub-adapters of P4.9 (prior-art) + P4.10 (grounding/falsifiability).

## RED test outline
**Unit (`test/unit/check-runners/{transfer,zeitgeist}/*.test.ts`)** — pure fns; inject `retrievalResults` directly:
1. **`prior_art_passes_novel` / `fails_duplicate` / `skips_no_results`** — Asserts: low overlap with retrieved prior-art → passed; high overlap → failed; absent results → skipped{retrieval_unavailable} (positive guard first, lesson 10). Why: §7 prior-art + no-false-grounding.
2. **`current_signal_grounding_passes_corroborated` / `fails_uncorroborated` / `skips_no_results`** — Asserts: signals overlap retrieved texts ≥ threshold → passed; none → failed; absent → skipped. Why: §7 grounding.
3. **`falsifiability_passes_checkable` / `fails_ungrounded` / `skips_no_results`** — Asserts: predictions grounded in retrieved evidence → passed; none → failed; absent → skipped. Why: §7 falsifiability.
4. **`grounding_adapters_pure_deterministic`** (per adapter) — Asserts: same (candidate, results) → identical `CheckResult` (no random/clock/provider). Why: rule #7 replay-faithful.
5. **`retrieval_outcome_persisted_in_result`** — Asserts: the produced `CheckResult` carries the grounding evidence (output/evidenceRefs) it used. Why: §9 rule #7 (replay reads it).
6. **`invalid_payload_fails_not_throws`** (per adapter) — Asserts: bad candidate → failed, no throw, no exec. Why: §7/rule #3.

**Integration (`test/integration/check-runners/grounding/run-grounding-checks.test.ts`)** — real PG via `runCheck`:
7. **`grounding_adapter_runs_through_harness_with_injected_results`** — Asserts: `runCheck` for `transfer.prior_art` with `retrievalResults` → `check.started` + one validated `check.completed` carrying the grounding evidence. Why: §7/§4/§9.
8. **`grounding_adapter_skips_when_no_results`** — Asserts: `runCheck` with no `retrievalResults` → `check.completed` status `skipped{retrieval_unavailable}` (no false grounding, never re-fetches). Why: §7 fail-safe.
9. **`existing_deterministic_adapters_unaffected`** — Asserts: a P4.9/P4.10 adapter still runs identically through the extended `runCheck` (retrievalResults absent). Why: backward-compat (the harness extension is additive).

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** **none to frozen contracts.** `RetrievalResult` is app-level (like `JudgeModelOutput`/`CriticModelOutput`); the `retrievalResults?` harness field is internal. No Appendix-A change.
- **§2.5-seam model touched?** No. The `CheckResult.safeParse` on the persisted `check.completed` (integration) is the producer-agreement pin.
- **Cross-track pointer (carry-forward → kernel P3 + retrieval P2.6/P2.7):** the P3 verifying phase OWNS the retrieval fetch (gateway `retrieval` role, candidate-as-DATA seam) + persistence + run/replay; the REAL `RetrievalResult` shape (P2.6/P2.7) must match this slice's app-level type. I'll record this for the kernel/demo orchestrators.
- **Orchestrator doc rows to write hot (Step 9):** likely none. Possible **Architecture-doc note** (§7 — name the 3 grounding modules; §7 transfer/zeitgeist sets now 5/5; record caller-does-retrieval + the P3-fetch deferral). Flag at Step 9.

## Things to flag at Step 2.5
1. **(LOAD-BEARING) caller-does-retrieval (default) vs. harness-does-retrieval.** My default: **caller-does-retrieval** — the adapter is a PURE `CheckRunner` over (candidate + injected `retrievalResults`); the P3 verifying phase does the gateway fetch + persistence + run/replay. Rationale: keeps rule #3 (no gateway reach from a check impl — the allowlist stays pure/non-executing), makes rule #7 trivial (the pure adapter never calls a provider → replay-safe by construction; the caller persists once + re-threads on replay), and matches the verifier-track pattern (runJudge/runCouncil are the async orchestrators; checks stay pure). Alternative (extend `runCheck`/`CheckRunner` to async + inject the gateway so the adapter fetches) couples the rule-#3 harness to the provider seam + needs per-adapter replay handling — I think it's worse. **You built the harness — strong veto welcome here.** If you prefer harness-does-retrieval, that's a bigger safety-harness change → its own solo slice, not this bundle.
2. **`skipped{retrieval_unavailable}` vs `failed` when results are absent.** My default: **skipped** with a fixed reason (the check couldn't ground — not the candidate's fault; a `failed` would wrongly penalize the candidate for missing infrastructure). Confirm the reason const name.
3. **Deterministic grounding semantics (fixed consts).** prior-art = max token-overlap(mapping/mechanism, each retrieved text) < `PRIOR_ART_MAX_OVERLAP` (novel); current-signal-grounding = signals∩retrieved ≥ `GROUNDING_MIN_OVERLAP`; falsifiability = each prediction shares ≥1 grounding token with some retrieved text (or ≥ fraction). Crude MVP (real grounding quality is the judge's) — refine at Step 2.5.
4. **Bundle size / split.** This is harness-extension + 3 adapters — larger than the P4.9/P4.10 pure-adapter bundles. My default: **one bundle** (cohesive grounding unit; the harness field is tiny + additive). If your context is pressured (you were at ~50%), flag a split: slice 1 = harness `retrievalResults` field + prior-art (proves the design); slice 2 = the 2 zeitgeist grounding adapters. Your call at Step 2.5.

## Dependencies + sequencing
- **Depends on:** P4.5 harness + P4.9/P4.10 adapters + `shared.ts` (landed); frozen payloads + `CheckResult` + `EvidenceRef` + `ModelRole.retrieval`. **No P3/retrieval dependency for THIS slice** (results injected; the fetch is P3's). The curated-corpus fake validates the shape.
- **Blocks:** the P3 verifying phase (wires the real gateway-retrieval fetch + persistence + run/replay, threading results into these adapters); P4.11 live-rerun.

## Estimated commit count
**1** (or 2 if split per Q4). NOT a safety-invariant slice — the rule-#3 allowlist invariant is pinned in P4.5 and these adapters stay pure (the `retrievalResults` field is additive + non-executing). **security-reviewer: invariant-touching** (confirm: the adapters make NO provider/gateway call themselves (pure over injected results), no eval/exec, candidate + results parsed as data, `skipped` on absent results never re-fetches).

## Lessons-logged candidates anticipated
- **Convention candidate** — "a retrieval-grounded check stays a PURE `CheckRunner` by having the CALLER fetch retrieval and thread the results in as DATA (the adapter scores candidate-vs-results deterministically); this keeps the rule-#3 allowlist non-executing AND makes rule-#7 replay trivial (the pure adapter never calls a provider — the caller persists once + re-threads on replay); absent results → skipped (never a false grounding, never a re-fetch)." (a genuine new pattern beyond lesson 32 — the caller/adapter retrieval split.)
- **Architecture-doc note candidate** — §7: name the 3 grounding modules; transfer/zeitgeist check sets now 5/5; record the caller-does-retrieval design + the P3-fetch deferral.
- **Cross-track carry-forward** — P3 owns the gateway-retrieval fetch + persistence + run/replay; the real `RetrievalResult` shape (P2.6/P2.7) matches this app-level type.

## How to invoke
1. **Read this brief end-to-end** (session continues — no `/session-start`). **Q1 + Q4 are the load-bearing calls.**
2. **Run `/tdd grounding_check_adapters`.**
3. **Step 0/1** — confirm Feature + file list (note the harness-field extension + the P3-fetch deferral).
4. **Step 2.5** — answer the 4 design questions (Q1 design fork; Q4 bundle-vs-split given your context); ping the orchestrator before GREEN.
5. **Step 9** — surface anything beyond the anticipated candidates. **security-reviewer (invariant-touching).**
