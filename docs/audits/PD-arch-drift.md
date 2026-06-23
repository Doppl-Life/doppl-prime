# Phase-D Architecture Drift Audit

**Phase:** Phase D (demo track: PD.1–PD.11)
**Branch:** `phase-d`
**Date:** 2026-06-23
**Anchors audited:** §17, §16, §15, §14, §10, §12, §6, §5, §9/§4

---

## Anchor-by-anchor verdict table

### §17 — Deployment & demo strategy

| Statement | Verdict | Evidence |
|---|---|---|
| Boot sequence: `migrate → seed replay fixture → start` | VERIFIED | `apps/api/src/main.ts:163,185,229` — `runMigrations` then conditional `seedDemo` then `app.listen` |
| `crashForward` AWAITED before listen | VERIFIED | `apps/api/src/main.ts:190` — `await crashForward(…)` before `app.listen` |
| Seed step env-gated (`DOPPL_SEED_FIXTURE`); absent → no-op live boot | VERIFIED | `apps/api/src/main.ts:182-186` — guarded by `seedFixtureRunId !== undefined && seedFixtureRunId.trim() !== ''` |
| Missing/invalid fixture ABORTS boot before serving | VERIFIED | `apps/api/src/main.ts:236-241` — any throw in seed step ends the pool and rethrows before `app.listen` |
| Gateway env-switched (`DOPPL_GATEWAY`, default `recorded`) | VERIFIED | `apps/api/src/main.ts:109-110` — `gatewaySelectionFromEnv` returns `{useStub:true}` for everything except `'live'` |
| `DOPPL_GATEWAY=live` → `createLiveGateway` feeds real OpenRouter adapter into same `createGateway` | VERIFIED | `apps/api/src/model-gateway/live-gateway.ts:46-51` + `apps/api/src/main.ts:127-129` |
| `selectGateway` honest-throws if live deps absent (no silent fake) | VERIFIED | `apps/api/test/unit/model-gateway/live-gateway.test.ts` (lesson §90) |
| `dump-replay.ts` exports TERMINAL run validated through `replayEvents`; top-level `schemaVersion=max(rows)` | VERIFIED | `apps/api/src/event-store/scripts/dump-replay.ts` — validated through `replayEvents` gate (lesson §86) |
| `seed-demo.ts` preserves recorded `sequence`/`occurredAt`; idempotent `onConflictDoNothing`; validates each event before insert | VERIFIED | `apps/api/src/event-store/scripts/seed-demo.ts` (lesson §87) |
| `POST /runs/:id/stop` signals kernel via in-memory channel; route appends nothing (rule #2) | VERIFIED | `apps/api/src/main.ts:193,204` + `apps/api/src/boot/operatorStop.ts` (lesson §85) |
| Creds-free e2e (PD.8a): committed `fixtures/replay/demo-recorded-001.json` exists; smoke boots real stack, asserts terminal + `'selected'` winner + zero provider calls + replay state-equivalence | VERIFIED | `fixtures/replay/demo-recorded-001.json` present (49.8KB); `apps/api/test/integration/demo/demo-e2e-smoke.test.ts` lines 164-204; `DEMO_FIXTURE_RUN_ID` = `'demo-recorded-001'` |
| Documented commands `pnpm -C apps/api test:smoke:demo` + `capture:demo-fixture` | VERIFIED | `apps/api/package.json` lines 17,19 — scripts exist with those exact names |
| Live headline e2e (PD.8c): OPT-IN (`skipIf` no `OPENROUTER_API_KEY`); NOT a CI gate; asserts terminal + caps + winner + energy #8 + no-secret #4; replays captured run for rule #7 | VERIFIED | `apps/api/test/integration/demo/live-e2e-smoke.test.ts:202` — `describe.skipIf(!hasLiveKeys())` |
| Live e2e documented command `pnpm -C apps/api test:smoke:live` | VERIFIED | `apps/api/package.json` line 18 |
| Fallback ladder: three rungs (low-cap-live → prepared → replay); manual advance only; no auto-fallback; holds NO authoritative state (rule #2) | VERIFIED | `apps/api/src/runtime/demo/fallback-ladder.ts` — pure in-memory; `advance()` mutates `activeKind` only; no event-store/write capability |
| Cap override only LOWERS caps within validated maxima (rule #1 defense-in-depth) | VERIFIED | `apps/api/src/runtime/demo/demo-cap-override.ts`; `apps/api/test/integration/runtime/demo/cap-override-write-path.test.ts` (lesson §89) |
| PD.4 production wiring of fallback ladder deferred to PD.5/PD.6 | STALE-DOC (already noted in arch) | The arch §17 paragraph says "PD.4's production wiring is deferred to PD.5 (write-path) + PD.6 (UI)" — this is a doc-side note accurately describing incomplete wiring |

### §16 — Testing strategy

| Statement | Verdict | Evidence |
|---|---|---|
| Demo rehearsal: config-validation boot smoke | VERIFIED | `apps/api/test/integration/demo/config-boot-smoke.test.ts` — `config_loads_and_validates` + `missing_required_env_fails_fast` + `langfuse_absence_degrades_cleanly` |
| Langfuse trace-correlation is manual/local smoke, NOT CI-gating; CI asserts trace-id field is carried when enabled and degrades cleanly when disabled | VERIFIED | `config-boot-smoke.test.ts` line 88-99: asserts Langfuse absence lets boot complete (local-first). No Langfuse SDK imported into `apps/api/src/` (grep confirms) |
| Creds-free e2e + live e2e rehearsals covered | VERIFIED | See §17 above |
| Final-idea evidence walkthrough covered | VERIFIED | `apps/web/test/unit/panels/FinalIdeaPanel.test.tsx` (LESSONS §11) + `finalIdeaData.test.ts` |
| Fallback ladder rehearsal covered | VERIFIED | `apps/api/test/unit/runtime/demo/{fallback-ladder,demo-cap-override}.test.ts` |

### §15 — Cross-cutting concerns (Zod config validation + fail-fast env + `.env.example` single-source)

| Statement | Verdict | Evidence |
|---|---|---|
| All config Zod-validated at startup; required env fail-fast at boot | VERIFIED | `apps/api/src/runtime/config/loadConfig.ts` + `assertProviderCredentials` (lesson §32); test: `config-boot-smoke.test.ts:config_loads_and_validates` |
| `.env.example` single-sourced from `REQUIRED_CREDENTIAL_ENV` + `ENV_ALLOWLIST` + `BOOT_ORCHESTRATION_ENV` via drift-guard test | VERIFIED | `apps/api/test/unit/config/env-example-drift.test.ts` imports all three constants; asserts key-set equality both directions |
| Langfuse env OMITTED (`packages/observability` reads no env, P2.8-deferred) | VERIFIED | No `LANGFUSE_*` vars in `.env.example`; grep of `packages/observability/src/` shows no env reads; `config-boot-smoke.test.ts` proves boot succeeds without any Langfuse env |
| Rule #4 placeholders in `.env.example` (non-vacuous real-key guard) | VERIFIED | `env-example-drift.test.ts:env_example_credentials_are_placeholders_not_secrets` — `REAL_KEY_SHAPE.test(…)` guard is non-vacuous (lesson §10) |
| **STALE-DOC: `main.ts` has private `REQUIRED_SECRET_ENV` distinct from exported `REQUIRED_CREDENTIAL_ENV`** | STALE-DOC | `apps/api/src/main.ts:51` defines a private `REQUIRED_SECRET_ENV` used only for `collectSecretValues` (the redaction scrub). Both have identical contents `['OPENROUTER_API_KEY', 'OPENAI_API_KEY', 'DATABASE_URL']`. The spec says single-sourced from `REQUIRED_CREDENTIAL_ENV` but `main.ts` uses its own private copy. The drift-guard test correctly imports only `REQUIRED_CREDENTIAL_ENV` from `registry.ts`. The duplication is code-quality (not a security gap); code is right, the doc note is optimistic |

### §14 — Security / rule #4 (secrets env-only, redaction)

| Statement | Verdict | Evidence |
|---|---|---|
| Redaction scrub runs in `event-store` before append AND in `observability` before Langfuse emit | VERIFIED | `apps/api/src/event-store/redaction.ts` (`scrubEventPayload`); `packages/observability/src/redaction.ts` (`scrubObservabilityPayload`) |
| Both scrubs compose frozen `scrubSecrets` + env-value layer (keys + array elements + values with de-collision) | VERIFIED | `apps/api/src/event-store/redaction.ts:63-110` — `redactEnvValues` traverses keys + arrays + values; de-collision via `nextSuffix` map |
| Secrets never in prompts/events/UI; provider keys env-only | VERIFIED | `live-e2e-smoke.test.ts:live_run_no_secret_leak` asserts no live key value in persisted events |
| Caps enforced in runtime, not prompts (rule #1) | VERIFIED | `apps/api/src/runtime/caps/capEnforcer.ts` (lesson §48); tests in `test/unit/runtime/caps/` |

### §10 — Lineage projection / selected-winner derivation (PD.11)

| Statement | Verdict | Evidence |
|---|---|---|
| No `candidate.selected` event; winner derived ONLY from `run.completed.finalIdeaRef` | VERIFIED | `apps/api/src/projections/reducers/winner.ts:33-46` — triggers on `run.completed` only; reads `finalIdeaRef` from payload |
| Pure reducer (`reducers/winner.ts`) marks candidate `'selected'` | VERIFIED | `apps/api/src/projections/reducers/winner.ts` — pure, no IO/provider import |
| No-op when `finalIdeaRef` absent or candidate not materialized (rule #6 — never fabricated) | VERIFIED | `winner.ts:36,37` — returns `state` unchanged on `null` ref or missing candidate |
| ZERO new contract surface (`CandidateStatus` already includes `'selected'`) | VERIFIED | Uses `'selected' as CandidateIdea` cast; no contract change |
| Replay state-equivalence holds (rule #7): winner mark in shared current-state fold | VERIFIED | `apps/api/test/unit/projections/winner.test.ts:test_idempotent_refold_single_selected` + `demo-e2e-smoke.test.ts:replay_state_equivalence` |
| `winnerReducer` appended LAST to REDUCERS | VERIFIED-BY-TEST | `apps/api/test/unit/projections/winner.test.ts` (6 passing tests, lesson §92) |

**Verified-by-test shortcut applied:** `apps/api/test/unit/projections/winner.test.ts` is a dedicated unit test for `winnerReducer`. The test file exercises: correct `'selected'` derivation, no-winner no-op, run.failed no-op, absent-candidate no-op, selectivity across multiple candidates, idempotent re-fold. Green tests confirm all §10 PD.11 statements.

### §12 — Frontend dashboard / final-idea proof panel (PD.7)

| Statement | Verdict | Evidence |
|---|---|---|
| Transfer-evidence rung label (`live allowlisted (non-executing)` vs `replay-backed`) derived from run `mode`, not `CheckResult` | VERIFIED | `apps/web/src/panels/finalIdeaData.ts:36-38` — `evidenceRungLabel(mode)` pure fn over `RunMode`; `FinalIdeaPanel.tsx:195-199` — `data-evidence-rung={mode}` |
| Zero new contract surface (frozen `CheckResult` carries no live/replay discriminator) | VERIFIED | No new contract field in `packages/contracts`; `FinalIdeaPanel` reads existing `mode` prop only |
| Terminal zero-survivors: terminal run with no winner shows terminal state, never fabricated idea (rule #6) | VERIFIED | `apps/web/src/panels/FinalIdeaPanel.tsx:128-141` — `isRunTerminal(runStatus)` branch renders `'No surviving idea — run {word}.'` when `winner === null` and `runStatus` is terminal |
| `EvidenceRefLink` renders winner's `evidenceRefs` in-tier (no external href, rule #9) | VERIFIED | `apps/web/src/panels/evidenceRef.tsx:28-50` — renders `data-*` attrs, never `<a href>`; `apps/web/test/unit/panels/evidenceRef.test.tsx` asserts no `<a>`/`[href]` (lesson §7) |
| `selectWinner` finds node with `type:'candidate'` + `status:'selected'`; EMIT-ONLY, never re-ranks | VERIFIED | `apps/web/src/panels/finalIdeaData.ts:26-28`; test `finalIdeaData.test.ts` (lesson §8) |
| `gatherProof` aggregates fitness + energy + critic reviews + checks + traces verbatim | VERIFIED | `apps/web/src/panels/finalIdeaData.ts:83-102` — reuses P7.9/P7.11/P7.12 selectors |

**Verified-by-test shortcut applied:** `apps/web/test/unit/panels/FinalIdeaPanel.test.tsx` (lesson §11) covers the transfer-evidence rung, zero-survivors, in-tier evidence. Green.

### §6 — Model gateway / live ModelGateway

| Statement | Verdict | Evidence |
|---|---|---|
| OpenRouter primary for generation/critic/judge/synthesis; direct OpenAI for embeddings | VERIFIED | `apps/api/src/config/model-registry.config.ts` (DEFAULT_MODEL_REGISTRY) |
| `createLiveGateway` uses the same `createGateway` shell (validate/repair/reject discipline inherited) | VERIFIED | `apps/api/src/model-gateway/live-gateway.ts:46-51` |
| SDK confined behind `OpenRouterClient` seam (rule #9); API key env-only (rule #4) | VERIFIED | `live-gateway.ts` imports no vendor SDK; key loaded only in `createOpenRouterClient(env)` at boot |
| Live gateway built LAZILY only when `DOPPL_GATEWAY=live` (recorded builds no client) | VERIFIED | `apps/api/src/main.ts:126` — `selectGateway({useStub:true})` for recorded path (no client construction) |
| Langfuse is a non-authoritative side channel; no Langfuse SDK wired | VERIFIED | No `langfuse` SDK import in `apps/api/src/` or `packages/`; fields `langfuseTraceId`/`langfuseObservationId` are plain strings carried as passthrough |

### §5 — Caps (rule #1) + energy success-only (rule #8)

| Statement | Verdict | Evidence |
|---|---|---|
| Caps enforced in kernel, never by prompt text | VERIFIED | `apps/api/src/runtime/caps/capEnforcer.ts` (lesson §48); `spawnBudget` clamped by kernel |
| `spawnBudget` is an allocation hint clamped to `min(remaining caps)` | VERIFIED | `apps/api/src/runtime/spawn/spawnBudgetClamp.ts` (lesson §80) |
| Kill switch drives any non-terminal → failed/stopped; drains in-flight; writes partial terminal summary | VERIFIED | `apps/api/src/runtime/caps/killSwitch.ts` (lesson §48) |
| Energy = successful productive spend only; failed/retried/repaired → `provider_call_failed`, NOT `energy.spent` | VERIFIED | `apps/api/src/runtime/energy/energyLedger.ts` (lesson §49); `EnergyEvent` schema has no failure member (rule #8 by shape) |
| `energy_exhausted` is mid-flight, not a run-terminal (stops scheduling; scores already-verified candidates) | VERIFIED | `apps/api/src/runtime/recovery/crashForward.ts` + `terminalClassifier.ts` (lesson §69) |

**Verified-by-test shortcut applied:** `apps/api/test/integration/demo/live-e2e-smoke.test.ts` keyless mirror (`recorded_fixture_enforces_caps`, `recorded_fixture_energy_success_only`) confirms rule #1 and rule #8 against the committed fixture.

### §9/§4 — Projections derived/rebuildable; replay state-equivalence; no provider on replay (rule #7)

| Statement | Verdict | Evidence |
|---|---|---|
| `run_events` append-only with per-run `sequence` as sole ordering key | VERIFIED | `apps/api/src/event-store/append.ts` advisory-lock + `COALESCE(MAX+1,0)` sequence (lesson §26) |
| Replay reader validates strictly-increasing + contiguous-from-0; throws `ReplayIntegrityError` on gap/out_of_order | VERIFIED | `apps/api/src/event-store/replay-reader.ts` (lesson §31) |
| Replay calls no providers (rule #7) — structurally: imports no provider/model/web seam | VERIFIED | `apps/api/test/unit/projections/replay-summary.test.ts:test_replay_imports_no_provider` (lesson §55) |
| Replay state-equivalence (`canonicalize(replay) === canonicalize(captured)`) | VERIFIED | `demo-e2e-smoke.test.ts:replay_state_equivalence` on the real committed fixture |
| Embeddings authoritative-once-computed: persisted in `novelty.scored` payload; replay reads stored vector | VERIFIED | `NoveltyScore` schema has required `vector` field (lesson §13); replay path is structurally provider-free |
| `EvidenceRef` resolver: `uri` or `langfuseObservationId`-only → `external_only`, never fetched (rule #7/§14) | VERIFIED | `apps/api/src/event-store/evidence-resolver.ts` (lesson §30) |
| Any cached projection records `(runId, sequenceThrough)` watermark; discarded/rebuilt when stale | VERIFIED | `apps/api/src/projections/projection-builder.ts` + `ProjectionWatermark` contract (lesson §51) |

---

## Mismatch inventory

### DRIFT findings (code ≠ spec, spec is right)

None.

### STALE-DOC notes (code is right, spec lags)

1. **`main.ts` has private `REQUIRED_SECRET_ENV` separate from `registry.ts`'s `REQUIRED_CREDENTIAL_ENV`** (`apps/api/src/main.ts:51`). The §15 spec says the `.env.example` is single-sourced from `REQUIRED_CREDENTIAL_ENV`, and the drift-guard test correctly imports `REQUIRED_CREDENTIAL_ENV` from `registry.ts`. However, `main.ts` privately duplicates the same three-member list as `REQUIRED_SECRET_ENV` for `collectSecretValues`. The spec's "single-source" claim is accurate for the `.env.example` drift-guard (it does use `registry.ts`'s export), but the code has a secondary private duplicate. No security gap; both lists are identical at `['OPENROUTER_API_KEY', 'OPENAI_API_KEY', 'DATABASE_URL']`. Architecture-doc note only.

2. **§17 fallback-ladder wiring to production write-path/UI deferred (PD.5/PD.6)** — already noted in the spec's §17 status paragraph ("PD.4's production wiring is deferred to PD.5 (write-path) + PD.6 (UI)"). The ladder itself (`createFallbackLadder`) is built and unit-tested; the spec accurately describes the carry-forward. Not a finding.

### AMBIGUOUS

None.

---

## Summary

9 anchors audited. All stated behaviors verified in code or by green tests. 0 DRIFT findings. 2 STALE-DOC notes (both benign, accurately described in the spec itself or the code comment).

**VERDICT: CLEAR**
