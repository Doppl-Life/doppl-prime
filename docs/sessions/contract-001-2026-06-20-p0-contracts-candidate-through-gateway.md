# Session contract-001 — Phase 0 contracts: CandidateIdea → Gateway seam

- **Date:** 2026-06-20
- **Phase:** Phase 0 (shared contracts & event model) — `track/contract`
- **Predecessor session:** none (first contract-track session doc; P0.1–P0.4 landed pre-session-doc, committed `022e9ff`/`4b5db40`/`1e4dd4f`/`bdf3816`)
- **Successor session:** _TBD — picks up P0.10 (per-type payload map)_
- **Role:** `contract-contracts-implementer` (heartbeat label read `contract-core-implementer`)

## Why this session existed

Resume after an accidental mid-slice shutdown, then drive the Phase-0 contract freeze forward from P0.5. Phase 0 is the forced-serial bottleneck (all five build tracks consume `@doppl/contracts`), so each `§2.5`-seam model needs a frozen Zod schema + a field-name schema-snapshot before the parallel tracks fork. Landed P0.5 → P0.11+P0.12 (7 task IDs across 6 `/tdd` slices). Phase 0 now **11/14**.

## What was built

Six slices, six commits, suite **58 → 118** (+60 tests). All in `packages/contracts`.

### Files created (src)
- `src/domain/candidate-idea.ts` — `CandidateIdea` (`z.discriminatedUnion('subtype')`) + `CandidateStatus` (8). _(P0.5, `49f77f3`)_
- `src/domain/subtype-payloads.ts` — `CrossDomainTransferPayload` + `ZeitgeistSynthesisPayload`. _(P0.5)_
- `src/domain/evidence-ref.ts` — `EvidenceRef` + `EvidenceKind` (6). _(P0.5)_
- `src/verifier/critic-review.ts` — `CriticReview` (strict 7) + `CriticMandate` (5). _(P0.6, `dfd651f`)_
- `src/verifier/critic-input.ts` — `criticInput` + `CRITIC_INPUT_SENTINEL` + pure `wrapUntrusted` (neutralizes embedded sentinels). _(P0.6)_
- `src/checks/check-result.ts` — `CheckResult` (strict 9, `skipReason` IFF `skipped`) + `CheckStatus` (3). _(P0.7, `83db38d`)_
- `src/checks/check-runner-adapter.ts` — `CheckRunnerAdapter` (non-executing) + `CheckRunnerRegistry` + pure `resolveCheckAdapter` (own-property allowlist gate). _(P0.7)_
- `src/scoring/novelty-score.ts` — `NoveltyScore` (9; vector+provenance required). _(P0.8, `837e5be`)_
- `src/scoring/fitness-score.ts` — `FitnessScore` (6; policyVersion required). _(P0.8)_
- `src/scoring/scoring-policy.ts` — `ScoringPolicy` (3; structure-frozen/weights-open). _(P0.8)_
- `src/domain/energy-event.ts` — `EnergyEvent` (10; success-only, no failed-debit field) + `EnergyEventType` (3). _(P0.9, `a13d9cc`)_
- `src/domain/reproduction-event.ts` — `ReproductionEvent` (7; crossoverPoints+mutationSummary required) + `ReproductionMode` (4). _(P0.9)_
- `src/gateway/provider-meta.ts` — shared `ProviderMeta` (no-secret; first consumer P0.9, imported by P0.12). _(P0.9)_
- `src/gateway/model-role.ts` — `ModelRole` (7). _(P0.11, `9c174b7`)_
- `src/gateway/provider-capability.ts` — `ProviderCapability`. _(P0.11)_
- `src/gateway/model-route.ts` — `ModelRoute` (provider-agnostic). _(P0.11)_
- `src/gateway/gateway-request.ts` — `ModelGatewayRequest` (prompt-XOR-messages) + `ChatRole` (3). _(P0.12)_
- `src/gateway/gateway-response.ts` — `ModelGatewayResponse` (accepted⇔result, rejection-IFF) + `ValidationResult` (3). _(P0.12)_

### Files created (test)
- `test/domain/{candidate-idea,evidence-ref,subtype-payloads,energy-event,reproduction-event}.test.ts`
- `test/verifier/{critic-review,critic-input}.test.ts`
- `test/checks/{check-result,check-runner-adapter}.test.ts`
- `test/scoring/{novelty-score,fitness-score,scoring-policy}.test.ts`
- `test/gateway/{model-role,provider-capability,model-route,gateway-request,gateway-response}.test.ts`
- `test/__schema-snapshots__/{candidate,critic,check,scoring,energy-reproduction,gateway}-field-sets.test.ts`

### Files modified
- `src/index.ts` — barrel re-exports for every new schema/enum/helper (single import boundary).
- `docs/sessions/contract-001-2026-06-20-p0-contracts-candidate-through-gateway.md` (this doc).
- **Formatting fix (`609cb9d`, `style(contracts)`):** 10 files (reproduction-event + 9 tests) re-wrapped to satisfy the package-pinned prettier — see TDD compliance note below. Formatting-only; suite stayed 118/118.

## Decisions made

- **P0.5 `CandidateIdea` = `z.discriminatedUnion('subtype', …)`** — the `subtype ⟺ subtypePayload` correlation is structurally unrepresentable-when-wrong. Discriminant literals sourced from the canonical P0.3 `Subtype` enum (not redefined). Snapshot walks `CandidateIdea.options`; discriminant probed via `safeParse` (zod-v4 literals can be multi-value, so `.value` is v3-only).
- **P0.6 `wrapUntrusted` neutralizes embedded sentinels** (orchestrator ADD) — the sentinel is public, so an attacker-controlled candidate could forge a delimiter boundary (T-002/RISK-008, rule #6). Single `replaceAll` with a `[`-bearing marker is provably one-pass-complete (sentinel has no self-overlap + marker breaks splice-reformation) → no O(n²) loop on attacker input.
- **P0.7 `resolveCheckAdapter` own-property lookup** (`hasOwnProperty.call`) — defeats `__proto__`/`constructor`/`toString` allowlist-bypass; fails safe to a schema-valid `skipped` CheckResult on unregistered id; skip reason is a fixed constant (no untrusted-id reflection). Took the bidirectional `skipReason` IFF.
- **P0.8 immutability-via-versioning** — `FitnessScore.policyVersion` required + typed identically to `ScoringPolicy.version` (structural identity, not a shared symbol — the bind is value-level, enforced P5/P0.10). `NoveltyScore.vector`+provenance required (rule #7). Weight VALUES are the only deferred-open contract piece.
- **P0.9 success-only accounting by shape** — `EnergyEvent` has no failed/retried/repaired/success field (failures are a separate `provider_call_failed`); `estimate`+`actual` both required. `ReproductionEvent` RNG outcomes (`crossoverPoints` int[], `mutationSummary` string|number|boolean record — inspectable, not `z.unknown`) required. `ProviderMeta` extracted to `src/gateway/` (lesson §5).
- **P0.11+P0.12 gateway seam** — prompt-XOR-messages refine; `accepted ⇔ (validationResult !== 'rejected')`; rejection-IFF-rejected; `providerMeta` imports shared `ProviderMeta`; `ChatRole` distinct from `ModelRole`. §14 no-credential pinned by strict. `schema?`/`output?` opaque `z.unknown()` passthroughs.

## Decisions explicitly NOT made

- **No shared `PolicyVersion` symbol** (P0.8) — YAGNI; primitive `z.string().min(1)` has no members to drift; extract only if `version` gains a format constraint.
- **No `noveltyScoreId` on `FitnessScore`** (P0.8) — frozen 6 fields; novelty referenced via `components` + the P0.10 event-payload link.
- **`costEstimate`/`estimate`/`actual`/`total`/`score` left permissive** — AMOUNTS are kernel-bounded (lesson §6); only definitional COUNTS (tokens, dimension) carry structural `.nonnegative()`/`.positive()`.
- **`schema?`/`output?` not the secret boundary** — opaque passthroughs; the §14 redaction scrub at the persistence seam (P0.2 `scrubSecrets`) is the defense (see Open follow-ups).

## TDD compliance

**Clean — no implementation-before-test.** Every slice: RED written → Step-2.5 review → confirm-RED (right reason) → GREEN. Notes (not violations):
- Two all-negative safety tests false-passed at confirm-RED (`critic_review_rejects_winner_or_policy_field` P0.6; `energy_no_failed_debit_field` P0.9) — hardened with a leading positive guard before GREEN (lesson §10). Tests still written first.
- P0.7: Step-8 typecheck caught a test-fixture union-widening error vitest missed → fixed with a `: CheckRunnerAdapter` annotation (no assertion changed).
- Safety-invariant slices (P0.6/P0.7/P0.8/P0.9) each ran an independent `security-reviewer` fan-out — **all CLEAN, 0 findings**.
- **Tooling finding (resolved at `/session-end`):** the per-slice Step-8 `npx prettier --check <files>` resolved a DIFFERENT prettier than the package-pinned binary and reported false-clean on 10 files (Unicode chars in comments shifted line-wrap past print-width). `pnpm format:check` (the authoritative gate) caught it; reformatted + committed (`609cb9d`). **Process correction for future sessions: use `pnpm format:check` / `./node_modules/.bin/prettier`, NOT bare `npx prettier`, for the format gate.** No semantic impact (formatting-only; all snapshots/assertions unchanged, 118/118).

## Reachability

Every contract is a leaf shape; its production entry point is the `@doppl/contracts` barrel (`src/index.ts`) that the downstream tracks import. For each slice: **barrel-exported + schema-snapshot-covered** (a `barrel_exports_*` test + a `*-field-sets` snapshot), and the pure helpers (`wrapUntrusted`, `resolveCheckAdapter`) are directly unit-tested. Runtime wiring (kernel/verifier/selection/gateway computation) lands in later phases (P2–P5) by design — **not a tested-but-unwired gap**. No wiring was removed by a later slice this session.

## Open follow-ups

**Orchestrator-routed (hot, in its `/orchestrate-end` round commit — listed for traceability, not action):**
- Cross-doc rows (`apps/api/CLAUDE.md`) + Appendix-A gap-fills: 474 (`CheckRunnerAdapter` fields), 475/476 (scoring types), 478 (`crossoverPoints`/`mutationSummary` shapes), 480 (`providerMeta` = shared `ProviderMeta` + gateway Q1/Q3 settled types).
- LESSONS banked: §7 (discriminated-union correlation), §8 (injection-isolation primitive), §9 (evidence-only / success-only by shape), §10 (positive-guard), §11 (allowlist two-ways), §12 (immutability-via-versioning), §13 (authoritative-once-computed).

**Cross-track Carry-forwards:**
- **§14 defense-in-depth (NEW, from P0.12 security-review):** `ModelGatewayResponse.output?` + `ModelGatewayRequest.schema?` are opaque `z.unknown()`; the P2/P3 consumer that persists them MUST route through `scrubSecrets` (P0.2) before append + before Langfuse. The contract is not the secret boundary.
- ProviderMeta carry-forward consumed by P0.12 (orchestrator deleting).

**Remaining P0 queue (successor session):** P0.10 (per-type payload-shape map for high-traffic event types — depends on the now-frozen models), P0.13 (LineageGraphProjection), P0.15 (Run/Generation/CullingEvent/FinalJudgeRubric — FinalJudgeRubric weights mirror P0.8's deferred-open posture), P0.14 (contract-test surface — consumer/producer agreement, last).

## How to use what was built

Downstream tracks import everything from `@doppl/contracts` (never redefine — lesson §5). Cross-field invariants are enforced in the schema (parse-time); count/range invariants (e.g. `vector.length === dimension`, energy nonnegativity, parent count 0–2) are kernel-enforced (lesson §6). The two pure safety primitives — `wrapUntrusted(text)` (critic-input isolation) and `resolveCheckAdapter(registry, request)` (allowlist gate) — are single-source; consumers call them, never reimplement.
