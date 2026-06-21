# /tdd brief — evidence_ref_resolver

## Feature
A **pure** `EvidenceRef` resolver that dereferences a ref **strictly within the Postgres tier**: an `eventId`-anchored ref resolves to its persisted `run_events` row + payload; an external-`uri`-only ref **fails closed** (never fetched); resolution reads ONLY persisted rows and makes NO model/embedding/web calls — so every evidence pointer is reproducible during replay (rule #7).

## Use case + traceability
- **Task ID:** P1.7
- **Architecture sections it implements:** `ARCHITECTURE.md §9` (persistence — `EvidenceRef` resolves within the Postgres tier; inline raw+normalized outputs), §4 (the `EvidenceRef` contract / event model), §14 (no external fetch on the authoritative/replay path — replay-safety).
- **Consumed frozen contract (Phase 0, not re-implemented):** `EvidenceRef` (+`EvidenceKind`) — `packages/contracts/src/domain/evidence-ref.ts` (frozen P0.5). The resolver consumes it; never redefines it.
- **Related context:** builds on the P1.3 event store (`createEventStore().readByRun(runId)` → `RunEventRow[]`, `RunEventRow.id` is the event id `EvidenceRef.eventId` points at; store surface is `{append, readByRun}` — no global by-id read). The inline outputs the resolver reads were already secret-scrubbed at append by P1.2 (rule #4). Replay (P1.8) depends on this resolver's no-external-fetch property (rule #7).

## Acceptance criteria (what "done" means)
- [ ] `resolveEvidenceRef(ref, events)` is a **pure** function over an array of persisted `RunEventRow` (a run's events): an `eventId` ref resolves to `{ resolved: true, eventId, payload, row }` for the row whose `id === ref.eventId`.
- [ ] A ref whose `eventId` matches NO row in the set → `{ resolved: false, reason: 'not_found' }` — never throws, never returns a wrong row.
- [ ] A ref with NO `eventId` but an external `uri` → `{ resolved: false, reason: 'external_only' }`; the resolver **NEVER fetches the uri** (fail-closed — rule #7 / §14: an external pointer is not authoritative and is not reproducible on replay).
- [ ] A ref with neither `eventId` nor any Postgres-resolvable pointer → `{ resolved: false, reason: 'no_pointer' }`.
- [ ] Resolution performs **NO** model / embedding / web / network call and reads ONLY the persisted rows passed in — pinned so replay (P1.8) reproduces every pointer deterministically (rule #7). (Enforced structurally: the pure resolver has no fetch/IO seam to call.)
- [ ] The resolved `payload` is the persisted (already P1.2-scrubbed) event payload returned **unmodified** — the resolver neither re-scrubs nor mutates it.
- [ ] `eventId` is matched by **exact equality** (ids are opaque untrusted strings — never substring/prefix/concat): `'evt-1'` does not match a row id `'evt-10'`.
- [ ] *(If Q1 = include)* a thin async `createEvidenceResolver(store)` convenience that `readByRun(runId)` once then resolves refs against that set — wraps the pure core, never duplicates the resolution logic.
- [ ] All unit tests in `apps/api/test/unit/event-store/evidence-resolver.test.ts` pass.
- [ ] `/preflight` clean.

## Wiring / entry point (Step 7.5)
**none — wiring lands in later phases.** The resolver is reachable now via `createEventStore().readByRun` (P1.3) feeding the pure `resolveEvidenceRef`. First real consumers: **P6** projections / lineage + the **PD** evidence-walkthrough demo surface (dereferencing a candidate/critic/check's `evidenceRefs[]` to their persisted events), and **P1.8** replay relies on the no-external-fetch property. Per lesson 20 explicit-deferral: first-impl path (P1.3 store → resolver) + first-consumers (P6/PD + P1.8) named as real tasks — no tested-but-unwired silent gap.

## Files expected to touch
**New:**
- `apps/api/src/event-store/evidence-resolver.ts` — `resolveEvidenceRef` (pure) + the `EvidenceResolution` discriminated result type (+ optional `createEvidenceResolver` per Q1).
- `apps/api/test/unit/event-store/evidence-resolver.test.ts`

**Modified:**
- `apps/api/src/event-store/index.ts` — export the resolver surface.

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2 — `apps/api/test/unit/event-store/evidence-resolver.test.ts`)
1. **`resolve_event_id_ref_to_persisted_row`** — `ref{kind:'check_output', eventId:'evt-1'}` over rows including `evt-1`.
   - Asserts: `{ resolved:true, eventId:'evt-1', payload: <evt-1.payload>, row: <evt-1> }`.
   - Why: §9 — `EvidenceRef` dereferences within the Postgres tier.
2. **`resolve_event_id_not_found`** — `eventId` matches no row.
   - Asserts: `{ resolved:false, reason:'not_found' }`; no throw.
   - Why: fail-safe (a dangling pointer is not an exception).
3. **`resolve_external_uri_only_fails_closed`** — `ref{kind:'prior_art', uri:'https://example/x'}` (no `eventId`).
   - Asserts: `{ resolved:false, reason:'external_only' }`; the resolver makes no fetch (pure — no network seam).
   - Why: rule #7 / §14 — an external-only ref is never dereferenced as authoritative.
4. **`resolve_no_pointer_ref`** — `ref{kind:'other'}` (no `eventId`, no `uri`).
   - Asserts: `{ resolved:false, reason:'no_pointer' }`.
   - Why: defensive completeness of the fail-closed taxonomy.
5. **`resolve_reads_only_passed_rows_deterministic`** — call twice with the same `ref` + a frozen rows array.
   - Asserts: identical result; the rows array is not mutated; no clock/random/IO touched.
   - Why: rule #7 replay-determinism.
6. **`resolve_returns_payload_unmodified`** — resolved `payload` deep-equals the row's persisted payload.
   - Asserts: resolver does not re-scrub/mutate (P1.2 already scrubbed at append).
   - Why: the resolver is read-only over the authoritative log.
7. **`resolve_id_matched_by_equality_not_substring`** — ref `eventId:'evt-1'` against rows containing only `'evt-10'`.
   - Asserts: `{ resolved:false, reason:'not_found' }` (no substring/prefix match).
   - Why: carry-forward — ids are opaque untrusted strings, matched by equality, never concatenated.
8. *(Q1-dependent)* **`create_evidence_resolver_reads_by_run_then_resolves`** — `createEvidenceResolver(fakeStore).resolve(runId, ref)`.
   - Asserts: `readByRun` called once; the ref resolves; a second resolve in the same run reuses the read (no second `readByRun`).
   - Why: thin async wrapper over the pure core (no logic duplication).

> **Positive-guard discipline (lesson 10):** each negative/reject test leads with a positive happy-path guard so it fails loudly if the export vanishes.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** **NONE.** Consumes frozen `EvidenceRef` (P0.5); `EvidenceResolution` is an adapter-local result type (not Appendix-A).
- **Orchestrator doc rows to write hot:** none required. Possible **Architecture-doc note** (§9) — the fail-closed-on-external-only behavior + the resolution-reason taxonomy; orchestrator writes at `/orchestrate-end` if Step 9 surfaces it.
- **§2.5-seam model touched?** No — the slice consumes `EvidenceRef` (no extend/define). Tests assert against the frozen schema (consumer-agreement); no new schema-snapshot owned here.

## Things to flag at Step 2.5
1. **Pure-over-rows core + thin async wrapper, or store-backed async only?** My default vote: **pure `resolveEvidenceRef(ref, events)` core + a thin async `createEvidenceResolver(store)` convenience** — the pure core is the load-bearing replay-safe unit (trivially testable, no IO); the wrapper is caller ergonomics (readByRun-once-then-resolve).
2. **Distinct fail-closed reasons (`not_found` / `external_only` / `no_pointer`) or one `unresolved`?** My default vote: **distinct closed reasons** — a consumer/test can distinguish "you pointed outside Postgres" (the rule-#7 case) from "the event isn't in this set"; pins the external-only path separately.
3. **Resolution scope — within a single run's events, or cross-run by global `eventId`?** My default vote: **within-run** — the store is run-scoped (`readByRun`) and consumers hold the `runId`; do NOT add a global by-eventId store read (keeps the surface `{append, readByRun}`). Revisit only if a cross-run consumer appears.
4. **Resolved shape — payload, full row, or both?** My default vote: **both `payload` + `row`** — payload for the common dereference, row for correlation IDs / type / sequence that the lineage/evidence panel wants. Cheap.

## Dependencies + sequencing
- **Depends on:** P0.5 (`EvidenceRef`) ✓ · P1.1 (envelope) ✓ · P1.3 (event store `readByRun` + `RunEventRow`) ✓ · P1.2 (inline outputs scrubbed at append) ✓.
- **Blocks:** P1.8 replay reader (relies on the no-external-fetch reproducibility) · P6 projections/lineage + PD evidence-walkthrough demo (first real consumers).

## Estimated commit count
**1 — SOLO, never bundled.** Safety-invariant: pins **rule #7** (evidence resolution is reproducible on replay — no external/model/web calls; fail-closed on external-only refs). security-reviewer fires (invariant policy) — review against rule #7 (no external fetch) + rule #4 (reads only already-scrubbed payloads) + id-as-opaque-string handling.

## Lessons-logged candidates anticipated
- **Convention candidate** — "EvidenceRef resolution is a PURE function over persisted rows that fails CLOSED on any non-Postgres pointer; replay-reproducibility (rule #7) is enforced by having NO external-fetch seam to call, not by a runtime guard."
- **Architecture-doc note (§9)** — the resolver's fail-closed-on-external-only behavior + the distinct resolution-reason taxonomy (`not_found` / `external_only` / `no_pointer`).

## How to invoke
1. **Read this brief end-to-end** — don't skip "Things to flag at Step 2.5"; Q1 (pure core + wrapper) + Q3 (within-run scope) shape the surface.
2. **Run `/tdd evidence_ref_resolver`** in the (warm) implementer session.
3. **Step 0 (Restate)** — confirm the restatement matches the Feature line.
4. **Step 1 (Identify files)** — confirm the file list.
5. **Step 2.5 (test-design review)** — send the per-test `Asserts: <invariant> (§anchor)` write-up + the acceptance-bullet coverage map; take defaults or ping back.
6. **Step 9 (summarize)** — surface anything beyond the anticipated lessons-logged candidates.
