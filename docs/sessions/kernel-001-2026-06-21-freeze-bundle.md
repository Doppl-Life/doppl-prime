# Session kernel-001 — Freeze bundle (P1+P2 unblock for downstream tracks)

**Date:** 2026-06-21
**Track:** kernel · **Role:** orchestrator (kernel-runtime-orchestrator)
**Predecessor:** `contract-002-2026-06-21-…` (prior round, contract track — Phase 0 freeze close)
**Successor:** `kernel-002-2026-06-21-freeze-bundle-and-p2.2-registry.md` (implementer technical close-out + P2.2)
**Round commit:** see Log entry / this round's `docs(kernel)` terminal commit.

## Summary

The kernel track's first round: front-loaded the **freeze bundle** — the 7 slices that unblock the verifier / selection / demo tracks to fork. Two interleaved chains, both green:

- **Gateway chain:** P2.1 (port + adopt wire contracts) → P2.4 (structured-output validate/repair/reject) → P2.9 (recorded/fake gateway stub).
- **Event-store chain:** P1.1 (apps/api scaffold + contracts adopt) → P1.2 (redaction scrub) → P1.4 (Drizzle migrations + testcontainers harness) → P1.3 (append-only writer).

Plus a slice-0 bootstrap (the `@doppl/api` package, which didn't exist).

## What was built (7 slices + bootstrap)

| Slice | Topic | Commit | Notes |
|---|---|---|---|
| P1.1 (bootstrap) | `@doppl/api` scaffold + `@doppl/contracts` adopt | `1c301b1` | first package; +2 unit smoke |
| P2.1 | `ModelGateway` port over frozen wire contracts | `171fe23` | seam; CANONICAL_FIXTURES conformance |
| P1.2 | event-store redaction scrub (rule #4) | `1f79273` | env-value layer; **[high] key-leak found+fixed in-slice** |
| P2.4 | structured-output discipline (rule #5) | `9c8c886` | validate/repair(≤1)/reject; sentinel-isolated repair |
| P2.9 | recorded/fake gateway stub | `7fb9259` | fork artifact; fakes provider layer → real discipline |
| P1.4 | Drizzle migrations + testcontainers (rule #2) | `ec3a549` | 12-table set; append-only triggers; **[high] privilege finding** |
| P1.3 | append-only writer (rule #2/#4) | `8bcce9c` | one-txn validate→ceiling→scrub→advisory-lock seq→insert |

**Suite:** contracts 163/163 + apps/api **32 unit / 18 integration**; typecheck/lint/format clean. Every safety-invariant slice (P1.2/P1.3/P1.4/P2.4) got a `security-reviewer` pass — all CLEAR.

## Decisions made

- **PG test harness = testcontainers** (`@testcontainers/postgresql`, Docker available) — user-decided (cat-4 escalation); the pattern for all kernel integration slices. Shared container via Vitest `globalSetup`; unit/integration config split so `/preflight` stays Docker-free.
- **No FKs in the event-store schema** — `run_events` is authoritative; projections are rebuildable, so integrity comes from the projector replaying the log, not DB FKs (which invert the dependency). Opaque indexed id columns throughout (IDs-opaque).
- **`AppendInput` omits both server/DB-assigned fields** (`sequence` + `occurredAt`) — caller can't set ordering or the log clock (safe-by-construction).
- **Sequence allocation** = `pg_advisory_xact_lock(hashtext(run_id))` + `COALESCE(MAX(sequence)+1,0)` (same-run serialize, cross-run independent; closes the READ COMMITTED TOCTOU).
- **P2.4 narrowed dependency** (finding C) — built against the port + a minimal gateway shell; registry (P2.2) / adapter (P2.5) inject later.
- **Append-only privilege finding ([high]) = document-and-defer-to-hosted** (user-ruled) — local demo runs trigger-only (accepted); least-privilege role split is a hosted-gated P3.3 hardening (ARCHITECTURE §9 + P3.3 come-back note, integration `c066a12`).

## Decisions explicitly NOT made / deferred

- Least-privilege DB role split — deferred-to-hosted (come-back note on P3.3); NOT a local-demo must-pass acceptance box.
- pgvector — deferred (§9); embeddings stored as JSONB float array, index over the authoritative `novelty.scored` vector.
- Registry-based gateway selection + the real OpenRouter/OpenAI/retrieval adapters — P2.2/P2.5/P2.6/P2.7 (post-freeze).
- Replay reader (state-equivalence) — P1.8 (the P1.3 `readByRun` is the ordered-read foundation).

## Lessons banked this round

§20 (subsystem seam over frozen contracts) · §21 (boundary env-value redaction — keys-too over an open `z.record`) · §22 (verify-then-narrow a safety scrub) · §23 (gateway structured-output discipline) · §24 (fake the provider layer, not the discipline) · §25 (DB append-only = triggers + least-privilege role) · §26 (authoritative append path = one txn). Plus a §2 refinement (sub-package scaffolding deltas: `--ignore-path` prettier + no-`rootDir` for cross-package source).

## Open follow-ups (held until the lead confirms the fork is done)

- Rest of P2: {P2.2 registry + P2.5 OpenRouter}, {P2.6 embedding + P2.7 retrieval}, P2.3 (gateway redaction, invariant — solo), P2.8 (Langfuse).
- Rest of P1: {P1.5 energy-payload + P1.6 novelty-payload} (contracts already authored by P0 — adopt + payload persistence), P1.7 (evidence resolver), P1.8 (replay reader — solo, replay-determinism).
- All of P3 — incl. P3.3/P3.12 least-privilege DB role (hosted-gated come-back), P3.1 `validateRunConfig` boot path, P3.10 operation-start markers.

## Process notes

- A directed `security-reviewer` (pointed at exactly the scope I'd narrowed) caught the [high] P1.2 key-leak with reproduced evidence — banked as §22.
- A wedged Docker engine (host-side, persistent 500 `/_ping`) blocked GREEN mid-P1.4; cleared by a Docker Desktop restart (user). No code impact.
- Several stale-plan corrections: P1.1/P2.1 "NEW contract file" premises (already authored by P0 → adopt); dropped cross-track `packages/observability` from P1.2 (demo P6.5); P1.3↔P1.4 order swap.
