# /tdd brief — event_store_redaction_scrub

## Feature
The event-store secret-redaction scrub that runs on every payload **before append** (key safety rule #4): it composes the frozen `scrubSecrets` from `@doppl/contracts` (key-format + key-name + secret-key layers) and adds the **env-value layer** (human-ratified Option A, §14) — redacting any payload string that contains a loaded `process.env` secret *value* — so an over-persisted raw model output or a non-pattern secret (e.g. a DB password) cannot leak into the authoritative log (RISK-006/009). Pure (secrets injected, not read here), deep, idempotent, structure-preserving.

## Use case + traceability
- **Task ID:** P1.2 (event-store write-boundary safety pin — the env-value layer the pure contracts package deliberately cannot host)
- **Architecture sections it implements:** `ARCHITECTURE.md §14` (secret redaction at the persistence boundary — key-format + key-name in the frozen scrub, env-value layer at the boundary where env loads), `ARCHITECTURE.md §9` (the event-store persistence boundary this runs at)
- **Related context:** the frozen `scrubSecrets(payload)` + `REDACTION_PLACEHOLDER` live in `@doppl/contracts` (`src/security/redaction.ts`, P0.2) — it implements the key-format/key-name/secret-key layers and is pure/idempotent/deep/non-mutating. LESSONS 3 (redaction design) + LESSONS 4 (contracts are pure — env-value matching lands at the boundary, not the frozen package) + LESSONS 5 (a shared symbol is imported, never reimplemented). Carry-forward "§14 env-VALUE redaction (ratified Option A)" is folded in here. Bootstrap (`1c301b1`) + P2.1 (`171fe23`) landed; `apps/api` builds + runs Vitest. **Module path:** the plan lists `apps/api/event-store/redaction.ts`; the landed layout + area `CLAUDE.md` "Module organization" use `apps/api/src/event-store/` — this brief uses `src/`.

## Acceptance criteria (what "done" means)
- [ ] A single scrub function (e.g. `scrubEventPayload(payload, secretValues)`) **composes the frozen `scrubSecrets`** (imported from `@doppl/contracts`, NOT reimplemented — single-source, LESSONS 5) for the key-format + key-name + secret-key layers
- [ ] **Env-value layer:** any payload string containing a loaded secret *value* (deep — nested objects, arrays, **object KEYS**, and inline raw/normalized provider outputs) is redacted to `REDACTION_PLACEHOLDER`, catching secrets that match no key-format pattern and sit under no sensitive key-name. **Keys ARE in scope:** `RunEventEnvelope.payload` is an open-key `z.record(z.string(), z.unknown())` (and `GENERIC_PAYLOAD_SCHEMA` for the 30/36 non-high-traffic event types is the same), so producer-controlled keys reach the append path — a non-format secret used as a key would otherwise leak. Redacting a secret in a key uses a de-collision suffix (`#2`, …) — implemented in the P1.2 code mirroring the frozen scrub's shape (the frozen scrub is immutable) — so two keys redacting alike don't collapse (no LESSONS-3 data-loss). _(CORRECTED at Step 8: the security-reviewer overturned the initial values-only scope I blessed at Step 2.5 with verified evidence of a key-leak — see the kernel-003 Step-8 Finding; this is a [high] rule-#4 finding, fixed in-slice.)_
- [ ] **Empty/short secret-value guard:** blank or too-short entries in `secretValues` are filtered out before matching, so a missing/blank env var can NEVER turn every payload string into `[REDACTED]` (a catastrophic over-redaction — `''.includes` matches everywhere; see Step-2.5 Q2 for the threshold)
- [ ] **Pure:** the function reads NO `process.env` itself — secret values are passed in (IO at the boundary, LESSONS 4); calling it with `[]` secrets yields exactly the frozen-`scrubSecrets` result
- [ ] **Idempotent:** `scrub(scrub(x, s), s)` deep-equals `scrub(x, s)` (re-scrub is a no-op; `REDACTION_PLACEHOLDER` matches no secret)
- [ ] **Structure-preserving, non-mutating, normal-prototype output** (returns a deep copy; never mutates the input) — same posture as the frozen scrub
- [ ] **No corruption of legitimate prose:** a string that merely shares a short common substring with non-secret text is untouched — only occurrences of an actual (length-gated) secret value are redacted
- [ ] Exported from `apps/api/src/event-store/` so the append-only writer (P1.3) calls it before insert
- [ ] `/preflight` clean; **security-reviewer fan-out at Step 8** (this is an invariant slice)

## Wiring / entry point (Step 7.5)
`none — first consumer is P1.3` (the append-only writer calls `scrubEventPayload` before every insert, supplying the boot-loaded secret values). This slice delivers + unit-proves the function (incl. that it redacts a loaded-env secret value); the **reachability that the env-value scrub runs on the real before-append path** is pinned in P1.3 per the carry-forward (the append path doesn't exist yet). The observability/Langfuse env-value layer is **P6.5 (demo track)** — out of scope here (do NOT touch `packages/observability`).

## Files expected to touch
**New:**
- `apps/api/src/event-store/redaction.ts` — `scrubEventPayload(payload, secretValues)` composing frozen `scrubSecrets` + the env-value layer
- `apps/api/test/unit/event-store/redaction.test.ts`

**Modified:**
- none. (The plan's `packages/observability/src/redaction.ts` is **cross-track → demo P6.5**, not this slice — dropped. The "shared" key-format/key-name layer is already shared via the frozen `@doppl/contracts` `scrubSecrets`; the env-value layer is boundary-local by necessity since the frozen package is pure/IO-free — see Step-2.5 Q1 + the architecture-note candidate.)

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)
Tests in `apps/api/test/unit/event-store/redaction.test.ts`:

1. **`test_composes_frozen_scrub_layers`** — a payload with an `sk-…` value, a `Bearer …` header, and a value under a sensitive key-name is redacted.
   - Asserts: output equals applying frozen `scrubSecrets` then the env-value pass (composition, not reimplementation).
   - Why: §14 key-format/key-name via the frozen scrub (LESSONS 5 single-source).
2. **`test_env_value_layer_redacts_loaded_secret`** — a payload string containing a loaded secret *value* that matches NO key-format pattern and sits under NO sensitive key (e.g. a random DB password) is redacted to `REDACTION_PLACEHOLDER`.
   - Asserts: the secret value does not survive anywhere in the output.
   - Why: §14 env-value layer (RISK-006/009) — the defense-in-depth net.
3. **`test_env_value_deep_in_nested_objects_and_arrays`** — the secret value nested inside arrays / nested objects / an inline raw-output blob is redacted.
   - Asserts: no occurrence of the secret value at any depth.
   - Why: §14 deep scrub over JSONB incl. inline provider outputs.
4. **`test_empty_or_short_secret_value_does_not_over_redact`** — `secretValues` containing `''` / a too-short token does NOT redact ordinary payload strings.
   - Asserts: a normal payload is returned unchanged (modulo the frozen layers) when the only "secret" is blank/short.
   - Why: catastrophic-over-redaction guard (the single most dangerous failure mode of an env-value matcher).
5. **`test_idempotent`** — `scrub(scrub(x, s), s)` deep-equals `scrub(x, s)`.
   - Why: LESSONS 3 idempotency (output IS the persisted truth; re-scrub must be a no-op).
6. **`test_pure_no_env_read`** — with `secretValues = []` the output equals frozen `scrubSecrets(x)`; the function references no `process.env`.
   - Why: LESSONS 4 (IO at the boundary; pure over loaded sources).
7. **`test_non_secret_prose_preserved`** — a payload string sharing a short common substring with a secret (but not the full length-gated value) is untouched.
   - Why: LESSONS 3 no-corruption (a false-positive is permanent in the append-only log).

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** none (consumes frozen `scrubSecrets`/`REDACTION_PLACEHOLDER`; no Appendix-A model touched).
- **Orchestrator doc rows to write hot (Step 9 routing):** an **architecture-doc-note candidate** — §14 already says the env-value layer is "applied at the boundary where env loads"; if the implementation makes the *boundary-local (not shared)* nature of the env-value layer worth pinning (the frozen package can't host it, so event-store P1.2 and observability P6.5 each implement it over the shared frozen scrub), flag it and I'll add a one-line §14 clarification. Likely a **LESSONS** addition (the boundary half of the redaction lesson 3) rather than a model change.
- **Shared-contract seam model touched?** No — imports the frozen scrub, redefines nothing; no schema-snapshot added here.

## Things to flag at Step 2.5
1. **Secret-value source: injected vs env-read.** `scrubEventPayload(payload, secretValues)` (boot loads `process.env` secrets and passes them) vs the function reading `process.env` itself. My default vote: **injected `secretValues`** — keeps the function pure + unit-testable and matches LESSONS 4 (IO at the boundary). The append path (P1.3) loads the env secrets once and passes them.
2. **Empty/short secret-value threshold.** A blank or 1–2-char secret value would over-redact catastrophically. My default vote: **filter out empty + below a minimum length** before matching (mirror the frozen scrub's length-gating philosophy, LESSONS 3) — propose a threshold of **≥ 8 chars** (real provider keys / DB creds far exceed it; tune if a legitimately short secret type exists). Flag the exact number at Step 2.5.
3. **Layer order.** My default vote: **frozen `scrubSecrets` first (deep), then the env-value pass on its result** — env-value is the defense-in-depth net for secrets the key-format/key-name layers missed; running it last means it also catches a secret value sitting in an otherwise-untouched string.
4. **Env-value match mode: substring vs whole-string.** A secret can be embedded in a larger string (a logged URL `…?key=<secret>&…`). My default vote: **substring global-replace of each exact secret value** (like the frozen value-pattern approach) so an embedded secret is caught, not just a whole-string equality.

## Dependencies + sequencing
- **Depends on:** frozen `@doppl/contracts` `scrubSecrets`/`REDACTION_PLACEHOLDER` (P0.2); bootstrap `kernel-001` (`1c301b1`). Independent of P2.1.
- **Blocks:** P1.3 (the append-only writer calls this before insert) and, by pattern, P6.5 (demo track's observability env-value layer mirrors this shape over the same frozen scrub).

## Estimated commit count
**1.** Safety-invariant slice (key safety rule #4 — redaction at the persistence boundary). Gets its OWN commit, never bundled; **security-reviewer fan-out at Step 8** (invariant policy).

## Lessons-logged candidates anticipated
- **Convention candidate** — "the env-value redaction layer is boundary-local (it needs loaded `process.env`, which the pure frozen package can't host): each persistence boundary (event-store P1.2, observability P6.5) composes the frozen `scrubSecrets` + a local env-value pass that takes injected secret values; guard against empty/short secret values to avoid catastrophic over-redaction." (Likely extends LESSONS 3.)
- **Architecture-doc note candidate** — a one-line §14 clarification that the env-value layer is boundary-local-over-the-shared-frozen-scrub, if the implementer judges it adds clarity.

## How to invoke
1. **Read this brief end-to-end** — note the safety-invariant posture (own commit + Step-8 security-reviewer).
2. **Run `/tdd event_store_redaction_scrub`.**
3. **Step 0 (Restate)** — confirm the restatement matches the Feature line.
4. **Step 2.5** — answer the 4 design questions (esp. Q2 the over-redaction guard), send the Step-2.5 write-up.
5. **Step 8** — dispatch `security-reviewer` on the slice diff (invariant policy).
6. **Step 9** — surface the lesson candidate + any §14 note.
