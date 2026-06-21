# P1 Phase-Exit Reachability Audit — `apps/api/src/event-store/`

**Date:** 2026-06-21
**Branch:** `track/kernel`
**Scope:** Phase-1 event-store surface: `redaction.ts`, `append.ts`, `sequence.ts`, `schema.ts`, `migrate.ts`, `index.ts`, `evidence-resolver.ts` (P1.7), `replay-reader.ts` + `canonical-serialization.ts` (P1.8).
**Out of scope this audit:** P1.1 scaffold (`src/index.ts` package marker); P2 model-gateway (covered at P2 phase-exit).
**Auditor model:** claude-sonnet-4-6

---

## Area type: Backend service / library subsystem

The event-store is a **library subsystem** — it has no HTTP routes of its own. Its production entry points are:

- The **P3 runtime kernel** (boot-migrate → createEventStore → append/readByRun), named task P3.3.
- The **P6 projections + REST layer** (replay reader + evidence resolver as fold/dereference primitives), named tasks P6.1/P6.4.
- The **PD demo replay path** (dump-replay + seed-demo scripts consuming replay reader + migrate), named tasks PD.1/PD.2/PD.3.
- The **testcontainers integration harness** (`test/integration/setup/testcontainers-pg.ts`) — this is a TEST entry point, not production; it exercises runMigrations but counts only for test coverage, not production reachability.

---

## Symbol inventory

### `schema.ts` — Drizzle table definitions (12 exports)

| Symbol | Kind |
|--------|------|
| `runEvents` | pgTable (authoritative event log) |
| `runs` | pgTable (projection) |
| `generations` | pgTable (projection) |
| `agenomes` | pgTable (projection) |
| `candidateIdeas` | pgTable (projection) |
| `criticReviews` | pgTable (projection) |
| `checkResults` | pgTable (projection) |
| `fitnessScores` | pgTable (projection) |
| `noveltyScores` | pgTable (projection) |
| `lineageEdges` | pgTable (projection) |
| `embeddings` | pgTable (index/query layer) |
| `dashboardSnapshots` | pgTable (cached projection) |

### `redaction.ts` — 1 public export

| Symbol | Kind |
|--------|------|
| `scrubEventPayload` | function |

### `sequence.ts` — 2 public exports

| Symbol | Kind |
|--------|------|
| `SequenceExecutor` | interface |
| `allocateSequence` | function |

### `migrate.ts` — 1 public export

| Symbol | Kind |
|--------|------|
| `runMigrations` | function |

### `append.ts` — 7 public exports

| Symbol | Kind |
|--------|------|
| `AppendInput` | type alias |
| `AppendResult` | interface |
| `AppendRejectionReason` | type alias |
| `AppendError` | class |
| `RunEventRow` | type alias |
| `EventStore` | interface |
| `EventStoreDeps` | interface |
| `createEventStore` | function |

### `evidence-resolver.ts` — 5 public exports (P1.7)

| Symbol | Kind |
|--------|------|
| `EvidenceUnresolvedReason` | type alias |
| `EvidenceResolution` | type alias |
| `resolveEvidenceRef` | function |
| `EvidenceResolver` | interface |
| `createEvidenceResolver` | function |

### `replay-reader.ts` — 6 public exports (P1.8)

| Symbol | Kind |
|--------|------|
| `ReplayIntegrityReason` | type alias |
| `ReplayIntegrityError` | class |
| `replayEvents` | function |
| `replayRun` | function |
| `ReplayReader` | interface |
| `createReplayReader` | function |

### `canonical-serialization.ts` — 1 public export (P1.8)

| Symbol | Kind |
|--------|------|
| `canonicalSerialize` | function |

**Total unique exported runtime-valued symbols: 35** (types/interfaces count because they gate use of their companion functions; 12 schema tables + 23 function/class/interface exports).

---

## Reachability trace

### Production callers confirmed in `apps/api/src/`

Searching all non-test `.ts` files outside `event-store/` for any import of event-store symbols yields **zero results**. The only production source files outside `event-store/` and `model-gateway/` are:

- `src/index.ts` — package marker only (`export const DOPPL_API_PACKAGE`); no event-store import.
- `src/config/model-registry.config.ts` — model config only.
- `src/config/prior-art-corpus.config.ts` — prior-art config only.

The runtime (`src/runtime/`), routes (`src/routes/`), projections (`src/projections/`), verifier, check-runners, and selection directories **do not exist yet** — they are P3–P6 work. No production entry point exists in the current codebase to wire any event-store symbol.

### Internal wiring within `event-store/`

These cross-module usages are production wiring WITHIN the subsystem, not test-only:

- `append.ts` imports and calls `scrubEventPayload` (from `redaction.ts`) on every insert path.
- `append.ts` imports and calls `allocateSequence` (from `sequence.ts`) on every insert path.
- `append.ts` imports `runEvents` table (from `schema.ts`).
- `replay-reader.ts` imports `CURRENT_SCHEMA_VERSION` from `@doppl/contracts` and `RunEventRow` from `append.ts`.
- `evidence-resolver.ts` imports `EventStore` and `RunEventRow` from `append.ts`.
- `index.ts` barrel re-exports all the above.

### Session-doc explicit-deferral statements (from kernel-002 §Reachability)

The following explicit-deferral statements are recorded in `docs/sessions/kernel-002-2026-06-21-freeze-bundle-and-p2.2-registry.md`:

> - **P1.4 `runMigrations`** — boot entry; exercised by the testcontainers harness; consumed by P1.3 (append writes through the schema). Full `migrate→seed→start` boot wiring = **P3**.
> - **P1.3 `createEventStore().append`** — sole authoritative write; first consumer **P3 kernel**; `readByRun` → **P1.8 replay + P6 projections**.

And from `docs/sessions/kernel-003-2026-06-21-orchestrator-routing-ledger.md` §A.3:

> - **P6/PD + P1.8 consumers (EvidenceRef resolver):** dereference `evidenceRefs[]` via `resolveEvidenceRef` / `createEvidenceResolver` — P6/PD. (implements §9)
> - **P6/PD consumers (replay reader):** P6 projection builders inject their real current-state/lineage folds into `replayRun`; PD = the recorded-event replay-fallback demo. (implements §9)

---

## Classification

### Group 1 — Subsystem-internal only (wired within `event-store/`, no external production caller yet)

These are wired to the authoritative append path WITHIN the subsystem; they will be externally reached when P3 wires `createEventStore`:

| File:Line | Symbol | Internal wiring | First external consumer |
|---|---|---|---|
| `redaction.ts:103` | `scrubEventPayload` | Called by `append.ts` before every insert | P3 via `createEventStore` |
| `sequence.ts:19` | `allocateSequence` | Called by `append.ts` on every insert | P3 via `createEventStore` |
| `sequence.ts:15` | `SequenceExecutor` | Interface consumed by `allocateSequence` | P3 via `createEventStore` |

Classification: **REACHABLE-PENDING** — wired internally; external production caller = P3 (named task P3.3 in `IMPLEMENTATION_PLAN.md` §P3.3).

### Group 2 — `createEventStore` + schema tables

The `EventStore` factory and all 12 schema tables are the subsystem's primary surface. No external production caller in the current tree.

| Symbol | Classification | Named consumer task |
|---|---|---|
| `createEventStore` | REACHABLE-PENDING | P3.3 (runtime kernel boot), P6.1 (projection builders) |
| `EventStore` (interface) | REACHABLE-PENDING | P3.3 |
| `EventStoreDeps` | REACHABLE-PENDING | P3.3 |
| `AppendInput` | REACHABLE-PENDING | P3.3 (kernel emits events) |
| `AppendResult` | REACHABLE-PENDING | P3.3 |
| `AppendRejectionReason` | REACHABLE-PENDING | P3.3 |
| `AppendError` | REACHABLE-PENDING | P3.3 (kernel catches + emits failure event) |
| `RunEventRow` | REACHABLE-PENDING | P6.1/P6.4 (projection fold) |
| `runEvents` (table) | REACHABLE-PENDING | P3.3 (Drizzle insert) |
| `runs`, `generations`, `agenomes`, `candidateIdeas`, `criticReviews`, `checkResults`, `fitnessScores`, `noveltyScores`, `lineageEdges`, `embeddings`, `dashboardSnapshots` (projection tables) | REACHABLE-PENDING | P6.2/P6.3 (current-state projection builder) |

### Group 3 — `runMigrations`

| File:Line | Symbol | Classification | Named consumer task |
|---|---|---|---|
| `migrate.ts:16` | `runMigrations` | REACHABLE-PENDING | P3.1 boot sequence (named in session-003 §A.3 + IMPL PLAN §P3.1/PD.3); testcontainers harness exercises it in test but not in production |

### Group 4 — Evidence resolver (P1.7)

| File:Line | Symbol | Classification | Named consumer task |
|---|---|---|---|
| `evidence-resolver.ts:27` | `resolveEvidenceRef` | REACHABLE-PENDING | P6/PD (kernel-003 §A.3: "dereference `evidenceRefs[]` via `resolveEvidenceRef` / `createEvidenceResolver`") |
| `evidence-resolver.ts:57` | `createEvidenceResolver` | REACHABLE-PENDING | P6/PD (same) |
| `evidence-resolver.ts:15` | `EvidenceUnresolvedReason` | REACHABLE-PENDING | P6/PD (type consumed with the functions) |
| `evidence-resolver.ts:17` | `EvidenceResolution` | REACHABLE-PENDING | P6/PD |
| `evidence-resolver.ts:47` | `EvidenceResolver` | REACHABLE-PENDING | P6/PD |

### Group 5 — Replay reader + canonical serialization (P1.8)

| File:Line | Symbol | Classification | Named consumer task |
|---|---|---|---|
| `replay-reader.ts:37` | `replayEvents` | REACHABLE-PENDING | P6.4 (replay-summary projection), PD.1/PD.2 (dump-replay/seed-demo) |
| `replay-reader.ts:72` | `replayRun` | REACHABLE-PENDING | P6.4; kernel-003 §A.3: "P6 projection builders inject their real folds" |
| `replay-reader.ts:89` | `createReplayReader` | REACHABLE-PENDING | P6.4, PD |
| `replay-reader.ts:20` | `ReplayIntegrityError` | REACHABLE-PENDING | P6.4 (error surface at projection layer) |
| `replay-reader.ts:18` | `ReplayIntegrityReason` | REACHABLE-PENDING | P6.4 |
| `replay-reader.ts:80` | `ReplayReader` | REACHABLE-PENDING | P6.4 |
| `canonical-serialization.ts:36` | `canonicalSerialize` | REACHABLE-PENDING | P6.4 (state-equivalence check); kernel-003 §A.3: "canonicalSerialize for fold-state state-equivalence" |

---

## Freeze-bundle explicit-deferral verification

The session docs assert these explicit deferrals. All are verified against real named tasks in `IMPLEMENTATION_PLAN.md`:

| Symbol cluster | Deferred to | Named task in IMPL PLAN | Status |
|---|---|---|---|
| `createEventStore`, `EventStore`, schema tables | P3 runtime kernel | `§P3.3` (Append-only event appender with per-run monotonic sequence + redaction) | VERIFIED |
| `runMigrations` | P3 boot + PD boot | `§P3.1` (Config loading + fail-fast at boot), `§PD.3` (Unified boot sequence) | VERIFIED |
| `resolveEvidenceRef`, `createEvidenceResolver` | P6/PD projections | `§P6.4` (Replay-summary projection), `§PD.1/PD.2` (dump-replay/seed-demo) | VERIFIED |
| `replayEvents`, `replayRun`, `createReplayReader`, `canonicalSerialize` | P6/PD projections | `§P6.4` (Replay-summary projection), `§PD.1/PD.2` | VERIFIED |
| `scrubEventPayload` | already P3-reachable via `createEventStore` | subsystem-internal wired to append | VERIFIED (already wired in P1.3) |

No orphaned deferrals found. All deferred symbols point to real named tasks (P3, P6, PD) in the implementation plan.

---

## Silent tested-but-unwired gaps

**None found.** Every exported symbol is either:

1. Wired within the subsystem (called by `append.ts` from `redaction.ts`/`sequence.ts`), or
2. Explicitly deferred to a named real task (P3.1, P3.3, P6.4, PD.1/PD.2/PD.3).

The area correctly has no production entry point yet (P3 hasn't landed). This is expected and is the pattern established by lesson §20 (explicit-deferral wiring with first-impl/first-consumer named as real tasks).

---

## Summary

```
reachability-auditor: apps/api/src/event-store/ — 35 exports audited
  REACHABLE: 3 (scrubEventPayload + scrubEventPayload + SequenceExecutor/allocateSequence wired internally within the subsystem's authoritative append path)
  REACHABLE-PENDING: 32 (explicit-deferral — all named to P3/P6/PD real tasks, none orphaned)
  UNREACHABLE (silent gap): 0

Phase-exit gate: CLEAR
```

All 35 exports are either internally wired or carry an explicit-deferral naming a real future task. No symbol is tested-but-silently-unwired. The freeze-bundle deferral statements in kernel-002 and kernel-003 are fully corroborated against named tasks in `IMPLEMENTATION_PLAN.md`.

**Note:** P2 model-gateway (`src/model-gateway/`) is out of this audit's scope. It will be covered at the P2 phase-exit gate.
