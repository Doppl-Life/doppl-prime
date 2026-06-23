# PD Code-Quality Review

**Review surface:** Phase-D accumulated branch diff (`phase-d` vs `main`), over-approximating to the full demo-track diff (as noted in the phase-boundary policy — accepted over-approximation). Focus files as directed: `projections/reducers/winner.ts`, `test/integration/demo/{demo-e2e-smoke,config-boot-smoke,live-e2e-smoke}.test.ts`, `test/integration/_support/recorded-demo-gateway.ts`, `REQUIRED_CREDENTIAL_ENV`/`ENV_ALLOWLIST_VARS`/`BOOT_ORCHESTRATION_ENV` exports, `.env.example` + drift-guard test, `main.ts` gateway-selection and fallback-ladder + cap-override modules.

**Policy:** phase-boundary code-quality review (CLAUDE.md §8 "phase-boundary" gate).

---

## Findings

### [medium] `apps/api/src/main.ts:51` — `REQUIRED_SECRET_ENV` silently duplicates `REQUIRED_CREDENTIAL_ENV` (§5 single-source violation, rule #4 drift risk)

`REQUIRED_SECRET_ENV` is a **private** module-level constant in `main.ts` with the identical three-element tuple `['OPENROUTER_API_KEY', 'OPENAI_API_KEY', 'DATABASE_URL']` as the exported `REQUIRED_CREDENTIAL_ENV` in `model-gateway/registry.ts`. The two constants serve different purposes — `REQUIRED_CREDENTIAL_ENV` drives `assertProviderCredentials` (fail-fast presence check) while `REQUIRED_SECRET_ENV` feeds `collectSecretValues` (the redaction scrub `secretValues` list passed to `createEventStore`) — but their contents are identical and there is no import relationship between them.

**Drift scenario (rule #4 risk):** if a future slice adds a new required secret (e.g. `LANGFUSE_SECRET_KEY` when P2.8 wires Langfuse) to `REQUIRED_CREDENTIAL_ENV`, a maintainer updates that export, but forgets the private `REQUIRED_SECRET_ENV` in `main.ts` — the new secret's VALUE will never be added to the event-store scrub, silently breaking rule #4 at the persistence boundary without any test catching it. The reverse (extra entry in `REQUIRED_SECRET_ENV`) is benign (redacts more), but the forward direction is load-bearing.

**Recommended fix:** `main.ts` should import `REQUIRED_CREDENTIAL_ENV` from `./model-gateway/registry` and use it for `collectSecretValues`. The private constant can be deleted. The comment "The required secret env vars whose VALUES feed the persistence-boundary redaction scrub" becomes a doc-comment on `REQUIRED_CREDENTIAL_ENV` itself. This aligns with LESSON §5 (single-source) — no behavioral change, just removes the copy.

**Severity:** `medium` — real drift risk on the rule-#4 surface; currently no divergence, but structurally unsound.
**Action:** `fix-in-slice`

---

### [low] `apps/api/test/integration/demo/live-e2e-smoke.test.ts:113` — `recordedFixtureRows()` called at describe-body time; a missing fixture crashes with an opaque error instead of a clear skip/fail

In `live-e2e-smoke.test.ts`, line 113 (`const rows = recordedFixtureRows()`) is executed at **describe-body time**, outside any `beforeAll`/test function. If the committed fixture file is absent (fresh clone before the `capture:demo-fixture` command is run), the synchronous `readFileSync` throws before any test is registered, and Vitest surfaces a module-level crash rather than a named test failure. By contrast, `demo-e2e-smoke.test.ts` guards the missing-fixture case inside `beforeAll` with an `existsSync` check and a clear error message naming the re-record command.

The fixture IS committed in this branch (`fixtures/replay/demo-recorded-001.json`), so this does not break the current green state. The risk is to future contributors on a fresh checkout if the fixture is ever deleted and needs re-recording — the failure mode is cryptic rather than actionable.

**Recommended fix:** wrap the `recordedFixtureRows()` call in a `beforeAll` on the keyless describe, or add an `existsSync` guard + a `test.skipIf` at the top of the describe block matching the pattern in `demo-e2e-smoke.test.ts`. Low urgency given the fixture is committed.

**Severity:** `low` — no current breakage; poor failure mode on fixture-missing path only.
**Action:** `defer`

---

### [low] `apps/api/test/integration/demo/live-e2e-smoke.test.ts:34–38` — `hasLiveKeys()` checks only `OPENROUTER_API_KEY`; a run with only OpenRouter present (no `OPENAI_API_KEY`) will attempt to boot the live suite and fail at `assertProviderCredentials`

`hasLiveKeys()` gates the entire live suite on `OPENROUTER_API_KEY` alone. The comment acknowledges "OPENAI is optional (novelty degrades without it; the run still terminals)" — so this is a documented and intentional decision. However, `bootApp` internally calls `loadConfig` → `assertProviderCredentials`, which requires BOTH `OPENROUTER_API_KEY` AND `OPENAI_API_KEY` to be present. A CI environment with only one key set will skip the suite (correct if the missing key is `OPENROUTER_API_KEY`), but if only `OPENAI_API_KEY` is missing while `OPENROUTER_API_KEY` is present, the live suite will run, `bootApp` will throw at `assertProviderCredentials`, and the beforeAll will fail rather than skipping.

This is a bounded, informational-only finding — the assertion in LESSONS §94 explicitly documents that OPENAI is optional for the run itself, but `assertProviderCredentials` enforces it at boot regardless. The live gate and the boot fail-fast are inconsistent about whether OPENAI is required.

**Severity:** `low` — affects only the edge case where OPENROUTER is present but OPENAI is absent; the likely real-world usage (both keys present or neither) is unaffected.
**Action:** `defer`

---

### [low] `apps/api/src/runtime/demo/fallback-ladder.ts:60–73` — `descriptors` object is `Object.freeze`d per-rung but the outer `descriptors` record itself is not frozen

Each rung descriptor is individually `Object.freeze`d (`Object.freeze({ kind: 'low-cap-live', ... })`), but the containing `descriptors: Record<DemoRungKind, RungDescriptor>` is a plain `const` (not frozen). The `activeKind` mutable state is correctly isolated. Since `descriptors` is closed over inside the returned object and never exposed publicly, mutation from outside is not possible — this is a style/robustness observation, not a reachable bug.

**Severity:** `low` — no practical attack surface; purely a defensive coding style note.
**Action:** `defer`

---

### [low] `apps/api/test/unit/projections/winner.test.ts:44–53` — winner positive-test tightly couples to `validCandidateIdeaCrossDomain.id === 'cand_1'`; if the fixture id changes, the test silently passes for the wrong reason

The test creates a `candidate.created` row with `payload: scoredCandidate` (which spreads `validCandidateIdeaCrossDomain` and has `id: 'cand_1'`), then issues a `run.completed` with `finalIdeaRef: 'cand_1'` hardcoded as a literal. The test then checks `state.candidateIdeas['cand_1']`. This works correctly today because `validCandidateIdeaCrossDomain.id` is `'cand_1'`.

If the fixture's `id` field changes (a contracts amendment), the test will continue to pass — the candidate will be keyed under a new id and `run.completed.finalIdeaRef: 'cand_1'` will hit the non-materialized-candidate no-op path (the fourth test case), returning `'scored'` silently — but the test asserts `state.candidateIdeas['cand_1']?.status` which would be `undefined`, causing the test to fail with `undefined !== 'selected'`. So actually the test WOULD fail on a fixture id change, but the error message would be misleading (`expected undefined to be 'selected'`).

The cleaner form would use `scoredCandidate.id` (or `validCandidateIdeaCrossDomain.id`) as the `finalIdeaRef` literal rather than a magic string. Not a correctness bug in the current codebase.

**Severity:** `low` — no current bug; a future fixture id change would produce a failing (not silently passing) test, but with an unclear message.
**Action:** `defer`

---

## Summary

5 findings total: 0 high / 1 medium / 4 low.

The **single medium finding** is the `REQUIRED_SECRET_ENV` / `REQUIRED_CREDENTIAL_ENV` duplication in `main.ts:51` — identical three-element tuples serving different purposes with no import relationship, creating a rule-#4 drift risk if the credential list grows. All four low findings are style/robustness observations with no current breakage.

No correctness bugs found in the winner reducer, the fallback ladder, the cap-override helper, the drift-guard test, or the e2e smoke test logic. The `winnerReducer` correctly appends last to REDUCERS, reads `finalIdeaRef` from the payload defensively, is idempotent across re-folds, and tests cover positive / no-finalIdeaRef / run.failed / ghost-ref / selectivity / multi-candidate / idempotency cases. The `BOOT_ORCHESTRATION_ENV` constant is correctly single-sourced and complete against all `env.<VAR>` reads in `main.ts`. The drift-guard test correctly guards both directions (missing var AND extra var) and uses the load-bearing PLACEHOLDER-POSITIVE assertion per LESSON §95 with a non-vacuous positive guard (LESSON §10). The live-e2e gate is correctly `describe.skipIf(!hasLiveKeys())` and the keyless invariant-mirror tests run in CI.
