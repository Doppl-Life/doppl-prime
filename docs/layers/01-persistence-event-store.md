# Persistence & Event Store

## Executive summary

This layer is the system's **memory and its single source of truth**. Everything Doppl ever does — an idea generated, a critic's review, a fitness score, an energy debit, a run cancelled — is recorded as an **event** appended to one Postgres table, `run_events`. That table is **append-only**: rows can be added but never edited, deleted, or wiped. Each event in a run gets a `sequence` number (0, 1, 2, …) that is the *only* thing used to order events — the wall-clock timestamp is for display, not ordering. Every other table in the database (current run state, lineage graph, dashboards) is a **derived view** that can be thrown away and rebuilt by replaying the log; only `run_events` is authoritative.

The layer owns four jobs around that log: (1) **one guarded write path** — `createEventStore().append()` — that validates, secret-scrubs, and sequences every event inside a single database transaction; (2) the **Drizzle schema + SQL migrations** that define the table and install the database-level triggers that make it append-only; (3) a **replay reader** that re-reads the log in `sequence` order, refusing a corrupted log rather than silently fixing it, and calling **no LLM/embedding/web provider** ever (so replay is deterministic and free); and (4) two small read helpers — the **EvidenceRef resolver** (dereferences a pointer, but only inside Postgres) and **canonical serialization** (a stable JSON form used to prove two states are equal). It does **not** decide *what* events mean or *when* to emit them — that is the runtime kernel's job ([03-runtime-kernel.md](03-runtime-kernel.md)). This layer is a mechanism, not a brain.

## Responsibilities

- **Owns the authoritative log.** `run_events` is the one append-only, per-run-sequenced table that is the source of truth (`apps/api/src/event-store/schema.ts:26`). All other tables are derived and rebuildable.
- **Owns the sole write path.** `createEventStore().append()` is the *only* sanctioned way to write `run_events`: validate → narrow/ceiling → redact → sequence → insert, in one transaction (`apps/api/src/event-store/append.ts:62`). It exposes exactly `{ append, readByRun }` — no update, no delete.
- **Owns schema + migrations.** Defines all 12 tables in Drizzle and installs the append-only triggers + unique `(run_id, sequence)` constraint via hand-authored SQL (`apps/api/src/event-store/migrations/0001_run_events_append_only.sql`).
- **Owns deterministic replay.** Re-reads a run's log validated-not-sorted, folds it into state, calls no provider (`apps/api/src/event-store/replay-reader.ts:37`).
- **Owns the pre-append secret scrub** at the persistence boundary (`apps/api/src/event-store/redaction.ts:103`) and **canonical serialization** for state-equivalence (`apps/api/src/event-store/canonical-serialization.ts:62`).
- **Owns the EvidenceRef resolver** — dereferences a pointer only within the Postgres tier, fail-closed on external pointers (`apps/api/src/event-store/evidence-resolver.ts:27`).
- **NOT responsible for:** deciding event semantics, energy math, caps, or when to emit (runtime kernel, [03-runtime-kernel.md](03-runtime-kernel.md)); defining the event shapes themselves (frozen contracts, [00-contracts-event-model.md](00-contracts-event-model.md)); building the read-model projections that consume replay output ([06-projections-read-models.md](06-projections-read-models.md)); calling providers (model gateway, [02-model-gateway-providers.md](02-model-gateway-providers.md)).

## Key components

| Component | What it does | Where |
|-----------|--------------|-------|
| `createEventStore({db, secretValues})` | The sole `{append, readByRun}` surface — no mutate path exists | `apps/api/src/event-store/append.ts:60` |
| `append()` (the one transaction) | validate → payload ceiling/narrow → scrub → allocate sequence → insert | `apps/api/src/event-store/append.ts:62` |
| `allocateSequence(tx, runId)` | Per-run monotonic gapless sequence under an advisory xact lock | `apps/api/src/event-store/sequence.ts:19` |
| `runEvents` table | The authoritative append-only log; unique `(run_id, sequence)` | `apps/api/src/event-store/schema.ts:26` |
| `0001_..._append_only.sql` (triggers) | DB-level row+statement triggers rejecting UPDATE/DELETE/TRUNCATE | `apps/api/src/event-store/migrations/0001_run_events_append_only.sql:14` |
| `scrubEventPayload(payload, secretValues)` | Frozen scrub + env-value layer (keys, arrays, values) before insert | `apps/api/src/event-store/redaction.ts:103` |
| `replayEvents(rows)` / `replayRun()` | Validate-not-sort (gap/out_of_order/schema_too_new), then fold | `apps/api/src/event-store/replay-reader.ts:37` |
| `resolveEvidenceRef(ref, events)` | Pure Postgres-tier dereference, fail-closed on external pointers | `apps/api/src/event-store/evidence-resolver.ts:27` |
| `canonicalSerialize(value)` | Stable, key-sorted, `toJSON`-aware JSON for state-equivalence | `apps/api/src/event-store/canonical-serialization.ts:62` |
| `runMigrations(connectionString)` | Idempotent boot migrator over the ordered chain | `apps/api/src/event-store/migrate.ts:16` |

## Interfaces & contracts

**Public surface** (re-exported from the barrel `apps/api/src/event-store/index.ts`):

```ts
interface EventStore {
  append(input: AppendInput): Promise<AppendResult>;   // the only authoritative write
  readByRun(runId: string): Promise<RunEventRow[]>;     // ordered by sequence asc
}
```

- **`AppendInput`** is `RunEventEnvelope.omit({ sequence: true, occurredAt: true })` (`apps/api/src/event-store/append.ts:25`). The caller **cannot** set the log's order (`sequence`) or its clock (`occurredAt`) — the writer allocates one and the DB stamps the other. This is safe-by-construction, not by discipline.
- **`AppendResult`** = `{ id, runId, sequence }` (`apps/api/src/event-store/append.ts:28`).
- **`AppendError`** carries a closed reason `'schema_invalid' | 'max_bytes' | 'max_depth' | 'shape_mismatch'` (`apps/api/src/event-store/append.ts:34`). The writer is a pure mechanism — it *throws* on rejection; the **caller** (the kernel) is responsible for emitting the corresponding failure event. The writer never writes a failure event itself.

**What it consumes from contracts** ([00-contracts-event-model.md](00-contracts-event-model.md), `packages/contracts`):
- `RunEventEnvelope` — the frozen 14-field envelope; `AppendInput` is derived from it by `.omit`.
- `validateEventPayload(type, payload)` — per-type narrowing + the bounded payload-DoS ceiling (`MAX_PAYLOAD_BYTES`=1 MiB, `MAX_PAYLOAD_DEPTH`=32), returning a result object `{ok, payload}` or `{ok:false, reason}` (`packages/contracts/src/events/payload-map.ts:152`). The append path uses the **parsed** payload it returns, never the caller's input (so a coercion/transform can't bypass onto the log — lesson §18).
- `scrubSecrets` + `REDACTION_PLACEHOLDER` (`packages/contracts/src/security/redaction.ts:121,17`) — the frozen scrub this layer composes (never reimplements).
- `CURRENT_SCHEMA_VERSION` — the version window the replay reader enforces (`= 9`).
- `EvidenceRef` — the pointer shape the resolver dereferences.

**What it exposes to others:** `EventStore`, `RunEventRow` (`= typeof runEvents.$inferSelect`), `replayEvents`/`replayRun`/`createReplayReader`/`ReplayIntegrityError`, `resolveEvidenceRef`/`createEvidenceResolver`, `canonicalSerialize`, `runMigrations`, and the Drizzle table objects.

## Data & state

**The authoritative table** (`apps/api/src/event-store/schema.ts:26`):

| Column | Type | Role |
|---|---|---|
| `id` | text PK | Opaque event id (caller-supplied) |
| `run_id` | text, indexed | The run this event belongs to |
| `generation_id` / `agenome_id` / `candidate_id` | text, nullable | Correlation IDs |
| `type` | text | The `RunEventType` (closed 41-member registry) |
| `sequence` | integer | **Per-run monotonic order key — the sole ordering key** |
| `occurred_at` | timestamptz, `defaultNow()` | **DB-stamped UTC, display-only** — never ordered on |
| `actor` | text | The closed 7-role union |
| `correlation_id`, `langfuse_trace_id`, `langfuse_observation_id` | text, nullable | Observability links |
| `payload` | jsonb | The event body (frozen model for high-traffic types, generic record otherwise) |
| `schema_version` | integer | The envelope version the row was written under |

Constraints, installed by migrations:
- `uniqueIndex('run_events_run_id_sequence_key')` on `(run_id, sequence)` (`schema.ts:45`) — no two events in a run share a sequence (no duplicate / no gap collision).
- `index('run_events_run_id_idx')` on `run_id` (`schema.ts:46`).
- Append-only triggers (SQL migration, see below).

**The other 11 tables** are all **derived projections** — `runs`, `generations`, `agenomes`, `candidate_ideas`, `critic_reviews`, `check_results`, `fitness_scores`, `novelty_scores`, `lineage_edges`, `embeddings`, `dashboard_snapshots` (`schema.ts:50-165`). They have **no foreign keys** by design — in an event-sourced system integrity comes from replaying `run_events`, not from DB FKs (`schema.ts:16-20`). `embeddings` is an *index over* the authoritative novelty vector, never the system of record (`schema.ts:148`); `dashboard_snapshots` carries a `(run_id, sequence)` watermark so it's rebuilt when newer events exist (`schema.ts:158`).

**No persistent in-memory state.** The store is a thin factory over an injected Drizzle `db`. The only caches are the *promise* memoization inside `createEvidenceResolver` (read-once-per-run, evicted on rejection — `evidence-resolver.ts:58-69`).

## Dependencies

- **Depends on:**
  - **`packages/contracts`** ([00-contracts-event-model.md](00-contracts-event-model.md)) — the frozen `RunEventEnvelope`, `validateEventPayload`, `scrubSecrets`/`REDACTION_PLACEHOLDER`, `CURRENT_SCHEMA_VERSION`, `EvidenceRef`. The contracts define *shape*; this layer enforces *persistence*.
  - **Drizzle + node-postgres** — the SQL builder and driver. Postgres only; **no SQLite** (safety rule #9).
  - `../shared/zod-errors` — the single-sourced no-value-echo Zod summarizer (`append.ts:8`).
- **Used by:**
  - **The runtime kernel** ([03-runtime-kernel.md](03-runtime-kernel.md)) — the *only* component that calls `append()`, and the one that emits failure events when `append()` throws.
  - **Projections** ([06-projections-read-models.md](06-projections-read-models.md)) — inject their reducers into `replayRun` and read via `readByRun`.
  - **The REST/SSE routes** ([07-backend-api-rest-sse.md](07-backend-api-rest-sse.md)) — `readByRun` backs rebuild-on-read queries and the SSE bridge.
  - **The verifier/selection** ([04-verifier-council-checks.md](04-verifier-council-checks.md), [05-selection-scoring-reproduction.md](05-selection-scoring-reproduction.md)) — append via the kernel's seam and resolve EvidenceRefs.
  - **Demo scripts** — `seed-demo` / `dump-replay` for the committed replay fixture.

## How it works (flow)

**The append path** — one transaction, five steps (`apps/api/src/event-store/append.ts:62-108`):

```
append(input)  [db.transaction]
  1. AppendInputSchema.safeParse(input)        append.ts:66   → reject schema_invalid (nothing written)
  2. validateEventPayload(type, payload)       append.ts:78   → narrow + ceiling; use PARSED payload
  3. scrubEventPayload(validated, secretValues) append.ts:85  → secret scrub (rule #4)
  4. allocateSequence(tx, runId)               append.ts:88   → advisory-lock-serialized seq
  5. tx.insert(runEvents).values({...})        append.ts:91   → the only INSERT; occurred_at DB-stamped
```

- Step 1 rejects with **path + code only**, never Zod's `.message`/`.received` — an authoritative-path error must not echo a caller-controlled value (`append.ts:68-72`, rule #4 / lesson §26).
- Step 4, `allocateSequence` (`sequence.ts:19-25`): `SELECT pg_advisory_xact_lock(hashtext(run_id))` then `SELECT COALESCE(MAX(sequence)+1, 0)`. The advisory lock is held until the txn commits, so two concurrent same-run appends can't read the same `MAX` (no duplicate, no gap — closes the TOCTOU). Different `run_id`s hash to different lock keys, so cross-run appends never contend. `run_id` is **parameterized**, never concatenated into SQL.

**The replay path** (`apps/api/src/event-store/replay-reader.ts:37-78`):

```
replayEvents(rows)
  Pass 1  strictly increasing?   → ReplayIntegrityError('out_of_order')   reader.ts:39  (checked BEFORE gap)
  Pass 2  contiguous from 0?      → ReplayIntegrityError('gap')            reader.ts:50
  Pass 3  schemaVersion ≤ current?→ ReplayIntegrityError('schema_too_new') reader.ts:57
  → return rows (NEVER re-sorted)
replayRun(rows, fold, initial) = replayEvents(rows).reduce(fold, initial)   reader.ts:72
```

State-equivalence (the demo's safety net): a projection rebuilt from the log must equal the projection captured at run end, compared as `canonicalSerialize(rebuilt) === canonicalSerialize(captured)` (`canonical-serialization.ts:7`). `canonicalSerialize` sorts object keys recursively, **preserves array order** (event order is semantic), and applies `toJSON` exactly once per slot (so a `Date` normalizes to its ISO string instead of collapsing to `{}` — lesson §31).

**EvidenceRef resolution** (`evidence-resolver.ts:27-45`): the only Postgres-resolvable pointer is `eventId`, matched by **exact equality** (ids are opaque — never substring/prefix). A ref with only `uri` or `langfuseObservationId` → `external_only` (never fetched). A ref with no resolvable pointer → `no_pointer`. The resolved `payload` is returned unmodified (it was already scrubbed at append).

## Design decisions & rationale

- **`sequence` is the sole ordering key; `occurredAt` is display-only.** Locked in ARCHITECTURE.md §4 (`ARCHITECTURE.md:171`). Wall clocks skew and tie; a per-run monotonic integer gives a total, replayable order. The schema comment pins this (`schema.ts:25`).
- **Append-only, no in-place edits.** §4/§9 (`ARCHITECTURE.md:171`, `ARCHITECTURE.md:306`). History must be reconstructable; an editable log can't be trusted for replay. Enforced at the DB (triggers), not in app code.
- **No foreign keys.** §9 + `schema.ts:16-20`. In event-sourcing, projections are dropped/rebuilt from the log; FKs only invert the dependency and add rebuild-order friction.
- **JSONB payload narrowed by a per-type map, not by columns.** §4 (`ARCHITECTURE.md:173`). "JSONB for MVP speed," with the high-traffic types validated against their frozen model via `validateEventPayload`, fail-open to generic for other types, fail-closed on a high-traffic mismatch.
- **Caller cannot set sequence/occurredAt.** `AppendInput = RunEventEnvelope.omit(...)` (`append.ts:25`, lesson §26). A structural guarantee that the caller can't forge order or clock.
- **Validator returns the parsed value.** `append.ts:78` uses `validated.payload`, never `env.payload` (lesson §18) — a present-or-future transform can't slip an un-narrowed value onto the log.
- **Embeddings authoritative-once-computed.** §9 (`ARCHITECTURE.md:310`). The vector + model-id + dimension live in the `novelty.scored` payload; the `embeddings` table is just a query index (`schema.ts:148`). Replay reads the stored vector, never re-embeds (rule #7).
- **Migrations run the same chain local + hosted at boot, idempotently.** §9 (`ARCHITECTURE.md:304`); `runMigrations` relies on drizzle's `__drizzle_migrations` tracking (`migrate.ts:6-12`).
- **Role-split deferred.** §9 explicitly defers the least-privilege-app-role split to hosted (`ARCHITECTURE.md:306`) — see Gotchas.

## Safety & invariants

This layer is the structural home of three of the nine load-bearing safety rules.

- **Safety rule #2 — the event log is append-only and authoritative.** Enforced *at the database*, not in app code:
  - Row-level `BEFORE UPDATE OR DELETE` trigger `run_events_append_only` raises an exception on any persisted-event mutation (`migrations/0001_run_events_append_only.sql:14-16`).
  - Statement-level `BEFORE TRUNCATE` trigger `run_events_no_truncate` — a row-level trigger does **not** fire on TRUNCATE, so a separate statement-level trigger guards against wholesale destruction (`migrations/0001_...sql:20-22`, lesson §25). Tests `test_run_events_rejects_update_and_delete` / `test_run_events_rejects_truncate` pin both (`apps/api/test/integration/event-store/migrations.test.ts:74,85`).
  - The **per-run monotonic gapless sequence** under the advisory xact lock (`sequence.ts:20-23`) + the unique `(run_id, sequence)` index (`schema.ts:45`) give a total, gap-free order with no TOCTOU duplicates.
  - The store exports **only** `{append, readByRun}` — no update/delete path exists in the code at all (`append.ts:49-52`; `test_writer_has_no_update_or_delete`).
- **Safety rule #4 — secrets never leave the server.** `scrubEventPayload` runs in step 3 of the transaction, *before* the only INSERT (`append.ts:85`). It composes the frozen `scrubSecrets` (key-format + key-name + secret-key layers) and adds an **env-value layer** that redacts loaded `process.env` secret values found in any string **value, array element, OR object key** (`redaction.ts:63-94`). Keys must be scrubbed because `payload` is an open `z.record` — producer-controlled strings reach key positions (`redaction.ts:50-54`, lesson §21). The env-value pass is length-gated (≥8 chars) and placeholder-safe so it can't blanket-redact on a blank/short var (`redaction.ts:24-38`), uses literal `split/join` (never a built regex), and rebuilds on a normal-prototype object so a `__proto__`/`constructor` key round-trips as data (`redaction.ts:84-89`). It is pure — secret values are *injected* (`EventStoreDeps.secretValues`), never read from `process.env` (lesson §4). `test_scrub_runs_before_insert` pins the boundary (`apps/api/test/integration/event-store/append.test.ts:123`).
- **Safety rule #7 — replay calls no providers.** Enforced **structurally**: `replay-reader.ts` and `evidence-resolver.ts` import **no** provider/model/web/embedding seam — only `@doppl/contracts` and sibling modules (`replay-reader.ts:10`, `evidence-resolver.ts:8-12`, lesson §30). An external call is therefore *impossible*, not merely runtime-guarded. The replay reader is given a narrowed `Pick<EventStore,'readByRun'>` so appends/writes are unreachable from it (`replay-reader.ts:89`, lesson §55). The EvidenceRef resolver fails **closed** on any non-Postgres pointer (`external_only`), so replay never dereferences something it can't reproduce (`evidence-resolver.ts:40-42`).
- **Rule #4 also touches the replay-fixture scripts:** `dump-replay` reads with `secretValues: []` because the scrub already ran at append (`scripts/dump-replay.ts:102`); `seed-demo` re-validates every restored event against `RunEventEnvelope` + `validateEventPayload` before insert, because a direct restore bypasses the append-path validation (`scripts/seed-demo.ts:55-90`, lesson §46/§87).

## Gotchas & sharp edges

- **The writer throws; it never emits.** `append()` raises `AppendError` on rejection (`append.ts:69`). The *caller* (kernel) must catch it and emit the appropriate failure event. A consumer that swallows the throw loses the failure record.
- **First event of a run must be `sequence === 0`.** `replayEvents` Pass 2 requires contiguity from 0 (`replay-reader.ts:52`). `allocateSequence` produces this naturally (`COALESCE(MAX+1, 0)`), but any hand-built/seeded log that starts at 1 will throw `gap` on read.
- **`out_of_order` is classified before `gap`.** So `[0,2,1]` reports `out_of_order`, not `gap` (`replay-reader.ts:38`). Intentional and tested — don't "fix" the pass order.
- **Append-only triggers are privilege-defeatable.** A superuser or the table owner can `DISABLE TRIGGER` or set `session_replication_role='replica'`. ARCHITECTURE.md §9 (`ARCHITECTURE.md:306`) states the *full* rule #2 also needs the runtime to connect as a least-privilege INSERT/SELECT-only app role, with migrations run as a separate owner. **This role-split is explicitly DEFERRED to hosted** (user-ratified). Locally the runtime never disables triggers, so trigger-only is accepted — but this is *flagged deferred work*, not shipped enforcement (lesson §25). Do not document the local posture as full rule-#2 enforcement.
- **`canonicalSerialize` throws on BigInt / circular references.** By design — a non-serializable fold state is a fold-authoring bug surfaced loud, never silent (`canonical-serialization.ts:11`). Fold states must be JSON-safe.
- **`truncate-capture.ts` lives in this directory but is consumed by the runtime, not the event store.** `truncateCaptureField` / `CAPTURE_FIELD_MAX_BYTES` are imported by `apps/api/src/runtime/loop/generationLoop.ts:32` (the LLM-telemetry / tool-call capture path), and it is **not** re-exported from the event-store barrel (`index.ts`). It is a pre-append helper (truncate-with-marker so an oversized raw capture fits under the 1 MiB ceiling instead of being rejected), but it is *not* part of the `EventStore` surface (lesson §105/§107).
- **DRIFT (architecture-vs-code, harmless, already acknowledged in the doc):** the §4 flow diagram labels replay ordering "ordered by run_id, sequence", but `readByRun` orders by `sequence` alone within a `WHERE run_id = $1` scope (`append.ts:111-117`) — functionally equivalent for a single-run query. ARCHITECTURE.md §9 itself flags this as a stale-but-harmless diagram note (`ARCHITECTURE.md:318`).
- **`occurred_at` is stamped on read-back, not by the caller.** `seed-demo` restores the *recorded* `occurredAt` via a direct insert because the append path would re-stamp `now()` (`scripts/seed-demo.ts:18-22`). Anyone tempted to restore events through `append()` will silently lose the original timestamps and re-sequence the run.
- **UNVERIFIED:** I did not separately confirm at runtime that `pg_advisory_xact_lock(hashtext(run_id))` never hash-collides across two distinct concurrent `run_id`s; collisions would only cause extra serialization (correctness-safe), not incorrect sequences, and the unique `(run_id, sequence)` index is the hard backstop. The code comment and the `test_cross_run_appends_independent` test treat distinct runs as non-contending (`append.test.ts:108`).

## Connects to

- [00-contracts-event-model.md](00-contracts-event-model.md) — the frozen `RunEventEnvelope`, `RunEventType`, `EvidenceRef`, `validateEventPayload`, and `scrubSecrets` this layer enforces; `AppendInput` is `RunEventEnvelope.omit({sequence, occurredAt})`.
- [03-runtime-kernel.md](03-runtime-kernel.md) — the sole caller of `append()`; it decides event semantics, emits failure events when the writer throws, allocates the run's RNG seed (persisted in `run.configured`), and owns energy/caps. The handoff is `EventStore.append`.
- [02-model-gateway-providers.md](02-model-gateway-providers.md) — produces the provider outputs that become event payloads; the redaction scrub here is the persistence-side twin of the gateway's no-secret discipline.
- [04-verifier-council-checks.md](04-verifier-council-checks.md) / [05-selection-scoring-reproduction.md](05-selection-scoring-reproduction.md) — emit critic/check/score/reproduction events through the kernel's append seam and resolve EvidenceRefs against this log.
- [06-projections-read-models.md](06-projections-read-models.md) — inject reducers into `replayRun`, read via `readByRun`, and rely on `canonicalSerialize` for state-equivalence; every projection table here is theirs to rebuild.
- [07-backend-api-rest-sse.md](07-backend-api-rest-sse.md) — `readByRun` backs rebuild-on-read REST queries and the SSE stream (SSE `id` = event `sequence` for gap-free resume).
- [09-observability.md](09-observability.md) — Langfuse is the non-authoritative side channel; the EvidenceRef resolver fails closed on `langfuseObservationId` so replay never calls it.
- [10-cross-cutting-safety.md](10-cross-cutting-safety.md) — the canonical statement of safety rules #2, #4, #7 this layer mechanically enforces.
- Spine: see OVERVIEW.md for where this layer sits in the whole system.
