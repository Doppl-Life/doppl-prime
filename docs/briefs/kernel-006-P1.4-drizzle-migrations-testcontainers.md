# /tdd brief — drizzle_migration_chain_and_pg_harness

## Feature
The Drizzle migration chain materializing the full canonical table set (§9), with `run_events` carrying the DB-level append-only enforcement + per-run monotonic-sequence constraint that back the rule-#2 invariant; a boot migrator that runs the SAME chain local + hosted (migrate → [seed] → start), idempotent on re-run; and the **testcontainers** integration-test harness (the user-chosen pattern for ALL kernel integration slices) that boots a real Dockerized Postgres, runs the chain, and asserts the schema + constraints against a real PG.

## Use case + traceability
- **Task ID:** P1.4 (Drizzle migration chain + canonical table set; first integration slice — stands up the testcontainers harness)
- **Architecture sections it implements:** `ARCHITECTURE.md §9` (Postgres authoritative; same migration chain at boot local+hosted; canonical 12-table set; embeddings authoritative-once-computed as an index over the `novelty.scored` vector; cached projections carry the `(runId, sequence)` watermark), `ARCHITECTURE.md §4` (`run_events` per-run `sequence` sole ordering key; `occurredAt` DB-stamped UTC, never used for ordering; JSONB payload)
- **Related context:** bootstrap (`1c301b1`) wired `test:integration` = `vitest run test/integration --passWithNoTests` — this slice adds the first integration tests there + the testcontainers harness. **PG harness = testcontainers (`@testcontainers/postgresql`), user-decided (Docker available)** — the pattern for P1.3/P1.4/P1.7/P1.8/P3. Module path: `apps/api/src/event-store/` (+ `apps/api/drizzle.config.ts` at the package root). The canonical table set + the `run_events` shape are derived from the frozen `@doppl/contracts` models (do NOT redefine contracts — the DB columns mirror them). **Safety-invariant (rule #2):** the append-only trigger + `unique(run_id, sequence)` ARE the DB-level enforcement of the append-only authoritative log → solo commit + security-reviewer fan-out at Step 8.

## Acceptance criteria (what "done" means)
- [ ] Migrations materialize the full canonical table set (§9): `runs`, `run_events`, `generations`, `agenomes`, `candidate_ideas`, `critic_reviews`, `check_results`, `fitness_scores`, `novelty_scores`, `lineage_edges`, `embeddings`, `dashboard_snapshots`
- [ ] `run_events` enforces **append-only at the DB**: any `UPDATE` or `DELETE` of a persisted row is rejected (trigger raising an exception), and a **`unique (run_id, sequence)`** constraint backs the per-run monotonic-sequence invariant (rule #2)
- [ ] `run_events.occurred_at` is DB-stamped (`timestamptz DEFAULT now()`, UTC), NOT caller-supplied; `payload` is `JSONB`
- [ ] The boot migrator runs the SAME ordered chain local + hosted, sequence = migrate → (seed/replay loader hook) → start, and is **idempotent**: re-running against an already-migrated DB is a clean no-op
- [ ] `embeddings` table stores `vector` (JSONB float array) + `embedding_model_id` + `dimension` as an index/query layer over the authoritative vector in `novelty.scored` — never the system of record (no pgvector required day-one; deferred per §9)
- [ ] Cached/rebuildable projections (`dashboard_snapshots` + any cached projection) carry the `(run_id, sequence)` watermark column they were built through
- [ ] **testcontainers harness:** a Vitest integration setup boots a real Dockerized Postgres, runs the migration chain, and the integration tests assert the schema + constraints against it (no mocks — project rule §16)
- [ ] `apps/api` `test:integration` runs the new tests green; `test:unit` unaffected; `/preflight` clean
- [ ] No contract redefinition (the columns mirror the frozen `@doppl/contracts` models; a needed contract change is a cross-track Finding, not an edit here)

## Wiring / entry point (Step 7.5)
`migrate.ts` (the boot migrator) is the production entry point — invoked at app boot (migrate → seed → start) and by the testcontainers harness before each integration run. The `schema.ts` table defs are consumed by the P1.3 append writer (the first writer through this schema) and every later projection/reader. So: `migrate.ts` is reachable at boot; first writer-consumer is P1.3 (which appends through the `run_events` schema + relies on this slice's append-only trigger + sequence constraint). The full app-boot wiring (`migrate → seed → start` in the server entry) lands with the runtime/worker (P3.12/P3.1) — name that: `boot-sequence wiring completes in P3`.

## Files expected to touch
**New:**
- `apps/api/src/event-store/schema.ts` — Drizzle table defs (the 12 canonical tables)
- `apps/api/src/event-store/migrations/` — the ordered migration chain (drizzle-kit-generated SQL + a hand-authored SQL migration for the append-only trigger / constraints drizzle can't express — see Step-2.5 Q2)
- `apps/api/drizzle.config.ts` — drizzle-kit config (schema path, out dir, dialect postgresql)
- `apps/api/src/event-store/migrate.ts` — boot migrator (idempotent; same chain local+hosted)
- `apps/api/test/integration/event-store/migrations.test.ts` — schema + constraint assertions against the container PG
- `apps/api/test/integration/setup/testcontainers-pg.ts` (or a Vitest `globalSetup`) — boots the Postgres container, runs the chain, exposes the connection

**Modified:**
- `apps/api/package.json` — add deps (`drizzle-orm`, `pg` or `postgres`) + devDeps (`drizzle-kit`, `@testcontainers/postgresql`) + a `db:generate` script (per-consuming-slice deps, LESSONS 2)
- `apps/api/vitest.config.ts` (or a new `vitest.integration.config.ts`) — integration project: `globalSetup` for the container + a longer hook timeout (container boot)
- `pnpm-lock.yaml` (root) — generated by install (explicit `git add`; build artifact; lead reconciles at merge)

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)
Integration tests in `apps/api/test/integration/event-store/migrations.test.ts` (against the testcontainers PG; `spec(§9)` / `spec(§4)`):

1. **`test_migration_chain_creates_canonical_table_set`** — after migrate, all 12 canonical tables exist. Why: §9 canonical set.
2. **`test_run_events_rejects_update_and_delete`** — an `UPDATE` and a `DELETE` against a persisted `run_events` row both raise (append-only trigger). Why: §4/rule #2 append-only authoritative log (the load-bearing assertion).
3. **`test_run_events_unique_run_id_sequence`** — inserting a duplicate `(run_id, sequence)` is rejected by the unique constraint. Why: §4 per-run sequence is the sole ordering key — monotonic and gapless backing.
4. **`test_occurred_at_db_stamped_utc`** — an insert without `occurred_at` gets a DB-stamped UTC value; a caller cannot drive ordering by it. Why: §4 occurredAt DB-stamped, never ordering.
5. **`test_migrate_is_idempotent`** — running `migrate` twice against the same DB is a clean no-op (no error, no duplicate objects). Why: §9 same chain at boot, idempotent.
6. **`test_embeddings_table_shape`** — `embeddings` has `vector` (jsonb) + `embedding_model_id` + `dimension` columns (index over the authoritative novelty.scored vector). Why: §9 embeddings authoritative-once-computed.
7. **`test_cached_projection_carries_watermark`** — `dashboard_snapshots` carries the `(run_id, sequence)` watermark column. Why: §9 cached projections are rebuilt/discarded by watermark.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** none — the DB columns MIRROR the frozen `@doppl/contracts` models; nothing in `packages/contracts` is touched. If a column can't mirror a contract field cleanly, that's a cross-track Finding (flag at Step 2.5), not a contract edit.
- **Orchestrator doc rows to write hot (Step 9):** a likely **LESSONS** entry (the testcontainers harness shape + the append-only-trigger-not-expressible-in-Drizzle-DSL pattern). Possibly an `apps/api/CLAUDE.md` note that the canonical table set lives in `schema.ts` (mirrors §9).
- **Shared-contract seam model touched?** No — consumes the frozen models as column shapes; redefines nothing.

## Things to flag at Step 2.5
1. **testcontainers lifecycle.** My default vote: **one shared container via Vitest `globalSetup`** (boot once, migrate once, share the connection across the integration suite) — faster than per-suite containers and sufficient for a hermetic run; each test uses a fresh transaction / truncates as needed. Flag if you prefer per-file isolation.
2. **Trigger / constraints drizzle-kit can't express.** The append-only `UPDATE`/`DELETE` trigger is raw SQL (not in the Drizzle schema DSL). My default vote: **drizzle-kit generate for the tables + a hand-authored SQL migration in the same ordered chain** for the trigger (and any constraint drizzle can't emit), so the chain stays single-source + idempotent.
3. **Append-only mechanism.** My default vote: a **`BEFORE UPDATE OR DELETE` trigger on `run_events` that `RAISE`s an exception** (portable, clear error, testable) — over `REVOKE` privileges (role-dependent, harder to test hermetically).
4. **pg client + driver.** My default vote: **`postgres` (postgres.js) or `pg`** as the Drizzle driver — pick what Drizzle's current Postgres adapter recommends; add it as a runtime dep this slice (first DB consumer). Confirm via the Drizzle docs (Context7) for the version-correct `drizzle-orm/<driver>` import + migrator API.
5. **Slice size.** This is a large slice (harness + 12 tables + trigger + boot migrator). My default vote: **keep it whole** (the migration chain + its test harness are one cohesive, bisectable unit; the harness has nothing to test without the schema). Flag at Step 2.5 if you'd rather split the harness from the schema.

## Dependencies + sequencing
- **Depends on:** bootstrap `kernel-001` (`1c301b1`); the frozen `@doppl/contracts` models (column shapes); the testcontainers harness decision (testcontainers, confirmed). Independent of the gateway chain.
- **Blocks:** P1.3 (the append writer writes through this schema + relies on the append-only trigger + sequence constraint), P1.7/P1.8 (resolver/replay read these tables), P3 (boot migrator in the worker boot sequence), and every later integration slice (reuses the testcontainers harness).

## Estimated commit count
**1.** Safety-invariant slice (rule #2 — the append-only + sequence-uniqueness DB enforcement). OWN commit, never bundled; **security-reviewer fan-out at Step 8** (invariant policy — focus the append-only trigger + the unique-sequence constraint actually reject the forbidden operations). Large but cohesive; if it must split, the trigger/constraint half stays its own invariant commit.

## Lessons-logged candidates anticipated
- **Convention candidate** — "the testcontainers integration harness shape (shared container via globalSetup, migrate-then-test against real PG); the append-only enforcement is a hand-authored SQL trigger in the Drizzle migration chain (not expressible in the schema DSL), and the chain stays single-source + idempotent."
- **Architecture-doc note candidate** — none anticipated (§9 already names the canonical set + the boot sequence).

## How to invoke
1. **Read this brief end-to-end** — safety-invariant (rule #2 DB enforcement): own commit + Step-8 security-reviewer; first integration slice (testcontainers).
2. **Use Context7** for version-correct Drizzle Kit / drizzle-orm Postgres migrator + `@testcontainers/postgresql` APIs before writing config.
3. **Run `/tdd drizzle_migration_chain_and_pg_harness`.**
4. **Step 0 (Restate)** — confirm the restatement matches the Feature line.
5. **Step 2.5** — answer the 5 design questions (esp. Q1 lifecycle + Q2/Q3 trigger), send the Step-2.5 write-up.
6. **Step 8** — `security-reviewer` on the slice diff (append-only trigger + unique-sequence focus).
7. **Step 9** — surface the harness/trigger lesson candidate.
