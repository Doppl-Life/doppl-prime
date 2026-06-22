# Session verifier-002 — Phase 4 check adapters (transfer/zeitgeist/grounding) + live-rerun

- **Date:** 2026-06-21
- **Phase:** Phase 4 (Verifier council & checks) — `ARCHITECTURE.md §7` (+ §9/§17 for grounding/live-rerun)
- **Track:** `verifier` (worktree `Capstone-verifier`, branch `track/verifier`)
- **Predecessor session:** `verifier-001-2026-06-21-p4-verifier-council-checks.md` (P4.4/P4.5/P4.3/P4.6/P4.8)
- **Successor session:** _(none yet)_

## Why this session existed

A continuation of the verifier track past the verifier-001 checkpoint. After the kernel freeze
bundle unblocked the fork, the deterministic + retrieval-grounded **check adapters** and the
**live-rerun affordance** turned out to be buildable now (their deps — P0.7/P4.5/P4.9 — all
landed; only the gateway-retrieval FETCH + run/replay + the demo UI are P3/demo-gated). The
orchestrator twice corrected its own "buildable-complete" scope calls as it re-checked the
dependency graph; this session shipped the 4 slices those corrections unblocked. With them, both
check subtypes are equal-complete (5/5) and the verifier track is genuinely buildable-complete.

## What was built

Four slices landed (4 commits), all TDD-clean + security-reviewed:

### Files created

| File | Slice | Purpose |
|---|---|---|
| `src/check-runners/transfer/{source-validity,target-fit,mapping-quality,allowlisted-executable}.ts` | P4.9 | 4 deterministic non-executing transfer `CheckRunner`s (relational/heuristic over `CrossDomainTransferPayload`) |
| `src/check-runners/transfer/shared.ts` → MOVED to `src/check-runners/shared.ts` | P4.9 → P4.10 | subtype-agnostic parse/tokenize/normalize/result-builders (created P4.9, generalized P4.10) |
| `src/check-runners/zeitgeist/{novelty,timing,coherence}.ts` | P4.10 | 3 deterministic zeitgeist `CheckRunner`s (novelty = SELF-CONSISTENCY, NOT the P5 embedding score) |
| `src/check-runners/transfer/prior-art.ts` · `zeitgeist/{current-signal-grounding,falsifiability}.ts` | grounding | 3 retrieval-grounded `CheckRunner`s (pure over caller-threaded `retrievalResults`) |
| `src/check-runners/live-rerun.ts` | P4.11 | `liveRerun` — live re-run via `runCheck` else replay-backed fallback via `readByRun` |
| `test/unit/check-runners/transfer/*.test.ts` · `zeitgeist/*.test.ts` · `live-rerun.test.ts` | all | per-adapter + mechanism unit tests |
| `test/integration/check-runners/{transfer,zeitgeist,grounding}/*.test.ts` · `live-rerun.test.ts` | all | real-PG integration through `runCheck` / `liveRerun` |

### Files modified

- `src/check-runners/registry.ts` — registers the 4 transfer + 3 zeitgeist + 3 grounding descriptor+impl pairs (both `CHECK_RUNNER_REGISTRY` + `CHECK_RUNNER_IMPLS` stay frozen); adds the `RetrievalResult` app-level type + `retrievalResults?` on `CheckRunnerInput`; both P4.5 placeholders kept.
- `src/check-runners/run-check.ts` (grounding) — adds `retrievalResults?` to `CheckRequest`; threads it (omit-if-undefined) into the impl call. Shape otherwise unchanged.
- `src/check-runners/shared.ts` (P4.10 move + grounding) — generalized from `transfer/shared.ts`; grounding helpers (`RETRIEVAL_UNAVAILABLE_REASON`, `retrievedCorpus`, `groundingRefs`, `groundedResult`) + the empty-source guard.
- the 4 transfer adapters — import path `./shared` → `../shared` after the move (mechanical).

### Commits (branch `track/verifier`)

| Hash | Slice | Tests |
|---|---|---|
| `d3a6e0f` | P4.9 cross-domain-transfer check adapters (prior-art deferred) | +23 unit +2 integration |
| `d1505a5` | P4.10 zeitgeist-synthesis check adapters (grounding deferred) | +17 unit +2 integration |
| `75eefc9` | grounding sub-bundle (P4.9b/P4.10b) — caller-does-retrieval | +23 unit +3 integration |
| `9f95a11` | P4.11 live re-run + replay-backed fallback | +7 unit +2 integration |

Final suite: **138 unit / 37 integration** (entered the session at 68/28; +70 unit, +9 integration).

## Decisions made

- **P4.9 (defaults + 2 deviations):** deterministic relational checks (source≠target domain; mapping/mechanism token-overlap with target ≥ threshold; mapping+mechanism ≥ N words; allowlisted-executable runs only for a prepared-allowlisted problem, NEVER executes candidate code) with fixed tunable consts; invalid payload → `failed` (fail-not-throw). **Q4: kept BOTH P4.5 placeholders** (PREPARED_TOY is a live committed-test fixture — retiring it = churn for no benefit; the orchestrator's "retire" default was wrong, corrected on evidence). **+1 file** `transfer/shared.ts` (DRY helper). prior-art DEFERRED (retrieval-gated).
- **P4.10 (defaults):** novelty = deterministic SELF-CONSISTENCY (thesis vs declared `comparablePriorArt`), named distinctly from the §8 P5 embedding novelty SCORE; timing = whyNow grounded in currentSignals (empty signals → fail); coherence = thesis connected to whyNow+predictions. **Q2: generalized `transfer/shared.ts` → `check-runners/shared.ts`** (+ `parseZeitgeistCandidate`); transfer adapters re-import; transfer suite verified still green (no test imports `shared`). grounding/falsifiability DEFERRED.
- **grounding (P4.9b/P4.10b) — caller-does-retrieval (Q1, harness-author-endorsed):** the 3 adapters stay PURE `CheckRunner`s scoring the candidate against `retrievalResults` threaded in as DATA — keeps the rule-#3 allowlist non-executing (no provider reach from a check impl) AND makes rule-#7 replay trivial (a pure adapter never calls a provider; the P3 caller fetches once + persists + re-threads on replay). Additive `retrievalResults?` harness field (deterministic adapters ignore it — backward-compat integration test pins it). Absent results → `skipped{retrieval_unavailable}` (no false grounding). The adapter records its grounding evidence in `CheckResult.evidenceRefs` (EvidenceKind prior_art/signal); the FULL `retrievalResults` persistence + replay re-thread is the P3 caller's job.
- **P4.11 (defaults + 1 refinement):** `liveRerun` tries live via an injectable `liveAttempt` (default `runCheck`); fallback on throw OR skipped; non-recorded → `skipped{live_failed_no_recorded_fallback}` (non-fabricated). **Q3 refinement:** the fallback filters to USABLE (passed/failed) recorded results — excluding skips — so when the live attempt is the real `runCheck` returning skipped (which already appended its own skip at the highest sequence), the fallback never serves that triggering skip back (a brief-default correctness bug, caught + blessed).

## Decisions explicitly NOT made (deferred)

- **prior-art + current-signal-grounding + falsifiability** were initially deferred from P4.9/P4.10 (retrieval-gated) then BUILT this session via the caller-does-retrieval design (no async harness needed — the caller fetches).
- **The gateway-retrieval FETCH + persistence + run/replay re-thread** — P3 verifying phase (named-deferral). The real `RetrievalResult` shape (P2.6/P2.7) must match this app-level `{text,source,fallbackSourced}`.
- **liveRerun's operator-trigger + demo UI + winning-idea selection** — P3/P5/demo (named-deferral).
- **P4.7 critic-set rotation** — NOT built; genuinely kernel-RNG-seed-gated (needs the P3 persisted run seed). Parked for the P3-merge re-activation.

## TDD compliance

**Clean — no violations.** Every slice: RED (confirmed failing for the right reason — missing module/export) → Step-2.5 orchestrator review (APPROVED before GREEN) → GREEN → full suite → security-reviewer → commit. Caught + fixed before/within-slice: 2 strict-index typecheck issues (P4.9 + grounding test helpers; exactOptionalPropertyTypes), a latent bad import, and the security `[high]` (empty-source EvidenceRef throw — fixed in `groundingRefs` + an edge test). Integration ran against the **real** testcontainers Postgres throughout (no load-bearing mocks). Format:check run **pre-commit** every slice (lesson 14, after the verifier-001 trap).

## Reachability

All adapters/mechanisms are reachable via the registry → `runCheck` / `liveRerun`; first production caller is the P3 generation `verifying` phase (+ demo for live-rerun) — named-deferral. No silent tested-but-unwired gaps:

| Feature | Reachable from / entry point |
|---|---|
| P4.9 transfer adapters (4) | registry → `runCheck`; P3 verifying phase per cross_domain_transfer candidate; real-PG integration |
| P4.10 zeitgeist adapters (3) | registry → `runCheck`; P3 verifying phase per zeitgeist_synthesis candidate; real-PG integration |
| grounding adapters (3) | registry → `runCheck` (additive `retrievalResults?`); P3 fetches+threads; real-PG integration |
| P4.11 `liveRerun` | reuses `runCheck` (gated live) + `readByRun` (read-only fallback); demo operator + P3/P5 winning-idea (named-deferral); real-PG integration |

## Open follow-ups (Step-9 categorized — already routed hot to the orchestrator)

- **Cross-doc invariant changes this session: NONE** (memory-checked — every slice flagged NONE at Step 9; orchestrator confirmed). `RetrievalResult` + `retrievalResults?` are app-level/internal, not frozen contracts. No Appendix-A change.
- **Convention candidates → orchestrator banking** (LESSONS, my flags): §32 subtype-check-adapter pattern (P4.9; written), §33 caller/adapter retrieval split + the caller-DATA→strict-field guard sub-note (grounding), §34 live-rerun-with-replay-fallback + the status-filter subtlety (P4.11).
- **Architecture-doc notes** (orchestrator writes at `/orchestrate-end`): §7 name the 4 transfer + 3 zeitgeist + 3 grounding modules; **transfer 5/5 + zeitgeist 5/5** (completes §7 equal-must-ship); novelty=SELF-CONSISTENCY ≠ P5 score; record the **caller-does-retrieval** design + P3 fetch/persist/replay deferral + `skipped{retrieval_unavailable}` fail-safe; §7/§17 name `liveRerun` (REQ-E-003 demo fallback ladder) + operator/UI/winning-idea P3/P5/demo-deferred.
- **Security `[high]` (grounding) — FIXED in-slice:** empty-source `RetrievalResult` → invalid `EvidenceRef.label` (`.min(1)`) → `CheckResult.parse` throw, breaking fail-not-throw on caller-threaded DATA. `groundingRefs` now drops empty/whitespace-source results; pinned by `prior_art_empty_source_does_not_throw`. Not escalated (robustness gap, no invariant bypass).
- **Cross-track carry-forward (→ kernel P3 + retrieval P2.6/P2.7):** P3 owns the gateway-retrieval fetch (role `retrieval`, candidate-as-DATA seam) + persistence + run/replay re-thread; the real `RetrievalResult` shape must match this app-level type. Demo wires `liveRerun` to the operator affordance; P3/P5 supplies the winning-idea selection.
- **Future TODO — belongs to a phase:** **P4.7 critic-set rotation** (kernel-RNG-seed-gated → P3-merge re-activation); the prod `final_judge` fake fixture → per-axis (P3 judge wiring, from verifier-001).

## Phase status

Phase 4 is **buildable-complete on the verifier track** — 9 slices shipped across verifier-001 + verifier-002 (P4.3/P4.4/P4.5/P4.6/P4.8 + P4.9/P4.10/grounding/P4.11), both check subtypes 5/5. Only **P4.7** remains (kernel-RNG-gated). `/phase-exit P4` stays OPEN (P3-blocked) — orchestrator's call.
