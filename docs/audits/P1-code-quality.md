# P1 Phase-Exit Code-Quality Review

**Review surface:** Phase 1 accumulated event-store diff — `apps/api/src/event-store/`
(redaction.ts · append.ts · sequence.ts · schema.ts · migrate.ts · migrations/ · evidence-resolver.ts · replay-reader.ts · canonical-serialization.ts · index.ts).

**Scope note:** At phase-boundary, this over-approximates to the accumulated kernel-track branch diff for shared files (index.ts exposes the full event-store barrel including P2-era model-gateway exports). The per-slice security-reviewer already ran on every invariant slice (P1.2, P1.3/P1.4, P1.7, P1.8); this review focuses on quality, correctness, and naming — not re-deriving the security verdict.

**Referenced lessons (LESSONS.md):** §21 (key scrub + de-collision), §25 (TRUNCATE trigger), §26 (one-txn append), §30 (replay-safety-by-construction), §31 (validate-not-sort + toJSON-aware canonical equivalence).

---

## Findings

### [medium] `apps/api/src/event-store/canonical-serialization.ts:23–24` — `canonicalize` recurses into the object returned by `toJSON`, diverging from `JSON.stringify` semantics

The docstring promises the serializer "mirrors `JSON.stringify` `toJSON`" behaviour (lesson §31). `JSON.stringify` calls `toJSON` **once** per object and serialises the returned value **as-is**, without calling `toJSON` on the result. `canonicalize` calls `canonicalize(candidate.toJSON())`, which recurses — so if `toJSON` returns an object that itself has a `toJSON` method, `canonicalize` will call that inner `toJSON` too, producing a different result than `JSON.stringify`. Concrete example:

```js
const obj = { toJSON() { return { x: 1, toJSON() { return 'leaf'; } }; } };
JSON.stringify(obj)           // '{"x":1}' — inner toJSON NOT called
canonicalSerialize({ obj })   // '"leaf"' — inner toJSON IS called — DIVERGES
```

For the narrow fold-state types in use today (Dates returning strings, plain objects) this never triggers. But the docstring contract is incorrect and a future projection fold carrying a `toJSON`-returning-object value would silently produce a different canonical form than `JSON.stringify`. The fix is to NOT recurse when a `toJSON` returns an object: `return value as unknown` (return the already-normalised scalar/string, wrap only once).

**Severity:** medium (bounded: only manifests when `toJSON` returns a non-primitive object that itself has `toJSON`; no known fold state today hits this, but the docstring asserts equivalence that tests don't pin). **Action:** fix-in-slice.

---

### [medium] `apps/api/src/event-store/append.ts:64–65` — `schema_invalid` error message interpolates `parsed.error.message`, which can include caller-supplied field values

The `schema_invalid` branch throws:
```ts
`envelope failed validation: ${parsed.error.message}`
```

`parsed.error.message` is the Zod error message for the envelope minus `{sequence, occurredAt}`. For a closed-enum field like `actor` (z.enum) Zod reports `"Invalid enum value. Expected 'operator' | ... Received 'BADVALUE'"` — the raw received value echoes into the error string. An `actor` carrying a secret-shaped string (e.g. a misrouted API key accidentally placed in the actor field by a buggy producer) would appear in the error. LESSON §26 forward-guard explicitly warns: *"Keep payload content out of authoritative-path error messages."*

The error is thrown inside the transaction (nothing is written) and the error is internal (no SSE/log path is plumbed yet), so the risk is latent not present. The structural fix is to limit the `schema_invalid` message to `parsed.error.issues.map(i => i.path.join('.') + ': ' + i.code).join(', ')` — paths and issue codes, never received values.

**Severity:** medium (latent; bounded by being inside the write transaction and no egress path yet, but violates the stated §26 forward-guard and lesson is explicit). **Action:** step-9-flag.

---

### [low] `apps/api/src/event-store/sequence.ts:24` — `Number(result.rows[0]?.next ?? 0)` doubly guards against the same condition

When `result.rows` is non-empty and the SQL `COALESCE(MAX(sequence)+1, 0)::int` runs, `next` is always an integer (never null, never undefined — `COALESCE` ensures that). The `?.next` optional-chain guard handles `rows[0]` being `undefined` (empty rows), at which point `?? 0` provides 0. But the `?? 0` branch only fires when `rows[0]?.next` is `null` or `undefined`, and `Number(undefined)` is `NaN`, not 0 — so without the `?? 0` the `Number(undefined)` path would produce `NaN`, silently becoming a `NaN` sequence. The `?? 0` is therefore load-bearing as a fallback for the (logically impossible under the advisory lock, but structurally reachable) empty-rows case. No bug — but a comment explaining why the advisory-lock-serialized path can't produce an empty result yet still needs the guard would aid the next reader. (This is purely a readability note, not a bug.)

**Severity:** low (no bug; readability). **Action:** defer.

---

### [low] `apps/api/src/event-store/index.ts:8` — `export * from './schema'` exports all 12 projection table objects alongside the authoritative `runEvents`, with no guard against callers writing to projection tables

The barrel comment says "No mutate path is exported — the write is the only authoritative mutation of `run_events`." That is true for `run_events` specifically, but `export * from './schema'` also re-exports `agenomes`, `candidateIdeas`, `criticReviews`, `checkResults`, `fitnessScores`, `noveltyScores`, `lineageEdges`, `embeddings`, `dashboardSnapshots`, `runs`, `generations` — all with their Drizzle table objects, enabling callers to call `db.insert(agenomes).values(...)` without going through any write gate. The projection tables have no append-only constraint. This is the intended design (projections are rebuilt) and no caller currently does this incorrectly (P3+ projection-builder track is future work). The risk is that the wide re-export makes it easy for a future projection-builder to bypass the architectural write-gate discipline by accident. A grouped re-export or a comment calling out that projection tables are write-gateless would reduce future confusion.

**Severity:** low (no current bug; the concern is future caller discipline). **Action:** defer.

---

### [low] `apps/api/src/event-store/evidence-resolver.ts` — `SequenceExecutor` exported but `sequence.ts` itself is not re-exported from the barrel, leaving `allocateSequence` as an internal that happens to be exported from its module

`sequence.ts` exports `allocateSequence` and `SequenceExecutor` at the module level. These are only used by `append.ts` (internal dependency). The barrel (`index.ts`) does not re-export them. This is correct — they are implementation details. However, `sequence.ts` exports them publicly from the file, so any future internal file could import them directly, bypassing the intended encapsulation. No action needed (the barrel controls the external API), but if stricter encapsulation is desired, an `_internal/` subdirectory or removing the module-level `export` (making it an unexported function and importing it as a file-local) would enforce it. (No bug, purely a future-proofing note.)

**Severity:** low (no bug; no external caller today). **Action:** defer.

---

## Test quality observations (no finding, informational)

- **`replay-reader.test.ts`** does not test the case of a single-event log (`[seq 0]`) vs a multi-event log that correctly passes both the strictly-increasing and contiguous checks with `CURRENT_SCHEMA_VERSION` exactly (= boundary, not just `<`). The existing test `replay_accepts_schema_version_le_current` uses version 1 (below current 2) but no test pins the boundary case of `schemaVersion === CURRENT_SCHEMA_VERSION` explicitly. Low-risk (boundary is an `>` not `>=` check in code, and the valid-log fixture uses `schemaVersion: 2 = CURRENT`), so this is informational, not a finding.
- **`canonical-serialization.test.ts`** does not test the `toJSON`-on-returned-object edge case (the medium finding above). Adding a test that asserts `canonicalSerialize` matches `JSON.stringify` for an object whose `toJSON` returns a plain object with a `toJSON` method would pin the divergence.

---

## Summary

3 real findings (0 high / 2 medium / 1 substantive low / 2 informational lows). No correctness bugs on the load-bearing path — the one-txn append, advisory-lock sequence allocation, secret scrub, validate-not-sort replay, and fail-closed evidence resolver are all correctly implemented and consistent with lessons §21/§25/§26/§30/§31.

- The **medium on `canonicalize`** (toJSON recursion diverges from `JSON.stringify`) is a latent semantic contract violation that the tests don't cover. Fix-in-slice.
- The **medium on `AppendError` message** (Zod error echoes actor value) is a latent §26 forward-guard violation, currently inert (no egress). Step-9-flag for P3 wiring phase.
- The lows are readability/encapsulation notes with no action required now.

**Verdict: CLEAR-with-notes** (no load-bearing correctness bug; one medium warrants a fix before the serialize path gains consumers in P6 projection builders).
