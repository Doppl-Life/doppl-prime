# /tdd brief — canonicalize_tojson_once_and_append_error_no_value_echo

## Feature
Two fast-follow hardening fixes in the event-store (phase-exit P1 code-quality findings), bundled into one `fix(event-store)` slice:
1. **`canonicalize` calls `toJSON` exactly once per slot** (matches `JSON.stringify`) — it currently re-enters itself on the `toJSON()` result, so a `toJSON` returning a `toJSON`-bearing object invokes `toJSON` twice, diverging from the documented `JSON.stringify`-equivalence the state-equivalence/replay-determinism check relies on (rule #7).
2. **The append-path `schema_invalid` error emits only Zod issue `path` + `code`, never `message`/`received`** — it currently interpolates `parsed.error.message`, which can echo a rejected field's received value (e.g. a secret-shaped `actor`) into the authoritative-path error (LESSON 26 forward-guard / rule #4).

## Use case + traceability
- **Task ID:** P1.8-followup (origin: `/phase-exit P1` code-quality reviewer; `docs/audits/P1-code-quality.md`).
- **Architecture sections it implements:** `ARCHITECTURE.md §4` (replay-determinism — canonical serialization underpins state-equivalence), §14 (security boundary — authoritative-path errors never echo payload/received values).
- **Related context:** P1.8 (`dca9bc4`) shipped `canonical-serialization.ts`; P1.3 (`8bcce9c`) shipped `append.ts`. LESSON 26 (authoritative append path — error messages never echo payload) + LESSON 31 (toJSON-aware canonical equivalence). Both findings are LATENT/pre-consumer today (no P6 fold consumer; AppendError not yet persisted/emitted) — this is a forward-hardening fast-follow so neither dangles into the round seal.

## Acceptance criteria (what "done" means)
- [ ] `canonicalSerialize(v)` equals `JSON.stringify(v)` for a `toJSON`-bearing value whose `toJSON()` returns a `toJSON`-bearing object — `toJSON` is invoked **once per slot**, not recursively on its own result.
- [ ] Existing behavior preserved: `Date` still normalizes to its ISO string (no `{}` collapse — LESSON 31); plain nested objects still key-sort; arrays preserve order; members' own `toJSON` is still honored (a member accessed via the parent IS a new slot — matches `JSON.stringify`).
- [ ] BigInt/circular still throw loud (fold-state contract unchanged).
- [ ] The append `schema_invalid` `AppendError.message` contains the offending field **path** + Zod **code**, and does **NOT** contain the rejected **received value** or Zod's full `.message` string.
- [ ] A secret-shaped invalid value (e.g. `actor: 'sk-leakedsecret123'`) does NOT appear anywhere in the thrown `AppendError.message` (rule #4 / LESSON 26).
- [ ] The append path still rejects a schema-invalid envelope with `AppendError{reason:'schema_invalid'}` and writes nothing (P1.3 behavior intact); the existing append tests stay green.
- [ ] All unit tests in `apps/api/test/unit/event-store/canonical-serialization.test.ts` (extended) pass; the append error-hardening test passes (unit if a pure validation seam exists, else the existing integration append suite extended).
- [ ] `/preflight` clean.

## Wiring / entry point (Step 7.5)
**none new — these are fixes on already-wired surfaces.** `canonicalSerialize` is reached via `replayRun`/state-equivalence (P1.8; first consumers P6/PD); `append`'s error path is on the authoritative write (P1.3; consumed by the P3 kernel). No new entry point — behavior-preserving hardening of existing reachable code.

## Files expected to touch
**Modified:**
- `apps/api/src/event-store/canonical-serialization.ts` — `canonicalize` applies `toJSON` once, then serializes the result structurally without re-checking `toJSON` (e.g. split a `canonicalizeStructure` helper that the toJSON branch delegates to; members still recurse through `canonicalize`).
- `apps/api/src/event-store/append.ts` — the `schema_invalid` branch maps `parsed.error.issues` to `path`+`code` only (no `.message`/`.received`).
- `apps/api/test/unit/event-store/canonical-serialization.test.ts` — add the nested-toJSON-once case (+ regression guards for Date/nested/array).
- `apps/api/test/{unit,integration}/event-store/append*.test.ts` — add the no-value-echo assertion (place per where the validate path is testable; the existing append integration test already drives `schema_invalid`).

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)
`canonical-serialization.test.ts`:
1. **`canonicalize_calls_tojson_once_per_slot`** — `const v = { toJSON: () => ({ b: 2, toJSON: () => 'X' }) }`.
   - Asserts: `canonicalSerialize(v) === JSON.stringify(v)` (both serialize the outer toJSON's RESULT structurally — the result's own `toJSON` is NOT re-invoked). Currently diverges (`'"X"'` vs `'{"b":2}'`).
   - Why: §4 — canonical serializer must mirror `JSON.stringify` toJSON semantics (LESSON 31).
2. **`canonicalize_member_tojson_still_honored`** — an object whose MEMBER is a `Date` (or a toJSON-bearing value).
   - Asserts: the member's `toJSON` IS applied (Date→ISO) — a member is its own slot; matches `JSON.stringify`.
   - Why: don't over-correct fix #1 into skipping member toJSON.
3. **`canonicalize_date_no_collapse_regression`** — `{ at: <Date> }` two different instants.
   - Asserts: distinct serializations (LESSON 31 regression — the original [medium] stays fixed).
4. **`canonicalize_bigint_throws_regression`** — a BigInt in the state.
   - Asserts: throws (fold-state contract intact).

`append` error test:
5. **`append_schema_invalid_error_omits_received_value`** — append an envelope with an invalid `actor: 'sk-leakedsecret123'`.
   - Asserts: rejects `AppendError{reason:'schema_invalid'}`, nothing written, AND `err.message` contains `actor` (the path) but NOT `'sk-leakedsecret123'` and NOT the raw Zod `.message`.
   - Why: rule #4 / LESSON 26 — authoritative-path errors never echo received payload values.

> **Positive-guard discipline (LESSON 10):** lead each assertion with a positive happy-path guard (valid value serializes / appends) so a vanished export fails loud.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** NONE. Behavior-preserving fixes; no contract touched.
- **Orchestrator doc rows to write hot:** none required (the LESSON 26 + 31 prose already cover the principle; this slice tightens conformance). If Step 9 surfaces a sharper rule, I route it.
- **§2.5-seam model touched?** No.

## Things to flag at Step 2.5
1. **Fix #1 shape — split a `canonicalizeStructure` helper vs inline the array/object handling in the toJSON branch?** My default vote: **split `canonicalizeStructure(value)`** (array/object/primitive, no toJSON check) that BOTH the top-level `canonicalize` (after its one toJSON check) and the member recursion delegate to — cleanest, no duplicated key-sort logic, and makes "toJSON once per slot" obvious.
2. **Fix #2 — `code` only, or `path`+`code`?** My default vote: **`path`+`code`** (e.g. `actor: invalid_enum_value`) — enough to debug a schema-invalid envelope without echoing any value; `path` is field names (not payload data), `code` is a Zod enum, neither carries secrets.
3. **Append test placement — unit or integration?** My default vote: **wherever the validate branch is reachable without a DB** — if `AppendInputSchema` validation can be exercised via a small pure seam, unit; otherwise extend the existing `append` integration test (it already drives `schema_invalid`). Don't add a Docker dependency to `/preflight` just for this (LESSON 25).

## Dependencies + sequencing
- **Depends on:** P1.3 (`append.ts`) ✓ · P1.8 (`canonical-serialization.ts`) ✓.
- **Blocks:** P6 projection-builder fold consumers (canonicalize correctness) — folds the finding before they land.

## Estimated commit count
**1 — bundled (the 2 mediums, same event-store area, both behavior-preserving quality fixes, neither a safety-invariant slice).** Both are invariant-ADJACENT (canonicalize ↔ rule #7 replay-determinism; append error ↔ rule #4 no-value-echo), so **security-reviewer stays in the loop** (invariant policy) — review the two diffs against rule #7 (toJSON-once preserves state-equivalence) + rule #4 (no received-value in the error).

## Lessons-logged candidates anticipated
- Likely none new — this tightens conformance to existing LESSON 26 (no payload echo in authoritative-path errors) + LESSON 31 (toJSON-aware canonical equivalence). If Step 9 surfaces a crisp "toJSON-once / JSON.stringify-parity" sub-rule worth pinning, I fold it into LESSON 31 rather than a new number.

## How to invoke
1. **Read this brief end-to-end** — both fixes + the Step-2.5 votes.
2. **Run `/tdd canonicalize_tojson_once_and_append_error_no_value_echo`**.
3. **Step 0/1** — confirm restatement + file list.
4. **Step 2.5** — send the per-test `Asserts: <invariant> (§anchor)` write-up + coverage map; take defaults or ping back.
5. **Step 9** — surface anything beyond the anticipated candidates.
