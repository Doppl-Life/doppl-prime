# /tdd brief — scrub_numeric_providermeta_fix

## Feature
Fix the frozen P0.2 `scrubSecrets` over-redaction of NUMERIC values under sensitive key-names: a number/
boolean value under a sensitive key (e.g. `ProviderMeta.tokensIn`/`tokensOut`, which contain the substring
"token") is currently whole-redacted to the STRING `'[REDACTED]'`, corrupting the integer → the persisted
payload fails its frozen contract's `safeParse` on read → **rule-#7 replay break + authoritative-log
corruption.** The fix: redact a sensitive-key value UNLESS it is a number/boolean (never a credential),
preserving whole-redaction for strings AND objects/arrays. **SOLO safety-invariant (rule #4 — the
persistence-boundary secret scrub); security-reviewer MANDATORY.** A P0.2 frozen-contract amendment authored
on the verifier track per the user's explicit Option-B call (provenance note below — for contract-track
snapshot reconciliation traceability).

## Use case + traceability
- **Task ID:** P4.8 (the scrub fix that unblocks the P4.8 `judge.reviewed` persistence — a frozen-scrub numeric-value amendment surfaced by the verifier-010 reconcile, user-approved Option B; brief `verifier-011`)
- **Architecture sections it implements:** `ARCHITECTURE.md §14` (KEY SAFETY RULE #4 — secret redaction at the persistence boundary; the scrub output IS the persisted truth, so it must never leak a secret AND never corrupt a legitimate value), `§9`/`§4` (the persisted payload must round-trip its frozen contract — rule #7 replay).
- **Related context — the bug (confirmed in `redaction.ts`):**
  - `SENSITIVE_KEY_FRAGMENTS` includes `'token'` (line 38); `isSensitiveKey` is case-insensitive `includes` (line 46) → `tokensIn`/`tokensOut` match. Line 88: `isSensitiveKey(key) ? REDACTION_PLACEHOLDER : scrubValue(child)` whole-redacts **regardless of value type** → `tokensIn:1200` (number) → `'[REDACTED]'` (string).
  - Surfaced by verifier-010 (`judge.reviewed`←`JudgeResult` — the FIRST event to persist a `ProviderMeta` in a payload): the persisted `providerMeta.tokensIn/tokensOut` become strings → `JudgeResult.safeParse` fails on read (`z.int()` got a string). The append SUCCEEDS (the payload-map narrows the PRE-scrub payload; the scrub runs after) → SILENT corruption. Will ALSO hit `energy.spent`←`EnergyEvent` (`providerMeta?`) at kernel P3 (lead owns that cross-track routing).
  - **The fix (vetted shape — NOT the naive typeof-string variant, which weakens object redaction):** line 88 →
    `isSensitiveKey(key) && typeof child !== 'number' && typeof child !== 'boolean' ? REDACTION_PLACEHOLDER : scrubValue(child)`.
    A credential is ALWAYS a string; a number/boolean is never one. This passes numbers/booleans through (`tokensIn:1200`→`1200`) while keeping whole-redaction for strings AND objects/arrays (no weakening).
  - **The existing suite is the no-weakening guardrail:** `redaction.test.ts` already has `sensitive_key_with_structured_value_fully_redacted` (object/array under a sensitive key → whole `[REDACTED]`) + `no_secret_in_output_corpus` (a format-less blob under `secret` doesn't leak) + `redacts_value_under_sensitive_key_name` (string under a sensitive key → redacted). The fix MUST keep all of these green (it does — only numbers/booleans change). NO existing test asserts a *numeric* value under a sensitive key is redacted, so the fix breaks nothing — it only fixes the untested bug.

## Acceptance criteria (what "done" means)
- [ ] A NUMBER or BOOLEAN value under a sensitive key passes through unchanged: `scrubSecrets({ tokensIn: 1200, tokensOut: 5, flag: true })` (all under "token"/sensitive-matching or not) → the numbers/booleans are preserved (not `'[REDACTED]'`).
- [ ] A full `ProviderMeta` round-trips through `scrubSecrets`: `tokensIn`/`tokensOut` stay integers; the result `ProviderMeta.safeParse`s. (And string credential fields — if any — still redact, but `ProviderMeta` has no credential field by §14 design.)
- [ ] **No redaction weakening — all existing `redaction.test.ts` cases stay GREEN**, specifically: a STRING under a sensitive key still → `'[REDACTED]'`; an OBJECT/ARRAY under a sensitive key still → whole `'[REDACTED]'` (the `sensitive_key_with_structured_value_fully_redacted` + `no_secret_in_output_corpus` guardrails); value-pattern + nested-secret + de-collision + idempotency all unchanged.
- [ ] **Round-trip through the real append path (rule #7):** a `ProviderMeta`-carrying event (`judge.reviewed`←`JudgeResult`) scrub→append→read round-trips — the persisted payload `safeParse`s with `tokensIn`/`tokensOut` intact (this is verifier-010's 2 integration tests — they go GREEN on this fix; verify them here).
- [ ] **Cheap-insurance cross-check (lead-requested):** confirm `critic.reviewed`←`CriticReview` round-trips too. (`CriticReview` has NO `ProviderMeta` field — provider correlation rides the envelope `correlationId`, a string — so it is structurally unaffected; add/confirm an assertion that its persisted payload `safeParse`s.)
- [ ] Re-record any redaction/contract-surface snapshot ONLY if the suite flags a change (the scrub's signature + `REDACTION_PLACEHOLDER` are unchanged → likely none; the change is behavioral, covered by the new + existing behavioral tests).
- [ ] Full suite green: contracts (175 + the new numeric-passthrough case) + apps/api (138 unit / 37 integration incl. verifier-010's 2 now-green `judge.reviewed` cases); `/preflight` clean.

## Wiring / entry point (Step 7.5)
**none new — `scrubSecrets` is already wired** at the persistence boundary: the event-store append path (P1.3 `append.ts`) runs it before every insert, and observability runs it before Langfuse emit (downstream). This slice changes the scrub's behavior for numeric-under-sensitive-key only; the wiring is unchanged. Confirm at Step 7.5: the round-trip integration (scrub→append→read) exercises the REAL append path (testcontainers PG), not a mock.

## Files expected to touch
**Modified:**
- `packages/contracts/src/security/redaction.ts` — line ~88: the number/boolean guard (the vetted shape above). Update the function/doc-comment (the "redacts its ENTIRE value regardless of type" line → "…regardless of type EXCEPT numbers/booleans, which are never credentials and must round-trip their contract type").
- `packages/contracts/test/security/redaction.test.ts` — ADD a `numeric_value_under_sensitive_key_passes_through` case (+ a `ProviderMeta` round-trip); the existing cases stay (they're the no-weakening guardrail — do NOT relax them).
- `apps/api/test/integration/verifier/judge/run-judge.test.ts` — verifier-010's 2 `judge.reviewed` integration tests go green on this fix (already authored; confirm + keep).

**New:** none.

> **Provenance (for the re-seal commit + session doc):** this is a **P0.2 frozen-contract amendment authored on the verifier track per the user's explicit Option-B call** (the bug surfaced mid-verifier-010-reconcile; the user chose to fix in-worktree rather than route to the contract track). The contract-track snapshot reconciliation is the integration owner's at the verifier→cody merge — note this in the commit so it's traceable. The cross-track kernel routing (`energy.spent` hits the same bug) is the lead's at the merge — NOT this slice.

## RED test outline
**Contract unit (`redaction.test.ts`)** — ADD (RED on the current code):
1. **`numeric_value_under_sensitive_key_passes_through`** — Asserts: `scrubSecrets({ tokensIn: 1200, tokensOut: 5, count: 7 })` → `{ tokensIn: 1200, tokensOut: 5, count: 7 }` (numbers preserved, NOT `'[REDACTED]'`). Positive guard first (lesson 10). Why: §14 the scrub must not corrupt a legitimate numeric value (the bug). FAILS on current code (redacted to string), passes with the fix.
2. **`boolean_value_under_sensitive_key_passes_through`** — Asserts: `scrubSecrets({ secret_flag: true })` → `{ secret_flag: true }`. Why: §14 (booleans are never credentials).
3. **`provider_meta_round_trips_through_scrub`** — Asserts: a valid `ProviderMeta` (validProviderMeta from fixtures) through `scrubSecrets` → `ProviderMeta.safeParse`s with `tokensIn`/`tokensOut` intact. Why: §14/§9 rule #7.
**No-weakening (existing — MUST stay green; cite as the guardrail, don't author anew):** `sensitive_key_with_structured_value_fully_redacted` (object/array under sensitive → whole redacted) · `no_secret_in_output_corpus` (format-less blob under `secret` doesn't leak) · `redacts_value_under_sensitive_key_name` (string under sensitive → redacted).

**Integration (real PG)** — verifier-010's existing `run-judge.test.ts`:
4. **(verifier-010's i5/i6)** `judge.reviewed`←`JudgeResult` scrub→append→read: the persisted payload `JudgeResult.safeParse`s with `providerMeta.tokensIn`/`tokensOut` as integers. Go GREEN on this fix.
5. **`critic_reviewed_round_trips`** (cheap insurance) — Asserts: a persisted `critic.reviewed` payload `CriticReview.safeParse`s (no `ProviderMeta`, structurally unaffected — confirm).

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** **none** — `ProviderMeta`/`JudgeResult` schemas UNCHANGED. The fix is a BEHAVIORAL change to the `scrubSecrets` function (not a schema). No Appendix-A change; no schemaVersion bump.
- **Cross-doc invariant change:** the `scrubSecrets` behavioral contract is refined (numeric/boolean values under sensitive keys now round-trip). If the `apps/api/CLAUDE.md` lessons index / cross-doc table references the scrub's "redacts entire value regardless of type" wording, I (orchestrator) update it hot at Step 9. Flag it.
- **Orchestrator doc rows (Step 9 — flag, I write):** a possible lesson on "a type-blind whole-value redaction corrupts non-string fields whose key merely contains a sensitive substring — redact unless number/boolean; the existing structured-value-redaction tests are the no-weakening guardrail." I'll decide lesson-worthiness at Step 9.

## Things to flag at Step 2.5
1. **The guard shape — number/boolean only (NOT typeof-string).** Confirm the vetted shape: `isSensitiveKey(key) && typeof child !== 'number' && typeof child !== 'boolean' ? PLACEHOLDER : scrubValue(child)`. (The typeof-string variant weakens object redaction — it would break `sensitive_key_with_structured_value_fully_redacted`; do NOT use it.) My default: the number/boolean guard.
2. **`null`/`undefined`/`bigint` under a sensitive key.** My default: pass through (`scrubValue` already returns them as-is; none is a credential). `null` under `secret` → `null` (a JSON-plain payload won't carry undefined/bigint). Confirm the guard doesn't accidentally redact `null` (it won't — `typeof null === 'object'`, so `null` would hit the PLACEHOLDER branch… **flag:** guard `null` too, or rely on `scrubValue(null)` → null? Decide: add `child !== null` to the pass-through, OR accept `null`-under-sensitive → `[REDACTED]` as harmless. My lean: it's harmless to redact a `null` under a sensitive key, but cleaner to pass it through — your call, minor.)
3. **Doc-comment wording.** Update the "redacts its ENTIRE value regardless of type" comment (lines ~10–11 + ~84) to reflect the number/boolean carve-out. My default: yes, update both.

## Dependencies + sequencing
- **Depends on:** the frozen `scrubSecrets` (P0.2, in-worktree) + `ProviderMeta` (P0.9) + the P1.3 append path. **Sequencing:** this slice (verifier-011) lands FIRST (the scrub fix) — then **verifier-010's 2 integration tests go green on top** (no new verifier-010 code; just re-run them). Two commits in the re-seal: verifier-011 (scrub fix, solo) THEN verifier-010 (reconciliation, now fully green).
- **Blocks:** verifier-010's full-green seal; (cross-track) kernel `energy.spent` persistence (lead routes).

## Estimated commit count
**1** (this scrub-fix slice; verifier-010's reconciliation is its own separate commit). SOLO safety-invariant (rule #4 — the secret-redaction scrub IS a load-bearing safety rail). **security-reviewer MANDATORY** — confirm: NO redaction weakening (strings/objects/arrays under sensitive keys still whole-redact — the existing corpus guardrail stays green); numbers/booleans pass through; the scrub stays pure/idempotent.

## Lessons-logged candidates anticipated
- **Convention candidate** — "a type-blind whole-value redaction (sensitive-key → placeholder regardless of type) CORRUPTS a non-string field whose key merely CONTAINS a sensitive substring (`tokensIn` matches `'token'`) — redact a sensitive-key value UNLESS it is number/boolean (never a credential); keep whole-redaction for strings/objects/arrays; the structured-value-redaction tests are the no-weakening guardrail." Flag at Step 9; I'll decide.
- **Architecture-doc note candidate** — §14: the scrub redacts sensitive-key values of every type EXCEPT number/boolean (which round-trip their contract type). I write it if it adds consumer-facing detail.

## How to invoke
1. **Read this brief end-to-end** (session continues — no `/session-start`). The vetted guard shape is in Q1; don't use the typeof-string variant.
2. **Run `/tdd scrub_numeric_providermeta_fix`.** This lands FIRST; then re-run verifier-010's integration (goes green).
3. **Step 0/1** — confirm Feature + file list (P0.2 amendment per user Option-B; provenance note).
4. **Step 2.5** — answer the 3 design questions; ping the orchestrator before GREEN.
5. **Step 9** — flag the scrub-behavior cross-doc note + any lesson. **security-reviewer MANDATORY (rule #4 — confirm no weakening).**
