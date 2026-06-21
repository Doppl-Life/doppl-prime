# /tdd brief — mutating_endpoints

## Feature
The REST **write path** + the **Fastify server bootstrap** (`apps/api`): `POST /runs` (validate `RunConfig`/`RunCaps`, reject any cap override above the validated maxima, idempotent via key, concurrency-guarded to one active run, append `run.configured`) and `POST /runs/:id/stop` (idempotent — already-terminal is a no-op success; a successful stop moves the run to terminal preserving partial evidence). REST is the **sole write path** — these endpoints append authoritative events via the P1.3 writer and **never mutate projections directly**. The Fastify server is stood up here (slice-0 bootstrap, folded in) with a **`bodyLimit`** request-body gate (the carry-forward security pin that pairs with the P0.10 payload ceiling).

## Use case + traceability
- **Task ID:** P6.6 (idempotent mutating endpoints) **+ the slice-0 Fastify server bootstrap** (apps/api has no HTTP server yet).
- **Architecture sections it implements:** `ARCHITECTURE.md §11` (REST commands; mutating endpoints idempotent via idempotency key / terminal-state guard), `§15` (one active run at a time; config Zod-validated, fail-fast at boot/ingestion), `§14` (REST is the write path; the `bodyLimit` ingestion gate — Browser→API boundary).
- **Related context:** key safety rules **#2** (REST appends authoritative events; never mutate projections directly) and **#1-adjacent** (the API rejects cap overrides above the validated maxima — defense layer; the KERNEL is the authoritative cap enforcer). Consumes `validateRunConfig` (P0.3 — the canonical boot/ingestion config entry, carry-forward), the P1.3 event-store `append`, and the P6.2 current-state (to detect an active run). **bodyLimit carry-forward CONSUMED here** (the API-layer request-byte gate the P0.10 append-path ceiling pairs with). **The kernel that EXECUTES a configured run is P3 (unmerged)** — this slice builds the endpoint (validate + idempotent append + concurrency), testable against the real event store; the run's execution is integration-time (a sequencing note, not a blocker).

## Acceptance criteria (what "done" means)
- [ ] `POST /runs` validates `RunConfig`/`RunCaps` via `validateRunConfig` (P0.3); an invalid config **fails fast** with a clear validation error and appends **no** `run.configured`
- [ ] `POST /runs` **rejects any cap override above the validated maxima** (only lowering within the ceilings is allowed) — an over-cap request is refused, never clamped-silently-up
- [ ] `POST /runs` is **idempotent via an idempotency key**: a repeated request with the same key returns the **same run** (no second run, no duplicate `run.configured`)
- [ ] **Concurrency: one active run at a time** — starting a run while one is non-terminal (per the P6.2 current-state) is **refused** (clear error), not silently queued
- [ ] `POST /runs/:id/stop` is **idempotent**: stopping an already-terminal run is a **no-op success**; a successful stop appends the terminal event and moves the run terminal **preserving partial evidence**
- [ ] These endpoints append authoritative events via the P1.3 writer **only** — they never mutate a projection directly (REST = sole write path, rule #2)
- [ ] The Fastify server is bootstrapped with a **`bodyLimit`** request-body gate (an over-limit body is rejected at ingestion, before the per-type payload ceiling) — the §14 carry-forward
- [ ] Integration tests (testcontainers, real PG + a real Fastify instance via `inject`) pass; **both counts reported**; `/preflight` clean

## Wiring / entry point (Step 7.5)
**Entry point — the Fastify server** (`apps/api/src/server.ts` or `app.ts`), bootstrapped here; `POST /runs` + `POST /runs/:id/stop` are registered routes. The run's **execution** (the kernel picking up `run.configured`) is **P3 (unmerged)** — named, integration-time. The read endpoints (P6.7) register on this same server next. So: *entry — the Fastify app (this slice stands it up); the kernel execution wires at P3 integration; P6.7 read routes register on this server.*

## Files expected to touch
**New:**
- `apps/api/src/server.ts` (or `app.ts`) — the Fastify bootstrap (bodyLimit, route registration, Zod-validated config at boot)
- `apps/api/src/routes/runs.ts` — `POST /runs` + `POST /runs/:id/stop`
- `apps/api/src/middleware/idempotency.ts` — the idempotency-key mechanism
- `apps/api/test/integration/routes/runs.test.ts` — testcontainers + Fastify `inject`
- (unit tests for the cap-override-rejection + idempotency logic where pure)

**Modified:**
- `apps/api/package.json` — add `fastify` (flag at Step 9 — manifest/lockfile delta; the obs impl owns apps/api deps)
- `apps/api/src/index.ts` — export/start the server as appropriate

**Do NOT** stage `apps/web/*`, `pnpm-lock` web entries, or my hot-routing files.

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)
Integration (`apps/api/test/integration/routes/runs.test.ts`, testcontainers + Fastify `inject`; `spec(§11)`/`spec(§14)`/`spec(§15)`):
1. **`test_post_runs_valid_appends_run_configured`** — a valid config → 2xx + exactly one `run.configured` appended. *(Positive guard.)* Why: §11 command path.
2. **`test_post_runs_invalid_config_fails_fast_no_append`** — an invalid config → a clear validation error, **no** `run.configured`. Why: §15 fail-fast.
3. **`test_post_runs_rejects_over_cap_override`** — a cap above the validated maxima → refused; a lowering within ceilings → accepted. Why: §11 cap-override rule.
4. **`test_post_runs_idempotent_same_key`** — repeated POST with the same idempotency key → the same run, no second `run.configured`. Why: §11 idempotency.
5. **`test_one_active_run_refused`** — starting while a run is non-terminal → refused (not queued). Why: §15 one active run.
6. **`test_stop_idempotent_terminal_noop`** — stop on already-terminal → no-op success; stop on active → terminal + partial evidence preserved. Why: §11 stop idempotency.
7. **`test_body_limit_rejects_oversize_request`** — an over-`bodyLimit` request body → rejected at ingestion (before the per-type ceiling). Why: §14 bodyLimit carry-forward.
8. **`test_endpoints_never_mutate_projection_directly`** — the write path appends events only (no direct projection write). Why: rule #2.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** none (consumes frozen `RunConfig`/`RunCaps` + `validateRunConfig`; defines route/middleware internals).
- **§2.5-seam touched?** No.
- **Orchestrator doc rows (Step 9):** a likely **LESSONS** entry (the Fastify write-path bootstrap — bodyLimit + idempotency + one-active-run concurrency + REST-appends-only). I author hot. The **bodyLimit carry-forward → DELETE** at `/orchestrate-end` once this lands (I triage).

## Things to flag at Step 2.5
1. **Fastify bootstrap folded into this slice?** My default vote: **yes** (apps/api has no server; the bootstrap + bodyLimit + route registration land here — like the P7.1 Vite bootstrap). Flag if you'd rather a standalone bootstrap slice.
2. **Idempotency mechanism.** My default vote: an **idempotency key** (header `Idempotency-Key` or a config field) for `POST /runs` → same key returns the existing run; **terminal-state guard** for `/stop` (already-terminal → no-op). Confirm the key source (header vs body).
3. **Active-run detection (concurrency).** My default vote: query the **P6.2 current-state** for a run in a non-terminal status; refuse a new start if one is active (§15 one-active-run). Confirm using current-state (vs a dedicated lock).
4. **Cap-maxima source.** My default vote: `validateRunConfig` (P0.3) yields the validated config; the API rejects any cap above the configured/default ceiling (lowering-only). Confirm where the ceiling comes from (the validated defaults).
5. **Stop's terminal event + partial evidence.** My default vote: `/stop` appends the appropriate terminal event (e.g. `run.stopped`); "preserving partial evidence" = it does not delete/rewrite prior events (append-only — the partial state stays in the log). Confirm the stop event type.

## Dependencies + sequencing
- **Depends on:** **P6.5** (redaction — merged), **P6.2** (current-state for active-run detection — `ef43fca`), P0.3 (`validateRunConfig`), P1.3 (`append`). **No live P3 needed** (the endpoint, not the kernel execution). Independent of apps/web.
- **Blocks:** P6.7 (read endpoints register on this server), P6.9 (SSE on this server), the demo run-control flow (PD).

## Estimated commit count
**1.** The write path + Fastify bootstrap (one coherent foundation). **Cap-override-rejection + bodyLimit + REST-appends-only are security-relevant boundary checks** (not the kernel cap invariant itself, which is rule #1 in P3). **Step-8 reviewers:** **security-reviewer recommended** (focus: cap-override rejected not silently clamped-up; bodyLimit gates before the ceiling; idempotency can't start a second run; one-active-run holds; endpoints append-only never mutate a projection). code-quality = phase-boundary.

## Lessons-logged candidates anticipated
- **Convention candidate** — "the REST write path: Fastify bootstrap with a `bodyLimit` ingestion gate (pairs with the P0.10 ceiling); `validateRunConfig` at ingestion (fail-fast, no event on invalid); cap overrides rejected above the validated maxima (lowering-only — the API defense layer, the kernel is the authoritative enforcer); idempotency-key dedup + one-active-run concurrency guard via the current-state; endpoints append authoritative events ONLY, never mutate a projection (rule #2)."
- **Architecture-doc note candidate** — possibly a §11 note pinning the idempotency-key + one-active-run mechanism.

## How to invoke
> The demo-observability (apps/api) implementer session is oriented — skip `/session-start`; jump to `/tdd`. cwd `apps/api/`. Stage only `apps/api/...` (+ the fastify manifest/lockfile delta — flag at Step 9), never `-A`.

1. **Read this brief end-to-end** — folds the Fastify bootstrap; integration tests use testcontainers + Fastify `inject`; consumes the bodyLimit carry-forward.
2. **Run `/tdd mutating_endpoints`.**
3. **Step 0/1** — confirm restatement + file list (note the fastify dep add).
4. **Step 2.5** — answer the 5 design questions (esp. Q2 idempotency-key source + Q3 active-run-via-current-state), send the write-up + per-acceptance-bullet coverage map.
5. **Step 8** — security-reviewer recommended (write-path boundary focus).
6. **Step 9** — surface the LESSONS candidate; note the fastify manifest delta; the bodyLimit carry-forward is now consumable → I DELETE it at `/orchestrate-end`.
