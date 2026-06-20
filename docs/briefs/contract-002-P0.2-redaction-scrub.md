# /tdd brief — secret_redaction_scrub

## Feature
A single **pure** secret-redaction scrub function in `packages/contracts` that, given any event-payload object, returns a structurally-equivalent deep copy with provider keys / Authorization headers / values under sensitive key-names redacted to a stable placeholder — idempotent, structure-preserving, and guaranteeing no covered secret appears anywhere in its output. This is the one scrub the event-store runs **before append** and observability runs **before Langfuse emit** (wiring lands downstream).

## Use case + traceability
- **Task ID:** P0.2
- **Architecture sections it implements:** `ARCHITECTURE.md §14` (secret redaction at the persistence boundary — "a single scrub function runs in event-store on every payload before append, and in observability before Langfuse emit").
- **Related context:** **KEY SAFETY RULE #4** — secrets/provider keys never enter prompts, event payloads, Langfuse traces, or UI payloads; the redaction scrub runs at the persistence boundary (before append AND before Langfuse emit). REQ-S-004; closes RISK-006/009 (over-persisted raw model outputs). THREAT_MODEL T-… secret-leak class. This is a **safety-invariant slice** — its own brief, its own commit, never bundled (root `CLAUDE.md` / brief-template pitfall "Bundling a safety-invariant slice").

## Acceptance criteria (what "done" means)
- [ ] Exports a single pure function (default name `scrubSecrets(payload: unknown): unknown`) from the `@doppl/contracts` barrel; it returns a redacted **deep copy** and does **not** mutate its input.
- [ ] Redacts a string value when it matches a **provider-key format** — at minimum the OpenAI/OpenRouter/Anthropic family prefixes (`sk-`, `sk-or-`, `sk-ant-`, …) and bearer/basic credentials (`Bearer <token>`, `Basic <base64>`). (§14 pattern-based over key formats / Authorization headers.)
- [ ] Redacts the value under a **sensitive key-name** (case-insensitive contains-match over a defined set: `authorization`, `api_key`/`apiKey`, `secret`, `token`, `access_token`, `client_secret`, `password`) regardless of the value's format. (§14 — env-value formats + Authorization headers.)
- [ ] **Recurses** arbitrarily nested objects AND arrays; a secret at any depth is redacted.
- [ ] **Idempotent:** `scrubSecrets(scrubSecrets(x))` deep-equals `scrubSecrets(x)`, and a second pass never reintroduces a secret. (§14 — the placeholder itself is never treated as a secret.)
- [ ] **Structure-preserving:** non-secret keys and values are byte-identical to the input; no key is dropped, added, or reordered; array lengths/order preserved.
- [ ] Exports a stable `REDACTION_PLACEHOLDER` constant; every redacted position holds exactly that token (so snapshot/contract tests assert against it).
- [ ] Non-string leaves (number, boolean, null) pass through untouched (a provider key is always a string).
- [ ] **SAFETY INVARIANT (the load-bearing bullet):** for a corpus of secret-bearing payloads (planted secret at top level, nested, in an array, under a sensitive key, embedded mid-string), the planted secret string appears **nowhere** in `JSON.stringify(scrubSecrets(payload))`. (REQ-S-004 / RISK-006/009.)
- [ ] All unit tests in `packages/contracts/test/security/` pass; `/preflight` clean; **security-reviewer run** (invariant policy — this slice touches a safety invariant).

## Wiring / entry point (Step 7.5)
Entry point = the `@doppl/contracts` barrel export `scrubSecrets` + `REDACTION_PLACEHOLDER`. The scrub is a **shared safety utility** consumed across subsystems — the event-store calls it before every `run_events` append (P1), and the observability adapter calls it before every Langfuse emit (P1/demo). `none — runtime wiring (call-before-append + call-before-Langfuse-emit) lands in P1 (event-store) and the observability adapter`. Reachability for this slice = exported from the barrel + exercised by the safety-corpus test; the two call-sites are reachability acceptance bullets in their own downstream slices.

## Files expected to touch
**New:**
- `packages/contracts/src/security/redaction.ts` — `scrubSecrets` + `REDACTION_PLACEHOLDER` + the sensitive-key set / provider-key patterns.
- `packages/contracts/test/security/redaction.test.ts`

**Modified:**
- `packages/contracts/src/index.ts` — re-export `scrubSecrets` + `REDACTION_PLACEHOLDER`.

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)
Tests in `packages/contracts/test/security/redaction.test.ts`:

1. **`redacts_provider_key_value`** *(spec §14)* — Asserts: a value `sk-or-abc123…` (and `sk-`, `sk-ant-`) becomes the placeholder. Why: §14 provider-key formats.
2. **`redacts_authorization_header_value`** — Asserts: `Bearer <token>` / `Basic <b64>` values are redacted. Why: §14 Authorization headers.
3. **`redacts_value_under_sensitive_key_name`** — Asserts: values under `apiKey`/`Authorization`/`secret`/`token`/`password` (case-insensitive) are redacted even when the value has no recognizable format. Why: §14 key-name coverage.
4. **`recurses_nested_objects_and_arrays`** — Asserts: a secret nested in `a.b[2].apiKey` is redacted. Why: §14 "arbitrary nested payload objects."
5. **`idempotent_double_scrub`** — Asserts: `scrub(scrub(x))` deep-equals `scrub(x)`; the placeholder is not itself redacted again. Why: §14 idempotence bullet.
6. **`structure_preserving_non_secret_untouched`** — Asserts: non-secret keys/values + array order are identical to input. Why: P0.2 "does not drop or reorder legitimate keys."
7. **`does_not_mutate_input`** — Asserts: the input object is deep-equal to its pre-call snapshot after `scrubSecrets` runs. Why: pure-function contract.
8. **`placeholder_is_the_exported_constant`** — Asserts: redacted positions === `REDACTION_PLACEHOLDER`. Why: P0.2 stable-token bullet.
9. **`non_string_leaves_passthrough`** — Asserts: numbers/booleans/null are returned unchanged. Why: secrets are strings.
10. **`no_secret_in_output_corpus`** *(spec §14 — SAFETY)* — Asserts: across a corpus (top-level, nested, in-array, sensitive-key, mid-string-embedded), the planted secret appears nowhere in `JSON.stringify(output)`. Why: KEY SAFETY RULE #4 / REQ-S-004 / RISK-006/009.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** none — the scrub is a §14 mechanism (a function), not an Appendix-A model. P0.2 task says `Cross-doc invariant: none`.
- **§2.5-seam model touched?** No model → **no schema-snapshot test required.** But the function is a cross-subsystem shared utility (event-store + observability consume it), so its **signature + placeholder constant are a frozen contract** — keep them stable after this freeze; a later signature change is a cross-track Finding.
- **Orchestrator doc rows to write hot:** none required. **Optional Architecture-doc note:** name `scrubSecrets` + `REDACTION_PLACEHOLDER` in §14 for traceability (flag at Step 9; I'll decide).

## Things to flag at Step 2.5
1. **Redaction strategy — value-pattern, key-name, or both.** My default vote: **both** (defense in depth). A secret can appear as a recognizable value anywhere (pattern catches it) OR under a known sensitive key in an unusual format (key-name catches it). Either alone leaves a hole.
2. **Match granularity — whole-value vs substring.** My default vote: **substring for value-pattern matches** (a free-text field "key is sk-abc" → only `sk-abc` becomes the placeholder, preserving surrounding text) **+ whole-value for sensitive-key matches** (the entire value under `apiKey` is replaced). Guarantees the safety invariant without nuking legitimate context.
3. **Sensitive key-name set + match mode.** My default vote: **case-insensitive contains-match** over `{authorization, api_key, apiKey, secret, token, access_token, client_secret, password}`. Flag if you'd narrow/widen the set — err toward over-redaction (a false-positive redaction is safe; a missed secret is not).
4. **Placeholder token value.** My default vote: **`"[REDACTED]"`** exported as `REDACTION_PLACEHOLDER`. Must be a value that does not itself match any secret pattern (preserves idempotence).
5. **Recursion bounds / cycles.** My default vote: **full recursion over objects + arrays, no depth cap** — event payloads are acyclic JSON (JSONB), so no cycle guard needed; if you add a defensive depth cap, make it generous and flag it. (Payload size/depth ceilings are a separate downstream concern — carry-forward item for P0.10/P1.)
6. **Function name + signature.** My default vote: **`scrubSecrets(payload: unknown): unknown`** (accepts any JSON value; returns the same shape). Flag if you prefer a generic `<T>(x: T): T` — but `unknown→unknown` better signals "shape may change (redaction)."

## Dependencies + sequencing
- **Depends on:** none (independent of P0.1; uses no other contract).
- **Blocks:** P1 event-store append path (must call `scrubSecrets` before every append) and the observability/Langfuse adapter (before every emit). Both wire to this function.

## Estimated commit count
**1 — SAFETY-CRITICAL pin (key safety rule #4).** Gets its OWN commit, never bundled (brief-template pitfall "Bundling a safety-invariant slice"). Commit: `feat(contracts): secret-redaction scrub at persistence boundary (P0.2)`.

## Lessons-logged candidates anticipated
- **Convention candidate** — "Redaction is value-pattern + key-name (substring for patterns, whole-value for sensitive keys), idempotent + structure-preserving + non-mutating; over-redact rather than miss a secret."
- **Architecture-doc note candidate** — name `scrubSecrets` + `REDACTION_PLACEHOLDER` in §14 so the two downstream call-sites (event-store append, Langfuse emit) reference the canonical function.
- **Future TODO — operational** — the two call-sites are reachability bullets for P1 (event-store) + the observability adapter; ensure each downstream brief pins "calls scrubSecrets before the boundary."

## How to invoke
1. **Read this brief end-to-end** (the session is already oriented from P0.1 — no `/session-start` needed). Don't skip "Things to flag at Step 2.5".
2. **Run `/tdd secret_redaction_scrub`.**
3. **Step 0/1** — confirm the restatement + file list (note: safety slice, own commit).
4. **Step 2.5** — send the test-design write-up + answers to the 6 questions (the safety-corpus test #10 is the load-bearing one — show its corpus). Wait for `APPROVED.`/`TWEAK:`/`ADD:`.
5. **Step 8** — run the **security-reviewer** (invariant policy) over the slice diff; fold findings into Step 9.
6. **Step 9** — categorized flags + ship-ask.
