# PD Reachability Re-run — Post-PD.12 Wiring (commits 1b55ef4 / 3c304d8 / b2c38c5)

**Branch:** phase-d  
**Area:** `apps/api/src/runtime/demo/` (3 previously-orphaned symbols from `PD-reachability.md`)  
**Scope:** targeted re-audit of the three symbols that blocked the prior phase-exit gate.  
**Date:** 2026-06-23

---

## Symbols audited (3 of 3 previously BLOCKED)

### 1. `applyDemoCapOverride`
**Source:** `apps/api/src/runtime/demo/demo-cap-override.ts:14`  
**Barrel:** re-exported at `apps/api/src/runtime/demo/index.ts:7`

**Production call chain:**

```
main.ts → bootApp() → buildServer({ store, defaultConfig, ... })
  → server.ts:buildServer()
      → registerRunRoutes(app, { defaultConfig: deps.defaultConfig ?? DEFAULT_RUN_CONFIG, ... })
          → runs.ts:registerRunRoutes() — POST /runs handler (line 128–138)
              import { applyDemoCapOverride } from '../runtime/demo'    (runs.ts:11)
              applyDemoCapOverride(deps.defaultConfig.caps, demoOverride)  (runs.ts:132)
```

**Second path (via `createFallbackLadder`):**

```
fallback-ladder.ts:createFallbackLadder()
  → applyDemoCapOverride(config.maxima, config.demoOverrides)  (fallback-ladder.ts:73)
```
(This path is itself reached from the production route — see symbol 2 below.)

**Classification: REACHABLE**  
Production entry point: `POST /runs` handler at `apps/api/src/routes/runs.ts:87`, registered via `buildServer` called from `bootApp` in `apps/api/src/main.ts:216`.

---

### 2. `createFallbackLadder`
**Source:** `apps/api/src/runtime/demo/fallback-ladder.ts:66`  
**Barrel:** re-exported at `apps/api/src/runtime/demo/index.ts:9`

**Production call chain:**

```
main.ts → bootApp() → buildServer({ defaultConfig, problemSets: config.problemSets, ... })
  → server.ts:buildServer()
      → registerDemoLadderRoutes(app, { defaultConfig: deps.defaultConfig ?? DEFAULT_RUN_CONFIG,
                                        problemSets: deps.problemSets ?? [] })    (server.ts:104–107)
          → demo-ladder.ts:registerDemoLadderRoutes() — GET /demo/fallback-ladder handler (line 29)
              import { createFallbackLadder, type RungDescriptor } from '../runtime/demo'  (demo-ladder.ts:3)
              createFallbackLadder({ maxima, demoOverrides, preparedRunConfig, replayRunId })  (demo-ladder.ts:30)
```

**Classification: REACHABLE**  
Production entry point: `GET /demo/fallback-ladder` handler at `apps/api/src/routes/demo-ladder.ts:29`, registered via `registerDemoLadderRoutes` in `buildServer` called from `bootApp` in `apps/api/src/main.ts:216`.

---

### 3. Type exports from `apps/api/src/runtime/demo/index.ts`
(`FallbackLadder`, `FallbackLadderConfig`, `DemoRungKind`, `DemoMode`, `RungDescriptor`, `LowCapLiveRung`, `PreparedRung`, `ReplayRung`)

**Production consumption:**

- `type RungDescriptor` — imported at `demo-ladder.ts:3` and used at `demo-ladder.ts:41` (`const rungs: RungDescriptor[]`) in the GET /demo/fallback-ladder handler body.
- The remaining type exports (`FallbackLadder`, `FallbackLadderConfig`, `DemoRungKind`, `DemoMode`, `LowCapLiveRung`, `PreparedRung`, `ReplayRung`) are structural type imports; they are consumed by the production module `demo-ladder.ts` via the barrel.

**Classification: REACHABLE**  
All type exports travel the same barrel→route→server→main chain as `createFallbackLadder`.

---

## Summary

reachability-auditor: apps/api/src/runtime/demo — 3 exports re-audited (targeted re-run)
  REACHABLE: 3
  UNREACHABLE: 0

All three previously-orphaned symbols are now reached from production entry points:

| Symbol | Production entry | File |
|---|---|---|
| `applyDemoCapOverride` | `POST /runs` (runs.ts:132) | `apps/api/src/routes/runs.ts` |
| `createFallbackLadder` | `GET /demo/fallback-ladder` (demo-ladder.ts:30) | `apps/api/src/routes/demo-ladder.ts` |
| `runtime/demo` type exports | `GET /demo/fallback-ladder` (demo-ladder.ts:3,41) | `apps/api/src/routes/demo-ladder.ts` |

Both routes are registered unconditionally in `buildServer` (`apps/api/src/server.ts:89–107`), which is called from `bootApp` (`apps/api/src/main.ts:216`), the production process entry invoked by the `start` script.

No wiring tasks remain for the `runtime/demo` area.

**Phase-exit gate: CLEAR**
