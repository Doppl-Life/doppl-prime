# P1 (kernel track) — Phase-exit whole-surface security review

**Date:** 2026-06-21 · **Reviewer:** security-reviewer (phase-boundary dispatch from `/phase-exit`)
**Policy:** `phase-boundary` (this dispatch IS the whole-system security pass for P1)
**Verdict:** **CLEAR** — zero critical/high residual; all per-slice fixes held; both deferrals tracked.

## Scope & method

Review surface = the **accumulated Phase-1 event-store branch diff** under `apps/api/src/event-store/`
(base `f34094d`, the last pre-P1 commit → HEAD `dca9bc4`). Slices folded in: P1.1 scaffold, **P1.2**
redaction, **P1.3** append-only writer, **P1.4** Drizzle migrations + append-only triggers, **P1.7**
EvidenceRef resolver, **P1.8** replay reader + canonical serialization.

This OVER-APPROXIMATES to the kernel-track diff for the shared barrel `event-store/index.ts` (touched by
P1.3/P1.7/P1.8) — accepted; the index is a re-export surface, reviewed whole below.

**Scope boundary noted:** the Rule #4 *"before Langfuse emit"* leg lives in `packages/observability/`
(commit `0e2f793`, **P6.5 — demo track**), which is NOT an ancestor of this kernel-track HEAD. That
boundary is out of scope here and is the demo track's `/phase-exit` to seal. This pass covers ONLY the
event-store *"before append"* leg of Rule #4. (Carry-forward already pins the P6.5 keys+arrays
requirement — see Deferrals.)

Files reviewed (9 src + 7 test + 2 SQL migrations):
`append.ts · redaction.ts · sequence.ts · index.ts · schema.ts · migrate.ts · evidence-resolver.ts ·
replay-reader.ts · canonical-serialization.ts` + the `0001_run_events_append_only.sql` trigger migration
+ unit/integration suites.

---

## Invariant pass (invariant_touching: yes — every load-bearing rule cross-checked)

### Rule #2 — append-only authoritative log · **PASS**
- **Writer surface = `{append, readByRun}` only** (`append.ts:44-47`). No update/delete/upsert method is
  representable on `EventStore`. The barrel (`index.ts:7-10`) re-exports `* from './schema'`, which
  exposes the `runEvents` Drizzle table *handle* — but a repo-wide grep confirms **no code outside
  `append.ts` imports `runEvents`**, and the **only** mutating statement on the table is the single
  `tx.insert` at `append.ts:85` (zero `.update`/`.delete` anywhere). Defense-in-depth, not a gap.
- **DB triggers are the load-bearing enforcement** (`0001_..._append_only.sql`): a row-level
  `BEFORE UPDATE OR DELETE` trigger + a statement-level `BEFORE TRUNCATE` trigger (row-level can't catch
  TRUNCATE — lesson §25) both `RAISE EXCEPTION`. Pinned by `migrations.test.ts`
  `test_run_events_rejects_update_and_delete` + `test_run_events_rejects_truncate` against real PG.
- **`unique(run_id, sequence)` backstop** (`schema.ts:45`) + advisory-lock allocation rejects
  duplicate/skipped sequences even if the lock were bypassed (`append.test.ts`
  `test_duplicate_or_skipped_sequence_rejected`).
- **`sequence` is the sole ordering key:** `readByRun` orders by `asc(sequence)`, never `occurredAt`
  (`append.ts:110`); `occurred_at` is DB-stamped, omitted from `AppendInput` so the caller cannot set the
  log's clock (`append.ts:20`, `test_occurred_at_db_stamped_not_caller`).
- **No projection treated as authoritative:** `schema.ts:12-21` documents `run_events` as sole
  authoritative table; all others derived/rebuildable (no FKs by design).
- **Least-privilege role caveat (P1.4 [high]) — STILL TRACKED, not dropped.** See Deferrals §1.

### Rule #4 — secrets never persisted (event-store / before-append leg) · **PASS**
- **`scrubEventPayload` runs before the only insert** (`append.ts:79` → insert at `:85`), on the *parsed*
  payload (lesson §18) so no pre-transform value reaches the log.
- **Env-value layer composes the frozen `scrubSecrets` + injected `secretValues`** (`redaction.ts:104-109`)
  — `scrubSecrets` (frozen key-format/key-name/secret-key layers, never reimplemented) then the local
  env-value pass. **No ambient `process.env` read** — values injected at boot via `EventStoreDeps`
  (`append.ts:51`, lesson §4).
- **Covers nested payloads + array elements + object KEYS** with de-collision (`redaction.ts:63-94`) —
  the P1.2 [high] secret-as-key class is the env-value layer's sole defense (open `z.record` payload,
  30/36 event types). Idempotent + length-gated (`MIN_SECRET_LENGTH=8`, placeholder-substring guard,
  `redaction.ts:31-38`) so a blank/short env var can't blanket-redact. Pinned by `redaction.test.ts`
  (key + array + value + idempotency) and the integration `test_scrub_runs_before_insert`.
- **No-credential-field structurally:** envelope carries no cred field; opaque gateway passthroughs are
  caught by the value/key scrub. Authoritative-path errors echo only Zod messages / enum reasons, never
  payload (`append.ts:64,74` — lesson §26).

### Rule #7 — replay reproducibility · **PASS (STRUCTURAL)**
- **No provider/model/web/clock/random seam in ANY event-store source.** Import-list verification:
  `replay-reader.ts` imports only `{CURRENT_SCHEMA_VERSION}` + local `./append` types;
  `canonical-serialization.ts` imports **nothing**; `evidence-resolver.ts` imports only `EvidenceRef` +
  local types. A repo grep for `openai|anthropic|openrouter|fetch|axios|http|Date.now|new Date|
  Math.random|crypto|embed|model-gateway|setTimeout` across `event-store/*.ts` returns ONLY comments
  (documenting the absence) and the `embedding_model_id` schema *column name* (a persisted field, not a
  call). "Replay calls no provider" holds by construction (lesson §30), not by runtime guard.
- **Evidence-resolver fails closed on external pointers** (`evidence-resolver.ts:40-42`): an external
  `uri` OR non-authoritative `langfuseObservationId` → `external_only`, never fetched. The one permitted
  IO (`readByRun`) is confined to the injected store; the pure core `resolveEvidenceRef` takes pre-read
  rows. `eventId` matched by exact equality only (no substring/concat).
- **Replay-reader VALIDATES-not-sorts** (`replay-reader.ts:37-66`): out_of_order (checked before gap) /
  gap / schema_too_new throw `ReplayIntegrityError` — never silently re-sorts/skips a corrupted log.
  Integration `replay.test.ts` asserts state-equivalence via `canonicalSerialize(rebuilt) ===
  canonicalSerialize(captured)` over a real PG round-trip with no provider call.

---

## Per-slice fix verification — all HELD

| Finding | Severity | Status | Regression pin |
|---|---|---|---|
| P1.2 secret-as-KEY leak | [high] | **HELD** | `redaction.test.ts` key+de-collision + integration `test_scrub_runs_before_insert` (as-a-key case) |
| P1.3 advisory-lock TOCTOU | [high] | **HELD** | `append.test.ts` `test_concurrent_same_run_appends_serialize` (8 parallel) + unique-constraint backstop |
| P1.7 cache-rejection eviction | [low] | **HELD** | `evidence-resolver.test.ts:148-162` (transient failure evicted, retry re-reads, fails closed) |
| P1.8 Date false-equivalence | [medium] | **HELD** | `canonical-serialization.test.ts:45-51` (toJSON→ISO; distinct instants stay distinct, not `{}`) |

---

## General security pass

- **Input validation:** append path validates the envelope (`AppendInputSchema.safeParse`) + per-type
  payload ceiling in-txn before any write — schema-invalid / over-depth / over-size reject with nothing
  written (`append.test.ts` `test_payload_ceiling_rejected_before_append`). PASS.
- **SQL injection:** `run_id` parameterized via Drizzle `sql\`…${runId}\`` template params, never
  concatenated (`sequence.ts:20-22`); pinned by `test_run_id_is_parameterized` (a `'; DROP TABLE` runId
  stored literally, table survives). PASS.
- **Race / TOCTOU:** sequence allocation serialized by `pg_advisory_xact_lock(hashtext(run_id))` held to
  commit; cross-run independent (`sequence.ts:19-25`). PASS.
- **Resource exhaustion / payload DoS:** `validateEventPayload` enforces the depth-then-size ceiling
  before append (lesson §16). PASS.
- **Information disclosure:** authoritative-path errors carry Zod messages / enum reasons only — no
  payload echo. PASS.

## Integration-level (cross-slice) findings

**None.** The barrel re-export of the `runEvents` table handle (`index.ts:8`) was assessed as a potential
cross-slice Rule #2 bypass surface; ruled defense-in-depth (no consumer imports it; DB triggers fail any
mutation closed regardless of code path). No new payload/log/trace path bypasses the scrub. No cross-slice
provider seam introduced on the replay path.

## Deferrals — confirmed tracked, NOT silently dropped

1. **P1.4 [high] least-privilege role-split → deferred-to-hosted (user-ratified 2026-06-21).** Tracked in
   **two** places: `ARCHITECTURE.md` §9 ("Append-only enforcement (trigger + privilege — role-split
   deferred to hosted)") AND `IMPLEMENTATION_PLAN.md` Carry-forward NOTE with explicit "Come-back if
   hosted" wiring (provision app-role in migration chain + wire runtime DB connection separate from
   owner/migration role; pairs with §14 access gate). Local demo = trigger-only, accepted (no adversarial
   DB access). Commit `c066a12`. **Confirmed live, not dropped.**
2. **P1.2/§14 env-value KEYS+arrays (demo track P6.5) — carry-forward open.** The kernel/P1.2 leg is
   SHIPPED + hardened; the demo/P6.5 observability Langfuse-emit leg MUST also redact keys with
   de-collision. Tracked in `IMPLEMENTATION_PLAN.md` Carry-forward (commit `0d92fa7`). Out of THIS pass's
   scope (demo track); flagged for the demo `/phase-exit`.

## Verdict

**CLEAR.** All three load-bearing invariants (#2, #4, #7) PASS across the integrated P1 event-store
surface. All four per-slice fixes held with regression pins. Both deferrals are tracked with come-back
conditions. No critical/high residual; no new integration-level finding. The phase-exit security row
records CLEAR.
