---
title: "feat: Phase D — Demo (local-first showcase path)"
type: feat
status: active
created: 2026-06-20
owner: melissa
depth: standard
spec_anchors:
  - ARCHITECTURE.md §17
  - ARCHITECTURE.md §16
  - ARCHITECTURE.md §11
  - ARCHITECTURE.md §12
  - ARCHITECTURE.md §13
  - IMPLEMENTATION_PLAN.md Phase D (PD.1–PD.8)
depends_on:
  - docs/plans/2026-06-19-001-feat-scaffold-and-phase-0-contract-freeze-plan.md
  - docs/plans/2026-06-19-002-feat-phase-1-persistence-and-event-store-plan.md
  - docs/plans/2026-06-19-003-feat-phase-2-model-gateway-plan.md
  - docs/plans/2026-06-19-004-feat-phase-3-runtime-kernel-plan.md
  - docs/plans/2026-06-19-005-feat-phase-4-verifier-council-plan.md
  - docs/plans/2026-06-19-006-feat-phase-5-selection-plan.md
  - docs/plans/2026-06-19-007-feat-phase-6-projections-api-observability-plan.md
  - docs/plans/2026-06-19-008-feat-phase-7-dashboard-plan.md
---

## Summary

Phase D of `IMPLEMENTATION_PLAN.md` — **the local-first demo closing piece**. Stands up the narrowest end-to-end LIVE demo path AND its safety net entirely from already-shipped subsystems. **Introduces ZERO new contract surface**: no new `RunEventType`, no new Appendix-A model, no new `payload` schema. Adds the prepared-replay capture→store→seed pipeline, the operator-driven three-rung fallback ladder (low-cap live → prepared known-good run → labeled replay), the unified `migrate → seed-demo → start API/web` boot sequence parameterized only by env, the operator-entered live prompt path wired through the existing `POST /runs` write path, replay-mode awareness on the dashboard's existing `ModeIndicator` + `HealthPanel`, and the six §16 demo-rehearsal scripts + a `DEMO_RUNBOOK.md`.

Built via `/ce-plan` → `/ce-work`. Plan at `docs/plans/2026-06-20-009-feat-phase-d-demo-plan.md`.

## Problem Frame

Phases 0-7 shipped a correct system. The June 29 showcase needs a *demonstration* of that system: an operator types a prompt or picks a prepared one, hits Start, the room watches generations climb on the fitness chart and candidates spawn in the lineage tree, the final-surviving-idea proof panel resolves every evidence link, and if the live provider hiccups in front of the audience the operator slides to a prepared run or a labeled replay without ever touching code.

Today the operator can run the dashboard against any live API + Postgres, but:

1. **No replay fixture** exists to fall back to if a provider stalls mid-demo.
2. **Boot is multi-step** (docker compose, pnpm dev × 2) with no fail-fast config validation.
3. **The fallback ladder is undocumented** — the operator has to know to lower caps, switch to a prepared run, or load a replay manually.
4. **The replay-mode indicator** that Phase 7 wired requires a server hint to actually distinguish live from replay — the data path exists but the discriminator isn't plumbed.
5. **No rehearsal artifact** lets the team verify the §16 demo paths before the showcase.

Phase D closes all five gaps with thin orchestration. No invariant gets cut.

---

## Scope

### In scope

- **`dump-replay.ts`** (PD.1) — exports a completed run's events to `fixtures/replay/<runId>.json` strictly ordered by `(runId, sequence)`. Rejects non-terminal runs. Carries the run's `schemaVersion` verbatim. No model/web/embedding calls (reads persisted events only).
- **`seed-demo.ts`** (PD.2) — loads a committed replay fixture into a demo DB strictly AFTER migrations. Idempotent. Fails fast when fixture `schemaVersion > current` with a re-record instruction.
- **`boot-demo.ts`** (PD.3) — single tsx entrypoint (D2) chaining `migrate → seed-demo → start API/web` in a fixed order. Zod-validates config; fail-fast checks required env (provider keys, DB URL) BEFORE the worker starts. Postgres is the only authoritative dependency; Langfuse absence degrades cleanly.
- **`fallback-ladder.ts` + `demo-cap-override.ts`** (PD.4) — server-side controller surfacing the three rungs to the dashboard. Cap override ONLY lowers caps within validated maxima; existing browser-side cap-max guard + the server-side `RunConfig.parse` continue to reject above-ceiling values. Switching rungs never mutates a prior rung's authoritative state.
- **`OperatorPromptPanel.tsx` + `demo-run-config.ts`** (PD.5) — web panel that accepts either a prepared problem-set selection OR an operator-entered prompt. Both flow through the existing `POST /runs` write path with full Zod validation + Idempotency-Key. Operator-entered prompt text is treated as DATA — the existing Phase 4 isolation seam handles it.
- **Replay-mode awareness** (PD.6) — extends Phase 7's `ModeIndicator` + `HealthPanel`. A server-side flag (carried on `GET /runs/:id` and the SSE handshake) distinguishes a live run from a replay-served one. `HealthPanel` continues to render the continue-vs-switch signal; stale `lastHeartbeatMs` triggers a visible "consider fallback" hint.
- **Final-surviving-idea proof panel deep-link validation** (PD.7) — Phase 7 U14 shipped the panel + 6 links. PD.7 confirms via tests that each link resolves through the boot-demo path against a recorded fixture, and that transfer-check evidence (live allowlisted vs replay-backed) is clearly labeled.
- **Six rehearsal scripts** (PD.8) — testcontainers integration tests (D3): prepared run / provider-failure→replay / low-cap live / evidence walkthrough / fallback ladder / config-boot smoke. Each runs the full demo path against an isolated Postgres container + the `RecordedGateway`. `DEMO_RUNBOOK.md` documents the manual operator equivalents.

### Deferred to Follow-Up Work

- Hosted demo deployment. Phase D is local-first; PD-equivalent hosted wiring lives in a future iteration.
- Dark-mode polish, multi-prompt history, mobile layout — already deferred from Phase 7.
- Schema-version upcast. The MVP policy is **re-record on bump**, not auto-upcast. `seed-demo.ts` surfaces the re-record instruction and fails fast.
- A standalone CLI (`pnpm cli:start-run`) for non-dashboard operators. Out of scope for the showcase.

### Out of scope

- **Any new `RunEventType` or Appendix-A model.** Phase D is explicit: zero new contract surface.
- Replacing Phase 7's existing `ModeIndicator` or `HealthPanel` — those are extended in-place, not duplicated under a `demo/` directory (the spec's "(NEW)" file paths were aspirational from before Phase 7 shipped).
- Re-running CI's existing invariant/safety tests under the demo path. Those tests stay as-is.

---

## Key Technical Decisions

### D1. Fixtures live at `fixtures/replay/` at repo root

Matches §17 / PD.1 verbatim ("dump ordered run_events JSON under `fixtures/replay/<runId>.json`"). Easy to gitignore selectively: committed fixtures stay in repo; ad-hoc captures go to `fixtures/replay/.local/` (gitignored). Both `apps/api/scripts/dump-replay.ts` and `apps/web/tests/e2e/` read from this path without crossing workspace boundaries.

### D2. Boot orchestration is a TypeScript runner via tsx

`apps/api/scripts/boot-demo.ts` imports the existing `runMigrations` helper (Phase 1), the new `seedDemo` loader (PD.2), and the `createServer` factory (Phase 6) + Worker class (Phase 3). Single `pnpm boot:demo` invocation runs everything in order with shared error handling. Config validation is one `RunConfig.safeParse` at the top; required env (`DATABASE_URL`, `OPENAI_API_KEY` if live mode, etc.) is checked via a Zod env schema before the worker spins up. Mirrors the established `apps/api/src/event-store/migrate.ts` pattern.

### D3. Rehearsal scripts are testcontainers integration tests

Each `apps/api/__integration_tests__/rehearsals/*.int.test.ts` spins up its own Postgres container (using the existing `startPgContainer` helper from Phase 1), boots the demo path against a `RecordedGateway` fixture, and asserts the §16 expectation. Runs via `pnpm -w test:int` — no special CI gate needed. The DEMO_RUNBOOK.md documents the parallel manual operator steps (open dashboard, click button, observe X).

The acceptance criterion "rehearsals reuse existing invariant/safety tests" is honored: the rehearsals invoke the same `appendEvent` / `replayReader` / `runGeneration` / verifier+selection paths the unit + integration tests exercise.

### D4. Replay-mode discriminator: a server-side `mode` flag on the SSE stream + `GET /runs/:id`

The Phase 7 plan flagged this as an open finding ("Live vs replay discriminator isn't in Phase 6's SSE frames"). PD resolves it without widening the event log: the **HTTP response shape** (which is NOT in the closed `RunEventType` enum) carries a `runMode: "live" | "replay" | "rehearsal"` field on the `/runs/:id` projection and on the SSE handshake frame. The dashboard reads this on connect and labels the mode accordingly. Run events themselves are unchanged — the runMode is a runtime flag, not an event property.

Concretely: a run started via `dump-replay` → `seed-demo` is marked `runMode: "replay"` via a `runs.mode` column (NEW: tiny migration that doesn't touch `run_events`). A new run via `POST /runs` is `runMode: "live"` by default. The fallback ladder controller writes the mode at run-creation time.

### D5. Demo cap override only lowers; never bypasses validation

`demo-cap-override.ts` exports `applyDemoOverride(config, override)` returning a `RunConfig` with caps lowered per the override but never raised. The result still goes through `RunConfig.parse(...)` at `POST /runs` — there's no bypass path. Above-ceiling overrides are silently clamped to the ceiling AND a warning is included in the response so the operator knows.

### D6. Operator-entered prompt path is identical to the curated-problem path

`PD.5` does NOT introduce a new event type or write path. The operator's typed prompt becomes the seed/`problemStatement` field of a normal `RunConfig`; the existing `startRun` → `appendEvent("run.configured")` flow handles it. The candidate-as-DATA isolation seam from Phase 4 prevents prompt-injection attacks on critics — that safety pin is structurally enforced and Phase D inherits it.

### D7. Three-rung ladder is operator-driven, not auto-advancing

The fallback-ladder controller exposes a small API (`activateRung1/2/3`) the dashboard calls via new endpoints (`POST /demo/ladder/{prepared|replay}`). Each rung transition starts a NEW run via the existing `POST /runs` path (rung 1 + 2) OR mounts a replay-served projection (rung 3). The previous rung's run stays terminal and inspectable. **The operator controls timing.** No auto-switch.

---

## High-Level Technical Design

```
┌─────────────────────────────────────────────────────────────────┐
│ apps/api/scripts/boot-demo.ts                                    │
│                                                                  │
│   1. Zod-validate env (DATABASE_URL, optional provider keys)     │
│   2. runMigrations(pool)                                         │
│   3. seedDemo(db, fixturesDir)                                   │
│   4. createServer({ db, registry, ... }).listen(PORT)            │
│   5. new Worker({ db, processRun }).start()                      │
└─────────────────────────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│ Hono server (Phase 6) extended with:                             │
│   POST /demo/runs/{prepared|live}     (PD.5)                     │
│   POST /demo/ladder/replay/:fixtureId (PD.4)                     │
│   GET  /runs/:id  → now carries runMode                          │
└─────────────────────────────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────────┐
│  Dashboard (Phase 7) extended with:                              │
│    OperatorPromptPanel  → curated-set selector + prompt textarea │
│    ModeIndicator  → now distinguishes 'replay' (server flag)     │
│    HealthPanel    → 'consider fallback' hint on stale heartbeat  │
└──────────────────────────────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────────┐
│  Six rehearsal int tests (PD.8) — testcontainers per file:       │
│    prepared-run / provider-failure-replay / low-cap-live /       │
│    evidence-walkthrough / fallback-ladder / config-boot-smoke    │
└──────────────────────────────────────────────────────────────────┘
```

> *Directional guidance; not implementation specification.*

---

## Output Structure

```
apps/api/
  scripts/
    boot-demo.ts                              ← PD.3 entrypoint
  src/
    event-store/
      scripts/
        dump-replay.ts                        ← PD.1
        seed-demo.ts                          ← PD.2
      migrations/
        0005_runs_mode.sql                    ← runs.mode column (PD.4 D4)
    runtime/
      demo/
        fallback-ladder.ts                    ← PD.4 server controller
        demo-cap-override.ts                  ← PD.4 cap clamp
        demo-run-config.ts                    ← PD.5 prepared vs operator config
    http/
      routes/
        demo.ts                               ← PD.4/PD.5 endpoints
  __integration_tests__/
    dump-replay.int.test.ts
    seed-demo.int.test.ts
    boot-demo.int.test.ts
    fallback-ladder.int.test.ts
    rehearsals/
      prepared-run.rehearsal.int.test.ts
      provider-failure-replay.rehearsal.int.test.ts
      low-cap-live.rehearsal.int.test.ts
      evidence-walkthrough.rehearsal.int.test.ts
      fallback-ladder.rehearsal.int.test.ts
      config-boot-smoke.rehearsal.int.test.ts

apps/web/
  src/
    demo/
      OperatorPromptPanel.tsx                 ← PD.5 (curated set + prompt)
      __tests__/
        OperatorPromptPanel.test.tsx
    panels/
      ModeIndicator.tsx                       ← MODIFIED for replay flag (PD.6)
      HealthPanel.tsx                         ← MODIFIED for 'consider fallback' (PD.6)
      FinalIdeaPanel.tsx                      ← MODIFIED for transfer-check labeling (PD.7)
    state/
      runStore.tsx                            ← MODIFIED: server runMode flag wins over local mode
    data/
      contracts.ts                            ← extend RunHealth / runs/:id with runMode

fixtures/
  replay/
    .gitkeep                                  ← committed seeds land here
    .local/                                   ← gitignored dev captures
    .gitignore                                ← per-dir gitignore for .local
  curated-prompts/
    cross-domain-transfer.json
    zeitgeist-synthesis.json

docs/
  DEMO_RUNBOOK.md                             ← PD.8 manual operator steps
```

---

## Implementation Units

### U1. `dump-replay.ts` export script

**Goal:** Read a completed run's events via `replayReader`, write a strictly-ordered JSON artifact to `fixtures/replay/<runId>.json` carrying the run's `schemaVersion`. Reject non-terminal runs. No model/web/embedding calls (it's a pure DB read).

**Requirements:** PD.1.

**Dependencies:** Phase 1 `replayReader`, Phase 6 `buildRunHealth` (for terminal-status check).

**Files:**
- Create: `apps/api/src/event-store/scripts/dump-replay.ts`
- Create: `apps/api/__integration_tests__/dump-replay.int.test.ts`
- Create: `fixtures/replay/.gitkeep`
- Create: `fixtures/replay/.gitignore` (excludes `.local/`)

**Approach:** `dumpReplay({ db, runId, outDir }) → { path, eventsExported, schemaVersion }`. Reads events via `replayReader(db).events(runId)` into an array. Checks the last event is a terminal one (`run.completed | run.stopped | run.failed | run.cancelled`); throws `DumpRefusedError` if not. Writes `JSON.stringify({ runId, schemaVersion, exportedAt, events: [...] }, null, 2)` to `outDir/<runId>.json`. The CLI shim parses args: `tsx dump-replay.ts <runId>`.

**Test scenarios:**
- Happy path: a completed run exports its events in `(runId, sequence)` order; file readable + JSON-parses.
- Non-terminal run → throws `DumpRefusedError`.
- `schemaVersion` in the artifact equals the persisted envelope's value.
- Unknown runId → 0 events found → throws.
- File path is repo-relative `fixtures/replay/<runId>.json`.

**Verification:** A dump of a sample run loads cleanly back via `seed-demo.ts` (U2).

---

### U2. `seed-demo.ts` loader

**Goal:** Load a committed replay fixture into a demo DB strictly AFTER migrations. Idempotent. Fails fast on `schemaVersion > current`.

**Requirements:** PD.2.

**Dependencies:** U1 fixture shape, Phase 1 `appendEvent` (or direct insert via raw SQL to preserve exact sequence + id + occurredAt — the trigger blocks updates but inserts of historical rows are allowed).

**Files:**
- Create: `apps/api/src/event-store/scripts/seed-demo.ts`
- Create: `apps/api/__integration_tests__/seed-demo.int.test.ts`

**Approach:** `seedDemo({ db, fixturePath }) → { runId, eventsLoaded }`. Reads the JSON. Verifies `schemaVersion ≤ CONTRACTS_SCHEMA_VERSION` (else throws `SchemaVersionMismatchError` with a re-record instruction). Inserts a `runs` row at `status: "completed"` with the fixture's runId and `mode: "replay"`. Inserts each event directly into `run_events` via raw SQL preserving `id, run_id, sequence, occurred_at, schema_version, payload` verbatim. Idempotent via `ON CONFLICT (run_id, sequence) DO NOTHING`.

Required tables: checks the migrations have run (queries `pg_tables` for `run_events`, `runs`, `worker_heartbeats`). Refuses with a clear "run migrations first" error if any are missing.

**Test scenarios:**
- Happy path: fixture loads; replay produces the same projection as the original.
- `schemaVersion > current` → `SchemaVersionMismatchError`.
- Missing migration → "run migrations first" error.
- Re-seed (idempotent): loading the same fixture twice produces no duplicate events.
- Loaded run is queryable via `GET /runs/:id` after seeding.

**Verification:** Phase 7 dashboard can load the seeded run's lineage + replay-summary projections.

---

### U3. Migration `0005_runs_mode.sql` + extended runs row

**Goal:** Add a `mode TEXT NOT NULL DEFAULT 'live'` column to the `runs` table. Backfills existing rows to 'live'. Distinguishes live vs replay-seeded runs without widening `run_events`.

**Requirements:** D4 from this plan; consumed by U6, U7, U10.

**Dependencies:** Phase 1 migrations chain.

**Files:**
- Create: `apps/api/src/event-store/migrations/0005_runs_mode.sql`
- Modify: `apps/api/src/event-store/migrations/meta/_journal.json` (add idx 5)
- Modify: `apps/api/src/event-store/schema.ts` (add `mode` column)
- Modify: `apps/api/__integration_tests__/migrations-idempotent.int.test.ts` (update snapshot + count to 15 tables)

**Approach:** Trivial migration. `ALTER TABLE runs ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'live'`. Drizzle schema updated. Existing seeded runs land at 'live' by default; PD.5 sets 'replay' when seeding.

**Test scenarios:**
- Migrations idempotent test still passes with updated snapshot.
- Pre-existing rows backfilled to 'live'.
- New rows accept 'live', 'replay', 'rehearsal'.

**Verification:** `pnpm --filter @doppl/api db:migrate` succeeds. `runs.mode` is queryable.

---

### U4. `fallback-ladder.ts` + `demo-cap-override.ts`

**Goal:** Server-side controller exposing the three rungs as small APIs. `applyDemoOverride(config, override)` clamps caps to the ceiling. `activateLowCapLive`, `activatePreparedRun`, `activateReplay` start each rung's run via the existing write path (or mount a replay-served projection).

**Requirements:** PD.4.

**Dependencies:** U3 (runs.mode), Phase 6 `startRun`, U2 (seedDemo for prepared/replay).

**Files:**
- Create: `apps/api/src/runtime/demo/demo-cap-override.ts`
- Create: `apps/api/src/runtime/demo/fallback-ladder.ts`
- Create: `apps/api/__integration_tests__/fallback-ladder.int.test.ts`

**Approach:** `applyDemoOverride(config, { maxPopulation?, energyBudget?, ... })` returns a new `RunConfig` where each cap is `min(config.caps[k], override[k] ?? config.caps[k])` — only lowering, never raising. If override > ceiling, clamped to ceiling and a `warnings[]` entry is added to the result.

`activateLowCapLive({ baseConfig, override })` calls `applyDemoOverride` then `startRun(db, finalConfig)`. The returned run has `mode: "live"`.

`activatePreparedRun({ db, fixtureRunId })` reads the prepared fixture from `fixtures/replay/prepared/<id>.json` and starts it as a live run via `startRun` — the "prepared known-good" rung means the operator runs a curated `RunConfig` against the live providers, not a seeded fixture.

`activateReplay({ db, fixturePath })` calls `seedDemo(...)` and returns the seeded runId (which now carries `mode: "replay"`).

None of the three rungs mutate prior-rung state.

**Test scenarios:**
- `applyDemoOverride` lowers `maxPopulation: 10 → 4` correctly.
- Above-ceiling override clamped to MAX_CAPS + warning included.
- Below-floor override (negative, NaN) → 400 from caller's Zod parse (no need for explicit guard).
- `activateLowCapLive` produces a run row with `mode: 'live'` and lowered caps.
- `activateReplay` produces a run row with `mode: 'replay'` and the fixture's events loaded.
- Switching rungs: rung-1 run remains terminal/inspectable after rung-2 starts.

**Verification:** Fallback paths from the dashboard work end-to-end against testcontainers.

---

### U5. `demo-run-config.ts` + curated prompt fixtures

**Goal:** Helper that builds a `RunConfig` from either a prepared problem set OR an operator-entered prompt. Both go through `RunConfig.parse` + the normal write path.

**Requirements:** PD.5.

**Dependencies:** U4 (cap-override available), Phase 0 RunConfig schema.

**Files:**
- Create: `apps/api/src/runtime/demo/demo-run-config.ts`
- Create: `fixtures/curated-prompts/cross-domain-transfer.json`
- Create: `fixtures/curated-prompts/zeitgeist-synthesis.json`
- Create: `apps/api/__integration_tests__/demo-run-config.int.test.ts`

**Approach:** `buildDemoConfig({ source: "prepared" | "operator", problemId?, operatorPrompt?, capOverride? })` returns a `RunConfig`. For `prepared`, loads the curated JSON (a small structured doc: { seed, prompt, defaultCaps, subtypes }). For `operator`, requires `operatorPrompt: string`, applies sensible defaults, uses `operatorPrompt` as the `seed` for determinism (truncated + hashed if too long).

The candidate-as-DATA isolation seam from Phase 4 means an injected prompt cannot move scoring — that's structurally enforced upstream; this helper does NOT need to sanitize prompt content.

**Test scenarios:**
- `prepared` with valid `problemId` returns a `RunConfig` parseable by Phase 0 schema.
- `operator` with a 200-char prompt builds a valid config.
- `operator` with empty prompt → throws `EmptyPromptError`.
- `prepared` with unknown `problemId` → throws.
- `capOverride` flows through `applyDemoOverride`.

**Verification:** Operator UI can submit a prompt → /demo/runs/live → run starts.

---

### U6. `apps/api/src/http/routes/demo.ts` — demo endpoints

**Goal:** Three new HTTP routes the dashboard calls:
- `POST /demo/runs/live` — body: `{ operatorPrompt OR problemId, capOverride? }` → starts a live run via U5+U4.
- `POST /demo/runs/replay/:fixtureId` — seeds a fixture as a replay-mode run.
- `GET /demo/curated-prompts` — lists available prepared problem sets.

Plus extends `GET /runs/:id` (Phase 6) to surface `runMode` from `runs.mode`.

**Requirements:** PD.4 + PD.5 endpoints; PD.6 dashboard needs the mode flag.

**Dependencies:** U4, U5, Phase 6 server.

**Files:**
- Create: `apps/api/src/http/routes/demo.ts`
- Modify: `apps/api/src/http/routes/runs-read.ts` (extend /runs/:id response with `runMode`)
- Modify: `apps/api/src/http/server.ts` (mount demo routes)
- Create: `apps/api/__integration_tests__/demo-endpoints.int.test.ts`

**Approach:** Hono sub-app. Each handler uses U4/U5 + appendEvent. Idempotency-Key supported on POST routes via the existing middleware. `runs.mode` reads via the schema column added in U3.

**Test scenarios:**
- `POST /demo/runs/live` with prepared problemId → 201 + runId + `mode: live`.
- `POST /demo/runs/live` with operatorPrompt → 201 + runId.
- `POST /demo/runs/replay/<fixtureId>` → 201 + runId + `mode: replay`.
- `GET /runs/:id` after replay seed → response carries `runMode: "replay"`.
- `GET /demo/curated-prompts` → array of `{ id, title, subtype }`.

**Verification:** Dashboard PD.5/PD.6 panels work against these routes.

---

### U7. `boot-demo.ts` — unified entrypoint

**Goal:** Single `pnpm boot:demo` runs `migrate → seed-demo → start API` in fixed order. Zod-validates env. Fail-fast on missing config. Langfuse absence is non-blocking.

**Requirements:** PD.3.

**Dependencies:** Phase 1 `runMigrations`, U2 `seedDemo`, Phase 6 `createServer`, Phase 3 `Worker`.

**Files:**
- Create: `apps/api/scripts/boot-demo.ts`
- Modify: `apps/api/package.json` — add `"boot:demo": "tsx scripts/boot-demo.ts"` script
- Create: `apps/api/__integration_tests__/boot-demo.int.test.ts`

**Approach:** ~80 lines. Steps:

1. `BootEnv.parse(process.env)` — Zod schema: `DATABASE_URL`, optional `OPENAI_API_KEY`, `LANGFUSE_*`, `DOPPL_DEMO_FIXTURE`. Fail-fast with a clear error.
2. `runMigrations(pool)`.
3. If `DOPPL_DEMO_FIXTURE` is set, `seedDemo({ db, fixturePath })`.
4. Build gateway + registry (Phase 2 helpers). Langfuse: try Cloud mode, catch + fall back to local-trace.
5. `createServer({ db, registry }).listen(PORT)`.
6. `new Worker({ db, processRun, disableHeartbeat: false }).start()`.

**Test scenarios:**
- Happy path with `DOPPL_DEMO_FIXTURE` → boot completes, fixture's events queryable.
- Missing `DATABASE_URL` → fail-fast with named env error.
- Missing fixture file → fail-fast with re-record instruction (from U2).
- Langfuse keys absent → boot succeeds, local-trace mode active.

**Verification:** `pnpm --filter @doppl/api boot:demo` works locally.

---

### U8. Replay-mode awareness in dashboard

**Goal:** Extend Phase 7's `ModeIndicator` + `HealthPanel` + run store to honor a server-side `runMode` flag. When server says `replay`, the indicator reads "REPLAY" regardless of SSE liveness. When `runMode === "live"` + `lastHeartbeatMs > 10000`, the HealthPanel surfaces a "consider fallback" hint.

**Requirements:** PD.6.

**Dependencies:** U6 (server flag), Phase 7 `ModeIndicator` + `HealthPanel`.

**Files:**
- Modify: `apps/web/src/data/contracts.ts` — add `runMode` to a new `RunDetail` schema.
- Modify: `apps/web/src/state/reducer.ts` — store `serverRunMode` in RunStoreState.
- Modify: `apps/web/src/state/runStore.tsx` — fetch `GET /runs/:id` when runId is set, dispatch the mode.
- Modify: `apps/web/src/panels/ModeIndicator.tsx` — server flag wins over local SSE-derived mode.
- Modify: `apps/web/src/panels/HealthPanel.tsx` — render "consider fallback" hint on stale heartbeat.
- Modify: `apps/web/src/panels/__tests__/ModeIndicator.test.tsx` + `__tests__/HealthPanel.test.tsx` (new).

**Approach:** Tiny additive changes. The reducer carries `serverRunMode: "live" | "replay" | "rehearsal" | null`. `ModeIndicator` reads `serverRunMode ?? state.mode` so the server signal takes precedence. `HealthPanel` adds a small banner under the existing fields when `state.run?.status === "running"` AND `lastHeartbeatMs > 10000`.

**Test scenarios:**
- ModeIndicator with `serverRunMode: "replay"` → shows REPLAY badge regardless of SSE state.
- HealthPanel with stale heartbeat → shows "consider fallback" hint.
- HealthPanel with fresh heartbeat → no hint.

**Verification:** Dashboard correctly labels replay-seeded runs.

---

### U9. `OperatorPromptPanel.tsx`

**Goal:** New panel in `apps/web/src/demo/` allowing the operator to pick a curated problem OR type a custom prompt. On submit calls `POST /demo/runs/live`. Wired into the dashboard shell's left rail next to `RunConfigPanel`.

**Requirements:** PD.5.

**Dependencies:** U6 endpoints, Phase 7 panel patterns.

**Files:**
- Create: `apps/web/src/demo/OperatorPromptPanel.tsx`
- Create: `apps/web/src/demo/__tests__/OperatorPromptPanel.test.tsx`
- Modify: `apps/web/src/layout/DashboardShell.tsx` — add the panel below `RunConfigPanel`.
- Modify: `apps/web/src/data/runClient.ts` — add `getCuratedPrompts`, `startDemoLive`, `startDemoReplay` methods.

**Approach:** Form with: (a) a dropdown of curated problems (loaded via `getCuratedPrompts`), (b) a "Custom prompt" textarea (radio toggles between prepared and custom), (c) cap-override fields (a subset — maxPopulation, maxGenerations), (d) Start button. Submit POSTs to `/demo/runs/live`. On success, dispatches `SET_RUN_ID` with the returned runId.

**Test scenarios:**
- Prepared mode: dropdown populated, submit calls `startDemoLive({ problemId })`.
- Custom mode: textarea + submit calls `startDemoLive({ operatorPrompt })`.
- Empty custom prompt → submit blocked + inline error.
- Cap-override values flow through to the request body.

**Verification:** Operator clicks Start → run begins → SSE fires → dashboard populates.

---

### U10. Six rehearsal scripts + DEMO_RUNBOOK.md

**Goal:** Six testcontainers integration tests under `apps/api/__integration_tests__/rehearsals/`. Each spins up Postgres, boots the demo path, asserts a §16 expectation. `docs/DEMO_RUNBOOK.md` documents the manual operator equivalents.

**Requirements:** PD.8 (all 6 rehearsals).

**Dependencies:** U1–U9.

**Files:**
- Create: `apps/api/__integration_tests__/rehearsals/prepared-run.rehearsal.int.test.ts`
- Create: `apps/api/__integration_tests__/rehearsals/provider-failure-replay.rehearsal.int.test.ts`
- Create: `apps/api/__integration_tests__/rehearsals/low-cap-live.rehearsal.int.test.ts`
- Create: `apps/api/__integration_tests__/rehearsals/evidence-walkthrough.rehearsal.int.test.ts`
- Create: `apps/api/__integration_tests__/rehearsals/fallback-ladder.rehearsal.int.test.ts`
- Create: `apps/api/__integration_tests__/rehearsals/config-boot-smoke.rehearsal.int.test.ts`
- Create: `docs/DEMO_RUNBOOK.md`

**Approach for each rehearsal:**

| Rehearsal | What it asserts |
|---|---|
| `prepared-run` | Seeded fixture loads + replay summary matches recorded values |
| `provider-failure-replay` | RecordedGateway returns error → fallback to replay rung produces identical projection |
| `low-cap-live` | `applyDemoOverride` lowers `maxPopulation: 10 → 4`; above-ceiling override clamped + warning; below-ceiling honored |
| `evidence-walkthrough` | After a completed run, FinalIdeaPanel's 6 link targets all exist in the projection |
| `fallback-ladder` | Each of rung1/2/3 produces a distinct runId; prior rung's run remains terminal + inspectable |
| `config-boot-smoke` | Bad `BootEnv` → fail-fast; missing fixture → fail-fast; valid env → boot completes |

`DEMO_RUNBOOK.md` sections:
- **Boot the demo locally** (3 commands)
- **Run a prepared problem** (UI walkthrough)
- **Type a custom prompt** (UI walkthrough)
- **Three-rung fallback in front of a room** (when to lower caps, when to switch to prepared, when to switch to replay)
- **What to watch on each panel during the demo** (lineage, fitness chart, final-idea)
- **What to do if the projector flakes** (refresh, Last-Event-ID resume kicks in automatically)

**Test scenarios:** Each rehearsal is itself a test scenario. The DEMO_RUNBOOK.md is a docs deliverable.

**Verification:** All 6 rehearsals pass via `pnpm -w test:int`. The runbook is reviewable; team can rehearse with it.

---

## System-Wide Impact

- **`packages/contracts`**: no changes. Phase D introduces zero new contract surface (load-bearing acceptance criterion).
- **`apps/api/src/event-store/schema.ts`**: gains a `mode` column on the `runs` table. Migration `0005`.
- **`apps/api/src/http/server.ts`**: mounts the new `/demo/*` routes. Existing routes unchanged.
- **`apps/web/src/state/reducer.ts`**: gains a `serverRunMode` field. Existing reducer behavior unchanged.
- **CI**: 6 new rehearsal int tests + the U1-U7 int tests bring the total around ~12 new integration files.

---

## Open Questions Surfaced by Planning

**None.** Phase 7's "replay-mode discriminator" finding is resolved in this plan via D4 (server-side `runs.mode` column, surfaced on HTTP — NOT in the event log so the closed `RunEventType` invariant holds).

---

## Scope Boundaries

### Deferred to Follow-Up Work

- Hosted demo deployment (Vercel / Fly).
- A standalone non-dashboard CLI for operators (`pnpm cli:start-run`).
- Schema-version upcast logic.
- Multi-prompt history view.
- Live retrieval corpus tuning (Phase 4/5 deferred items).

### Deferred for Later (per IMPLEMENTATION_PLAN.md)

Nothing left in the plan past Phase D — this is the final phase before the showcase.

### Outside this product's identity

- **Any new `RunEventType` or Appendix-A model.** Phase D is structurally barred from widening the contract surface.
- A "demo-only" event type or projection. The acceptance criteria are explicit.

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Replay fixture's `schemaVersion` drifts behind the codebase before showcase | Medium | Demo can't load | `seed-demo.ts` fails fast with re-record instruction. The team re-records fixtures after every Phase 0 contract change. `dump-replay.ts` makes capture trivial. |
| Operator-entered prompt could carry sensitive data | Low | Privacy concern at showcase | `DOPPL_LANGFUSE_INCLUDE_CONTENT=false` is the default; operator content-logging toggle is already wired in Phase 2. Documented in DEMO_RUNBOOK.md. |
| Fallback ladder confuses the audience on rung-switch | Medium | Demo coherence | `ModeIndicator` carries explicit REPLAY badge + rung label. DEMO_RUNBOOK.md scripts the operator narration. |
| `boot-demo.ts` flakes during showcase setup | Low | Embarrassment | Config-boot-smoke rehearsal (PD.8) is a CI-gated guarantee that boot works against the seeded fixture. |
| Curated prompts produce uninteresting demos | Medium | Demo feels weak | Curated prompts authored from the §17 demo path — known-good outcomes. Two subtype-specific options included. Re-tune in last rehearsal cycle. |

---

## Test Plan & Dev Loop

```bash
# Capture a fixture from a completed run
pnpm --filter @doppl/api db:migrate
pnpm --filter @doppl/api dev    # in one terminal
# (start + complete a run via the dashboard)
pnpm --filter @doppl/api dump-replay <runId>

# Boot the demo locally
docker compose up -d postgres
DOPPL_DEMO_FIXTURE=fixtures/replay/<runId>.json \
DATABASE_URL=postgresql://postgres:postgres@localhost:5434/postgres \
  pnpm --filter @doppl/api boot:demo
pnpm --filter @doppl/web dev    # in another terminal
open http://localhost:5173

# Rehearsals (CI-gated)
pnpm -w test:int               # runs all rehearsals + unit + integration tests
```

## Environment Variables

| Var | Default | Effect |
|---|---|---|
| `DOPPL_DEMO_FIXTURE` | _unset_ | Path to a replay fixture to seed at boot. When unset, boot proceeds with empty DB. |
| `DOPPL_DEMO_HTTP_PORT` | `3000` | Boot port (overrides `DOPPL_HTTP_PORT`). |
| `DOPPL_DEMO_AUTO_OPEN_BROWSER` | `false` | If `true`, `boot-demo` opens http://localhost:5173 after start. |

Existing env vars (from prior phases) continue to apply.

## Acceptance Criteria

- [ ] `dump-replay.ts` exports a completed run's events in `(runId, sequence)` order, carries `schemaVersion`, rejects non-terminal runs (U1).
- [ ] `seed-demo.ts` loads strictly after migrations, idempotent, rejects forward `schemaVersion` with re-record instruction (U2).
- [ ] Migration `0005_runs_mode.sql` adds `runs.mode` with default 'live'; existing migrations test still green (U3).
- [ ] Fallback ladder: 3 rungs are operator-driven; cap override only lowers; prior-rung runs stay terminal/inspectable (U4).
- [ ] `buildDemoConfig` produces parseable RunConfig from both prepared problem-set selection AND operator-entered prompt (U5).
- [ ] `/demo/runs/live`, `/demo/runs/replay/:fixtureId`, `/demo/curated-prompts` endpoints work + `GET /runs/:id` carries `runMode` (U6).
- [ ] `boot-demo.ts` runs migrate → seed → start in fixed order; fail-fast on bad env; Langfuse-absent → local-trace mode (U7).
- [ ] Dashboard ModeIndicator reads server `runMode` flag; HealthPanel surfaces "consider fallback" on stale heartbeat (U8).
- [ ] OperatorPromptPanel allows prepared OR custom prompt; submits via /demo/runs/live (U9).
- [ ] Six rehearsal int tests pass via `pnpm -w test:int`; `DEMO_RUNBOOK.md` documents the operator equivalents (U10).
- [ ] Phase D introduces NO new `RunEventType`, NO new Appendix-A model, NO new payload schema.
- [ ] `pnpm -w typecheck && pnpm -w lint && pnpm -w test && pnpm -w test:int` all green at PR open.

## Dependencies on Prior Phases

- Phase 1: `runMigrations`, `appendEvent`, `replayReader`, schema column patterns.
- Phase 2: `RecordedGateway` (rehearsals consume), Langfuse fallback.
- Phase 3: `startRun`, `Worker`, `RunAlreadyActiveError`.
- Phase 4: candidate-as-DATA isolation seam (operator prompts inherit this safety pin).
- Phase 5: nothing direct; the demo path runs through the kernel which calls Phase 5 hooks.
- Phase 6: `createServer`, the Hono routes the demo extends, `getHealth`.
- Phase 7: `ModeIndicator`, `HealthPanel`, `FinalIdeaPanel`, run store + reducer — all extended in place.

## What ships in the PR

- The `apps/api/scripts/`, `apps/api/src/runtime/demo/`, `apps/api/src/http/routes/demo.ts`, and `apps/web/src/demo/` trees.
- One new SQL migration (`0005_runs_mode.sql`) + `_journal.json` update.
- `fixtures/replay/` + `fixtures/curated-prompts/` directories with seed content.
- Six rehearsal int tests + `docs/DEMO_RUNBOOK.md`.
- Modifications to ModeIndicator, HealthPanel, FinalIdeaPanel, run store, contracts, runs-read route — additive only.
- Plan file with `status: completed` (flipped at PR open).
- PR targets the `melissa` integration branch.
