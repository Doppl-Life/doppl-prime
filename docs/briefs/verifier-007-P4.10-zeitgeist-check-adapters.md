# /tdd brief — zeitgeist_check_adapters

## Feature
Bundle C — the **deterministic zeitgeist-synthesis check adapters**: three non-executing pure `CheckRunner`
adapters (novelty, timing, coherence) registered into the P4.5 allowlist registry + impl-map, each parsing
the candidate as a `ZeitgeistSynthesisPayload` (data, never executed) and emitting a schema-valid `CheckResult`
through the existing `runCheck` harness. The retrieval-grounded **current-signal-grounding** + **falsifiability**
adapters are **DEFERRED** to the grounding sub-bundle (same gate as P4.9 prior-art — see Q1). Mirrors P4.9
exactly (lesson 32). Feature slice (consumes the rule-#3 allowlist; the invariant is pinned in P4.5).

## Use case + traceability
- **Task ID:** P4.10
- **Architecture sections it implements:** `ARCHITECTURE.md §7` (zeitgeist_synthesis checks: current-signal grounding
  / novelty / timing / coherence / falsifiability; equal-must-ship with transfer; non-executing allowlist; retrieval-
  grounded grounding/falsifiability with curated-corpus fallback), `§14` (candidate-as-DATA; allowlist, no arbitrary code).
- **Related context:**
  - Key safety rule #3 (allowlist of non-executing adapters) — **pinned in P4.5**; this slice ADDS adapters.
  - **P4.9 (landed) is the exact template (lesson 32):** a subtype check adapter is a pure `CheckRunner = (input) => CheckResult` (sync, no IO) that parses the candidate as its frozen subtype payload (DATA, fail-not-throw), checks RELATIONS not presence (the strict schema already guarantees presence), with thresholds as named tunable consts. **Reuse the P4.9 `src/check-runners/transfer/shared.ts` helpers** (`tokenize`/`normalize`/result-builders are subtype-agnostic; add a `parseZeitgeistCandidate`) — see Q2.
  - **P4.5 harness (landed `89ab697`):** `runCheck` + the frozen `CHECK_RUNNER_REGISTRY` + `CHECK_RUNNER_IMPLS` (register descriptor+impl pairs; both stay frozen). **Unchanged** — these 3 adapters are pure-sync and drop in.
  - **Frozen `ZeitgeistSynthesisPayload` (P0.5):** strict `{thesis, audience, currentSignals[], whyNow, falsifiablePredictions[], comparablePriorArt[]}` — strings `.min(1)`; the three arrays may be empty (count is the kernel's concern). Presence guaranteed → the checks test RELATIONS (Q3).
  - **Frozen `CheckResult` (P0.7).**
  - **Lead direction (2026-06-21):** Bundle C; novelty/timing/coherence are the non-grounding deterministic adapters buildable now; current-signal-grounding + falsifiability are retrieval-grounded → deferred to the grounding sub-bundle (the curated-corpus FALLBACK makes them buildable later without LIVE retrieval, but they need the async harness — see Q1).

## Acceptance criteria (what "done" means)
- [ ] Three non-executing adapters are registered (descriptor + pure impl, same id, both frozen): `zeitgeist.novelty`, `zeitgeist.timing`, `zeitgeist.coherence`.
- [ ] Each is a pure `CheckRunner` (same input → same `CheckResult`; no IO, no code execution) that parses `candidate` as a `ZeitgeistSynthesisPayload` (data) and emits a schema-valid `CheckResult`.
- [ ] A `candidate` that does NOT parse as a valid `ZeitgeistSynthesisPayload` yields a `failed` `CheckResult` (fail-not-throw), never a throw and never code execution.
- [ ] **novelty:** passes iff the `thesis` is distinct from its self-declared `comparablePriorArt[]` — deterministic token-overlap of `thesis` with each prior-art entry BELOW a fixed threshold (a thesis that restates its own cited prior art fails). NOTE: this is the deterministic *self-consistency* novelty CHECK — NOT the P5 embedding-based novelty SCORE (§8); name it so the two aren't confused. (Q3 default.)
- [ ] **timing:** passes iff `whyNow` is grounded in the cited `currentSignals[]` — deterministic token-overlap of `whyNow` with `currentSignals` ≥ a fixed threshold (the "why now" connects to the signals). An empty `currentSignals[]` → fails (no signals to justify "now"). (Q3 default.)
- [ ] **coherence:** passes iff the thesis is internally connected to its `whyNow` + `falsifiablePredictions[]` — deterministic token-overlap above a fixed threshold (the predictions/timing relate to the thesis). (Q3 default.)
- [ ] Each adapter run end-to-end through `runCheck` emits `check.started` + one validated `check.completed` — verified by an integration test against real Postgres.
- [ ] **current-signal-grounding + falsifiability are DEFERRED** (Q1): not registered/built here; recorded as a flagged follow-up (grounding sub-bundle — needs the async harness + retrieval source). No silent omission; both subtypes still equal-must-ship overall (transfer 4/5 + zeitgeist 3/5 deterministic now, grounding sub-bundle completes both).
- [ ] All unit tests in `apps/api/test/unit/check-runners/zeitgeist/*.test.ts` pass; the integration test passes; `/preflight` clean.

## Wiring / entry point (Step 7.5)
**none (full runtime invocation) — first caller is the P3 generation `verifying` phase** (runs each registered
zeitgeist check per zeitgeist_synthesis candidate via `runCheck`). Adapters + registry entries are the
deliverable; exercised end-to-end via `runCheck` in the integration test (real append path). Confirm at Step 7.5:
each adapter resolves through `runCheck` to its impl and emits only via `store.append` (inherited from P4.5).

## Files expected to touch
**New:**
- `apps/api/src/check-runners/zeitgeist/novelty.ts` · `timing.ts` · `coherence.ts` — the 3 pure `CheckRunner` adapters (+ adapter-id consts).
- `apps/api/test/unit/check-runners/zeitgeist/{novelty,timing,coherence}.test.ts`.
- `apps/api/test/integration/check-runners/zeitgeist/run-zeitgeist-checks.test.ts` — end-to-end through `runCheck` (real PG).

**Modified:**
- `apps/api/src/check-runners/registry.ts` — register the 3 descriptor+impl pairs (both surfaces stay frozen).
- **(Q2)** `apps/api/src/check-runners/transfer/shared.ts` — likely add `parseZeitgeistCandidate` + lift the subtype-agnostic `tokenize`/`normalize`/result-builders to a shared location (see Q2; possibly rename/move out of `transfer/`).

> **Tracker path drift (FYI):** P4.10 cites `apps/api/check-runners/zeitgeist/...`; correct path is `apps/api/src/check-runners/zeitgeist/...`. The tracker lists `current-signal-grounding.ts` + `falsifiability.ts (NEW)` — **DEFERRED** here (Q1).

## RED test outline
**Unit (`test/unit/check-runners/zeitgeist/*.test.ts`)** — each adapter is a pure fn; test directly:
1. **`novelty_passes_distinct_thesis` / `fails_restates_prior_art`** — Asserts: thesis token-overlap with comparablePriorArt < threshold → passed; a thesis that restates a prior-art entry → failed (positive guard first, lesson 10). Why: §7 novelty (self-consistency).
2. **`timing_passes_grounded_whynow` / `fails_when_disconnected_or_empty_signals`** — Asserts: whyNow∩currentSignals ≥ threshold → passed; no overlap OR empty currentSignals → failed. Why: §7 timing.
3. **`coherence_passes_connected` / `fails_disconnected`** — Asserts: thesis∩(whyNow+predictions) ≥ threshold → passed; unrelated → failed. Why: §7 coherence.
4. **`invalid_payload_fails_not_throws`** — Asserts: a `candidate` that isn't a valid `ZeitgeistSynthesisPayload` → failed, no throw, no exec. Why: §7/rule #3.
5. **`adapters_are_pure_deterministic`** (per adapter) — Asserts: same input → identical `CheckResult` (no random/clock). Why: replay-faithful + lesson 32.
6. **`adapter_ids_stable`** (per adapter) — Asserts: the registered id const matches. Why: registration correctness.

**Integration (`test/integration/check-runners/zeitgeist/run-zeitgeist-checks.test.ts`)** — real PG via `runCheck`:
7. **`registered_zeitgeist_adapter_runs_through_harness`** — Asserts: `runCheck` for `zeitgeist.novelty` emits `check.started` + one validated `check.completed`. Why: §7/§4 (lesson 28).
8. **`all_three_zeitgeist_adapters_resolve_and_complete`** — Asserts: each of the 3 ids resolves to its impl (not skipped-unregistered) and completes. Why: §7 registration correctness.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** **none.** Consumes frozen `ZeitgeistSynthesisPayload`/`CheckResult` + the P4.5 registry/harness. No Appendix-A change.
- **§2.5-seam model touched?** No frozen-model change → no schema-snapshot. The `CheckResult.safeParse` on the persisted `check.completed` (integration) is the producer-agreement pin (lesson 20).
- **Orchestrator doc rows to write hot (Step 9):** likely **none**. Possible **Architecture-doc note** (§7) naming the 3 zeitgeist adapter modules + recording current-signal-grounding + falsifiability DEFERRED (3-of-5) so the §7 zeitgeist-check list reflects what shipped. Flag at Step 9.

## Things to flag at Step 2.5
1. **(LOAD-BEARING) current-signal-grounding + falsifiability — DEFER (default).** Same gate as P4.9 prior-art: both need the gateway `retrieval` role (async) which the pure-sync `CheckRunner` harness can't host. The curated-corpus fake makes them buildable WITHOUT live retrieval — but only after a harness async-extension (or a caller-does-retrieval design). My default: **DEFER both to the grounding sub-bundle** (prior-art + current-signal-grounding + falsifiability together, after the harness/design decision). Build the 3 deterministic zeitgeist adapters now. Flagged, not silently omitted.
2. **Shared-helper reuse — generalize `transfer/shared.ts` vs. a new `zeitgeist/shared.ts`.** `tokenize`/`normalize`/`failed`/`skipped` builders are subtype-agnostic; only the parse differs (`parseTransferCandidate` vs `parseZeitgeistCandidate`). My default: **lift the subtype-agnostic helpers to a shared `check-runners/shared.ts`** (move out of `transfer/`) + add `parseZeitgeistCandidate` there; the transfer adapters re-import from the new location (a small mechanical move, covered by the existing transfer tests staying green). Alternative (duplicate a `zeitgeist/shared.ts`) is worse (DRY). Confirm — and confirm the transfer tests stay green after the move.
3. **Deterministic semantics per adapter (defaults, fixed consts).** novelty = thesis∩comparablePriorArt overlap < `NOVELTY_MAX_PRIORART_OVERLAP`; timing = whyNow∩currentSignals ≥ `TIMING_MIN_SIGNAL_OVERLAP` (empty signals → fail); coherence = thesis∩(whyNow+predictions) ≥ `COHERENCE_MIN_OVERLAP`. Same token model as P4.9 (len≥`MIN_TOKEN_LEN`). Crude MVP signals (real quality is critics/judge) — refine thresholds at Step 2.5 if you have a better deterministic signal. **Name the novelty CHECK distinctly from the P5 novelty SCORE** (§8 embedding-based) to avoid confusion.

## Dependencies + sequencing
- **Depends on:** P4.5 registry + `runCheck` (`89ab697` ✅); P4.9 `shared.ts` helpers (landed — reused/generalized); frozen `ZeitgeistSynthesisPayload` (P0.5 ✅) + `CheckResult` (P0.7 ✅); event store (P1.3 ✅). **No P3 dependency**. grounding/falsifiability depend on the async harness + retrieval → deferred.
- **Blocks:** the P3 `verifying` phase (runs these per zeitgeist_synthesis candidate); P4.11 live-rerun.

## Estimated commit count
**1.** A cohesive bundle (3 sibling deterministic adapters + registry wiring + the shared-helper generalization
— same area, same pattern). NOT a safety-invariant slice (rule #3 pinned in P4.5). **security-reviewer:
invariant-touching** (confirm genuinely non-executing — candidate parsed as data only, no eval/exec).

## Lessons-logged candidates anticipated
- **Convention candidate** — likely NONE new (this is lesson 32 applied to the second subtype — same pattern). If the shared-helper generalization surfaces a reusable cross-subtype structure worth pinning, flag it; otherwise no new lesson.
- **Architecture-doc note candidate** — §7: name the 3 zeitgeist adapter modules + record current-signal-grounding + falsifiability DEFERRED (3-of-5) so the shipped zeitgeist-check set is accurate.
- **Future TODO (next-brief)** — the grounding sub-bundle: prior-art (transfer) + current-signal-grounding + falsifiability (zeitgeist), built against the curated-corpus fake after the async-harness/caller-does-retrieval decision; persist retrieval outcomes into the originating event (rule #7).

## How to invoke
1. **Read this brief end-to-end** (session continues from P4.9 — no `/session-start`). **Q1 + Q2 are the design calls.**
2. **Run `/tdd zeitgeist_check_adapters`.**
3. **Step 0/1** — confirm Feature + file list (note the path-drift + grounding-deferred + the shared.ts move).
4. **Step 2.5** — answer the 3 design questions; ping the orchestrator before GREEN.
5. **Step 9** — surface anything beyond the anticipated candidates. **security-reviewer (invariant-touching).**
