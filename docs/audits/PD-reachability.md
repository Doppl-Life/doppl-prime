# Phase-D Reachability Audit — apps/api

**Audited area:** `apps/api` Phase-D accumulated diff (branch `phase-d`, over-approximated to the full
branch diff vs `main`).

**Scope per brief:** `apps/api/src/runtime/demo/` (fallback-ladder, cap-override), `apps/api/src/runtime/config/`
(loadConfig, envSchema + `ENV_ALLOWLIST_VARS`), `apps/api/src/model-gateway/` (live-gateway, selectGateway,
`REQUIRED_CREDENTIAL_ENV`), `apps/api/src/event-store/scripts/` (dump-replay, seed-demo),
`apps/api/src/projections/reducers/winner.ts` + its wiring in `current-state.ts`,
`apps/api/src/boot/` + `src/main.ts` (`BOOT_ORCHESTRATION_ENV`), and the new integration tests under
`apps/api/test/integration/demo/` + `test/unit/{projections,config}`.

**Production entry points consulted:** `npm run start` → `src/main.ts::bootApp()` (HTTP/Fastify server);
`npm run dump-replay` → `src/event-store/scripts/dump-replay.ts` (CLI); `npm run seed-demo` →
`src/event-store/scripts/seed-demo.ts` (CLI); all registered Fastify route handlers in `src/routes/`.

---

## Enumerated Phase-D Exported Symbols

| # | Symbol | File | Production Call Chain |
|---|--------|------|-----------------------|
| 1 | `applyDemoCapOverride` | `runtime/demo/demo-cap-override.ts` | test-only (PD.5 wiring deferred) |
| 2 | `createFallbackLadder` + types (`FallbackLadder`, `FallbackLadderConfig`, `DemoRungKind`, `DemoMode`, `RungDescriptor`, `LowCapLiveRung`, `PreparedRung`, `ReplayRung`) | `runtime/demo/fallback-ladder.ts` / `index.ts` | test-only (PD.5/PD.6 wiring deferred) |
| 3 | `ENV_ALLOWLIST_VARS` | `runtime/config/envSchema.ts` | test-only (drift-guard `env-example-drift.test.ts`) — production logic executes via `projectEnvOverrides` called inside `loadConfig` which is called at boot |
| 4 | `loadConfig` / `FileSources` / `LoadConfigInput` / `AppConfig` | `runtime/config/loadConfig.ts` | `main.ts::bootApp` → `loadConfig` — **REACHABLE** |
| 5 | `REQUIRED_CREDENTIAL_ENV` | `model-gateway/registry.ts` | test-only (drift-guard) — the production credential check uses this constant internally but `REQUIRED_CREDENTIAL_ENV` as a named export has no production consumer |
| 6 | `createLiveGateway` / `LiveGatewayDeps` | `model-gateway/live-gateway.ts` | `main.ts::bootApp` → `resolveGateway` → `selectGateway` (fake-gateway.ts) → `createLiveGateway` on `DOPPL_GATEWAY=live` — **REACHABLE** |
| 7 | `selectGateway` / `GatewaySelection` | `model-gateway/stub/fake-gateway.ts` | `main.ts::bootApp` → `resolveGateway` → `selectGateway` — **REACHABLE** |
| 8 | `buildReplayFixture` / `dumpReplayToFile` / `ReplayFixture` / `DumpReplayDeps` | `event-store/scripts/dump-replay.ts` | `npm run dump-replay` CLI entry-point (guarded `isProcessEntry` runner); `dumpReplayToFile` is the production function in the CLI path — **REACHABLE** (CLI) |
| 9 | `buildSeedPlan` / `seedDemo` / `SeedDemoDeps` / `SeedResult` / `SerializedRow` / `SerializedReplayFixture` / `SeedPlan` | `event-store/scripts/seed-demo.ts` | `npm run seed-demo` CLI entry-point + `main.ts::bootApp` calls `seedDemo(...)` on `DOPPL_SEED_FIXTURE` — **REACHABLE** |
| 10 | `winnerReducer` | `projections/reducers/winner.ts` | `current-state.ts::REDUCERS` → `currentStateReducer` → `buildCurrentState` → `runs-read.ts` (GET /runs/:id, GET /runs/:id/current-state, GET /runs/:id/lineage, GET /runs/:id/candidate/:cid), `runs.ts` (POST /runs + PUT /runs/:id), `run-health.ts`, `replay-summary.ts` — **REACHABLE** |
| 11 | `BOOT_ORCHESTRATION_ENV` | `src/main.ts` | test-only (drift-guard `env-example-drift.test.ts`) — the variables in this array are read directly by `bootApp` as `env.DOPPL_GATEWAY`, `env.DOPPL_SEED_FIXTURE`, etc.; the export is only consumed by the drift-guard |

---

## Classification

### REACHABLE (production path confirmed)

- `loadConfig` / `FileSources` / `LoadConfigInput` / `AppConfig` — `main.ts::bootApp` is the direct caller.
- `createLiveGateway` / `LiveGatewayDeps` — `main.ts` → `selectGateway` → `createLiveGateway` when `DOPPL_GATEWAY=live`.
- `selectGateway` / `GatewaySelection` — `main.ts` → `resolveGateway` → `selectGateway` unconditionally.
- `dumpReplayToFile` / `buildReplayFixture` / `ReplayFixture` / `DumpReplayDeps` — `npm run dump-replay` CLI guarded runner (production operator tooling).
- `seedDemo` / `buildSeedPlan` and all seed-demo types — `npm run seed-demo` CLI + `main.ts::bootApp` (`DOPPL_SEED_FIXTURE` path).
- `winnerReducer` — `current-state.ts::REDUCERS[]` → `buildCurrentState` → multiple REST GET routes (registered Fastify handlers).

### TEST-ONLY / INSTRUMENTATION EXPORTS (not unreachable features)

The following three exports are consumed **exclusively by the drift-guard test** (`apps/api/test/unit/config/env-example-drift.test.ts`). Their **production logic** executes at boot — only the constant is exported for test use:

- `ENV_ALLOWLIST_VARS` (`runtime/config/envSchema.ts:47`) — the underlying `ENV_ALLOWLIST` drives `projectEnvOverrides`, which is called by `loadConfig` at every boot. The exported constant name-list is instrumentation for the drift-guard.
- `REQUIRED_CREDENTIAL_ENV` (`model-gateway/registry.ts:19`) — the constant is used internally by `assertProviderCredentials`, which is called by `loadConfig` at every boot. The exported name-list is instrumentation for the drift-guard.
- `BOOT_ORCHESTRATION_ENV` (`src/main.ts:59`) — the env vars in this array are read directly by `bootApp`; the export is only for the drift-guard.

**Classification decision:** These are not unreachable **features** — the logic they guard runs in production. They are deliberately test-facing metadata exports, by design per Lesson §95 ("drift-guard test IMPORTS ... asserts .env.example keys == their union BOTH directions"). This pattern intentionally makes the production allowlists the single source of truth for the drift guard. Classifying them UNREACHABLE per the strict symbol test would be technically accurate but a false positive for the gate's purpose.

**Verdict for gate: these do NOT constitute a blocking gap.**

### GENUINELY UNREACHABLE PRODUCTION SYMBOLS (deferred wiring)

- `applyDemoCapOverride` (exported from `runtime/demo/demo-cap-override.ts` and re-exported from `runtime/demo/index.ts`)
- `createFallbackLadder` (exported from `runtime/demo/fallback-ladder.ts` and re-exported from `runtime/demo/index.ts`)
- All type exports from `runtime/demo/index.ts`: `FallbackLadder`, `FallbackLadderConfig`, `DemoRungKind`, `DemoMode`, `RungDescriptor`, `LowCapLiveRung`, `PreparedRug`, `ReplayRung`

**Currently referenced from:** tests only — `apps/api/test/unit/runtime/demo/demo-cap-override.test.ts`, `apps/api/test/unit/runtime/demo/fallback-ladder.test.ts`, `apps/api/test/integration/runtime/demo/cap-override-write-path.test.ts`.

**Design intent (per module jsdoc):** "Consumed by PD.5 (write-path live-prompt config) + PD.6 (mode indicator)" — these are explicitly deferred to PD.5/PD.6 write-path wiring tasks not yet landed.

**Recommended entry point:** The `POST /runs` route handler (`apps/api/src/routes/runs.ts`) and/or a new demo mode route. `applyDemoCapOverride` should be called at `POST /runs` to apply operator demo cap overrides to the run config before `run.configured`. `createFallbackLadder` should be wired into `main.ts::bootApp` (or a route-level factory) as the operator-facing ladder controller whose `active()` rung descriptor feeds `POST /runs` + the demo mode indicator.

**Step-9 routing:** Deferred — belongs to the Phase-D PD.5 (write-path live-prompt config) and PD.6 (mode indicator) wiring tasks. The brief description in `runtime/demo/index.ts` is the spec anchor.

---

## Summary for orchestrator

- **10 exported symbols audited** (grouping types with their factory/function).
- **REACHABLE: 6** (loadConfig, createLiveGateway, selectGateway, dumpReplayToFile/buildReplayFixture, seedDemo/buildSeedPlan, winnerReducer).
- **TEST-INSTRUMENTATION exports (not blocking): 3** (ENV_ALLOWLIST_VARS, REQUIRED_CREDENTIAL_ENV, BOOT_ORCHESTRATION_ENV) — production logic executes at boot; the export is a deliberate single-source instrumentation per Lesson §95.
- **UNREACHABLE (deferred PD.5/PD.6 wiring): 1 group** — `applyDemoCapOverride` + `createFallbackLadder` + `runtime/demo` type exports.
- **1 wiring task recommended:** wire `runtime/demo` into `POST /runs` (demo cap-override) + `main.ts` or a new demo-controller route (`createFallbackLadder`) per PD.5/PD.6.
- **Phase-exit gate: BLOCKED** — `applyDemoCapOverride` and `createFallbackLadder` are exported production symbols reachable only from tests. PD.5 and PD.6 wiring must land before the gate clears.
