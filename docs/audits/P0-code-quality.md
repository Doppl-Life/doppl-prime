# P0 Phase-Boundary Code Quality Audit

**Date:** 2026-06-20  
**Track:** contract  
**Review surface:** accumulated branch diff `main...HEAD` — `packages/contracts/src` + `packages/contracts/test` (whole-package; over-approximates to the accumulated track diff — acceptable per the `code-quality-reviewer` phase-boundary policy).  
**Files touched (net-new):** 82 files, 6 025 insertions  
**Security reviewer:** pre-ran CLEAN on safety slices (P0.2, P0.6, P0.7) — not re-litigated here.

---

## Findings

### [medium] packages/contracts/src/events/payload-map.ts:148 — `validateEventPayload` echoes the unvalidated input object on success, not `parsed.data`

`validateEventPayload` returns `{ ok: true, payload }` where `payload` is the caller-supplied `Record<string, unknown>` argument, not `parsed.data` from the `safeParse` call. This is safe today only because no schema in `packages/contracts` uses `.transform`, `.default`, `.coerce`, or `.pipe`, so Zod's output equals the input. If any future schema is widened to coerce/default a field, every caller on the P1 append path will silently receive the pre-transform value from this function while `parsed.data` carries the post-transform value — a subtle data-integrity divergence on the authoritative log path.

The function should return `{ ok: true, payload: parsed.data as Record<string, unknown> }` to stay correct as schemas evolve.

**Severity:** medium — bounded today (no current transforms), but directly on the authoritative event-store write path and will silently misbehave if any high-traffic schema ever gains a transform.  
**Action:** fix-in-slice

---

### [low] packages/contracts/src/events/payload-map.ts:77–94 — `exceedsDepth` uses `Object.values` without explicit Array guard; arrays are descended but their `length`/index-as-key semantics are opaque to the reader

The function casts `node` to `Record<string, unknown>` and calls `Object.values(node)`. When `node` is an Array, `Object.values(array)` correctly returns the array elements (not including `length`), so the traversal is functionally correct. However, because the type guard on line 83 (`typeof node !== 'object'`) admits both plain objects AND arrays, and the `Object.values` cast silently works on both, the intent is non-obvious. A reader unfamiliar with `Object.values` semantics on arrays might incorrectly conclude that circular arrays would escape the depth check (they do not — `circular.self = circular` produces a cycle caught as max_depth). A one-line comment at line 89 noting "Object.values works correctly on arrays — elements are its own enumerable properties" would prevent future confusion.

**Severity:** low — readability only; no bug.  
**Action:** defer

---

### [low] packages/contracts/test/test-fixtures/fixtures-valid.test.ts:25–60 — `EXPECTED_FIXTURE_NAMES` omits `LineageNode` and `LineageEdge` from the completeness list

The test's `EXPECTED_FIXTURE_NAMES` constant (the human-authored "must have" list) does not include `'LineageNode'` or `'LineageEdge'`, even though both are shipped as named exports in `CANONICAL_FIXTURES` and are §2.5 shared models. The test would not catch removal of those two entries from `CANONICAL_FIXTURES`. In practice the consolidated `contract-surface.test.ts` lockstep check (lines 136–148) catches this via the `OBJECT_MODELS → canonical fixture → snapshot` triangle, so there is no live regression gap. But the `EXPECTED_FIXTURE_NAMES` list is the human-readable completeness statement and is visually incomplete.

**Severity:** low — dual coverage from `contract-surface.test.ts` prevents an actual regression; purely a documentation/maintenance gap in the fixture test.  
**Action:** defer

---

### [low] packages/contracts/src/events/payload-map.ts:115 — `serialized.length` counts UTF-16 code units, not bytes; a payload with multi-byte Unicode characters can be under the JS length limit but over 1 MiB when persisted as UTF-8

`MAX_PAYLOAD_BYTES = 1_048_576` and the check is `serialized.length > MAX_PAYLOAD_BYTES`. `String.length` in JavaScript is a count of UTF-16 code units. A string containing characters in the Supplementary Multilingual Plane (emoji, CJK Extension B, etc.) counts 2 code units per character in JS but serializes to 4 bytes each in UTF-8 (which is what Postgres stores). A crafted payload of ~512 K emoji-heavy characters would pass the `length` check (512 K × 2 = 1 M units) while being ~2 MiB on disk. Under the MVP prototype posture and given Zod validates event payloads with `.min(1)` non-empty string fields (most payload content is ASCII ideas text), reaching a 2× unit-to-byte ratio in practice is unlikely. The doc comment says "1 MiB" but the check is actually a unit-count ceiling, not a byte ceiling.

**Severity:** low — bounded by real-world content (idea text is overwhelmingly ASCII/BMP); an exploitable DoS via emoji-stuffing requires the upstream `enforcePayloadCeiling` guard to be the last line of defense, which it isn't (the Zod schema parse + Postgres column limits add further gates). Flag for P1 hardening if the Postgres `text` column has a size limit enforced at the DB tier.  
**Action:** step-9-flag

---

## Axes with no findings

- **Correctness (schema logic):** All `superRefine` cross-field invariants (`CheckResult` skipReason IFF skipped, `ModelGatewayResponse` accepted ⟺ validationResult, `ModelGatewayRequest` exactly-one-of prompt/messages, `FinalJudgeRubric` `immutableToAgents: true`) are correctly implemented and bidirectionally tested.
- **Edge cases (security primitives):** `wrapUntrusted` neutralization is single-pass-complete per the documented proof. `scrubSecrets` de-collision is O(1) amortized via the cursor map. `resolveCheckAdapter` `hasOwnProperty.call` owns the prototype-bypass. `enforcePayloadCeiling` depth-before-bytes order is correctly preserved and commented.
- **Lesson violations:** No violation of §1–§14 observed. Discriminated unions use `z.literal(Subtype.enum.*)` (§5, §7). All object schemas are `z.strictObject` (§1). All closed unions are `z.enum` with reject-out-of-set tests (§1). Schema permissiveness on counts/ranges is intentional (§6). Authoritative-once-computed fields are REQUIRED (§13). `policyVersion` is REQUIRED (§12). `immutableToAgents: z.literal(true)` pins rule #6 (§9 analog). `resolveCheckAdapter` own-property lookup (§11). `wrapUntrusted` sentinel neutralization (§8). IO is at the boot boundary, not in the pure package (§4).
- **Dead code:** None found. All exports are consumed by either tests or `CANONICAL_FIXTURES`.
- **Naming:** Consistent with the codebase's established conventions. `criticInput` lower-camel intentional (matches lesson reference).
- **Consistency:** `FIELD_SET_SNAPSHOTS` entries are complete and consistent with the live schema shapes. The consolidated `contract-surface.test.ts` lockstep check closes the fixture ↔ snapshot ↔ model triangle.

---

## Summary

4 findings: 0 high / 1 medium / 3 low.

The **medium** finding (payload-map.ts:148, returning pre-parse input rather than `parsed.data`) is on the authoritative event-store write path and will silently misbehave if any high-traffic schema ever gains a transform — worth a fix-in-slice before P1 wires the append path. The three low findings are: an `Object.values`-on-array readability note (defer), an incomplete `EXPECTED_FIXTURE_NAMES` list shadowed by the consolidated gate (defer), and a UTF-16 vs UTF-8 ceiling accounting note (step-9-flag for P1 hardening).

**Verdict: CLEAR** — no correctness bug currently broken; the medium finding is a forward-correctness risk on the critical path, not a currently-broken invariant.
