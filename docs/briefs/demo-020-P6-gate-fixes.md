# /tdd brief — p6_gate_fixes

## Feature
**Phase-6 gate-fix bundle** — the `/phase-exit P6` audit returned all 4 auditors CLEAR, but surfaced a spec-coverage tag gap (§13) + 2 [med] correctness edge-cases + 2 actionable [low]s. This slice closes them so the P6 gate goes fully CLEAR. All apps/api; none safety-invariant (the security auditor was CLEAR — these are correctness/coverage, not rule breaches).

## Use case + traceability
- **Task ID:** P6.9, P6.3, P6.11, P6.8 (gate-fix follow-up to `/phase-exit P6`; origin: `docs/audits/P6-code-quality.md`)
- **Architecture sections it implements:** `ARCHITECTURE.md §11` (SSE resume cursor semantics; lineage edge-id uniqueness for the §10/§11 render), `§13` (observability coverage tag).
- **Related context:** the `/phase-exit P6` code-quality report (`docs/audits/P6-code-quality.md`) — 0 high / 2 med / 4 low. Two [low]s are **deferred** (see below). The §13 fix unblocks `scripts/spec-lint.sh tests 6` (currently FAIL §13).

## Acceptance criteria (what "done" means)
- [ ] **[§13 spec-coverage] tag the existing §13 test machine-detectably** — `packages/observability/test/emit.test.ts` asserts the §13 fail-safe (failed export → local warn, no authoritative-log write) but tags it prose-form (`spec §14 / §13`); change to the detectable **`spec(§13)`** (+ `spec(§14)`) paren form so `scripts/spec-lint.sh tests 6` passes §13 (no behavior change — tag only)
- [ ] **[med] empty-string `Last-Event-ID` = no cursor** (`apps/api/src/routes/run-stream.ts`) — an empty-string `Last-Event-ID` header currently parses to cursor=0 (`Number('') === 0`), silently skipping `sequence 0` (the `run.configured` event). Per the SSE spec an empty last-event-id means "no cursor → deliver from start." Fix: treat empty/whitespace as absent (from sequence 0 / -1), distinct from a real `0`
- [ ] **[med] unique lineage edge ids** (`apps/api/src/projections/lineage-graph.ts`) — structural (`${source}->${target}`) and reproduction lineage edges can collide on the same edge `id` (when a structural parent is also a reproduction parent), and React Flow breaks on duplicate edge ids. Fix: make edge ids unique (e.g. prefix by edge kind, or dedupe) so no two edges share an id
- [ ] **[low] lineage-export carries `runId`** (`apps/api/src/projections/lineage-export.ts`) — the export drops `LineageGraphProjection.runId`; add it so a multi-run notebook export identifies the run (one-line)
- [ ] **[low] document `CapsConsumed` omissions** (`apps/api/src/projections/run-health.ts`) — `CapsConsumed` exposes 4 of 6 `RunCaps`; add a one-line comment why `maxSpawnDepth`/`wallClockTimeoutMs` are omitted (doc-only)
- [ ] **Deferred (note, do NOT fix here):** [low] `run-stream.ts` `'connection: keep-alive'` (HTTP/2-forbidden but harmless under h1 — a hosted-h2 footgun) + [low] `runs.ts` `'cancelled'` in `TERMINAL_RUN_STATUSES` (forward-compat placeholder, no `run.cancelled` event in the closed registry). Leave a one-line `// TODO(hosted)` / `// forward-compat` comment each; carry-forward, not fixed
- [ ] Unit + integration green (both counts reported); `scripts/spec-lint.sh tests 6` passes all 4 anchors; `/preflight` clean (incl. `pnpm format:check`)

## Wiring / entry point (Step 7.5)
**none new — these are fixes to already-wired P6 surfaces.** `run-stream.ts` (registered on `buildServer`), `lineage-graph.ts` (the P6.3 producer consumed by P6.7 `/lineage` + P7.7), `lineage-export.ts` (the spike export), `run-health.ts` (P6.8). Exercised by the existing + new tests.

## Files expected to touch
**Modified:**
- `apps/api/src/routes/run-stream.ts` — empty-string `Last-Event-ID` → from-start
- `apps/api/src/projections/lineage-graph.ts` — unique edge ids
- `apps/api/src/projections/lineage-export.ts` — carry `runId`
- `apps/api/src/projections/run-health.ts` — comment (doc-only)
- `apps/api/src/routes/runs.ts` — `// forward-compat` comment on `cancelled` (defer-note)
- `packages/observability/test/emit.test.ts` — retag `spec(§13)`/`spec(§14)`
- the relevant test files (new assertions below)

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)
1. **`test_empty_last_event_id_delivers_from_start`** (`run-stream` integration) — a `Last-Event-ID: ` (empty) header delivers from sequence 0 (includes `run.configured`), NOT skipping seq 0; a real `Last-Event-ID: 0` still resumes after seq 0. Why: §11 resume / [med].
2. **`test_edge_ids_unique`** (`lineage-graph` unit) — when a structural parent is also a reproduction parent, the projection emits no two edges with the same `id` (React Flow dup-edge guard). Why: §10/§11 render / [med].
3. **`test_lineage_export_carries_run_id`** (`lineage-export` unit) — the export includes `runId`. Why: [low].
4. **§13 tag** — retag `emit.test.ts` so `spec-lint tests 6` detects §13 (the assertion already exists; verify the lint passes). Why: §13 coverage.

## Cross-doc invariant impact
- **Model field changes:** none (the `LineageExport` shape gains `runId` but it's an `apps/api`-internal spike shape, not an Appendix-A model). **§2.5-seam:** none.
- **Orchestrator doc rows (Step 9):** none (correctness/coverage fixes; no new convention — possibly a one-line note that the lineage edge-id-uniqueness pairs with P7.7's dangling-edge drop). I author hot if it surfaces.

## Things to flag at Step 2.5
1. **Edge-id uniqueness strategy.** My default vote: prefix the edge id by kind (e.g. `struct:${s}->${t}` vs `repro:${s}->${t}`) so structural + reproduction edges never collide — preserves determinism + readability. Alt: dedupe identical (source,target,type) tuples. Confirm.
2. **Empty-`Last-Event-ID` sentinel.** My default vote: trim the header; empty/whitespace → treat as absent (fromSequence = -1 / from start), identical to no header; a real numeric `0` resumes after seq 0. Confirm the from-start sentinel matches the existing `?lastEventId` absent path.

## Dependencies + sequencing
- **Depends on:** the P6 slices being fixed (P6.3 `5b9590b`-era lineage-graph, P6.9 run-stream, P6.8 run-health, P6.11 lineage-export — all landed). No new deps.
- **Blocks:** the fully-CLEAR `/phase-exit P6` re-verify (I re-run spec-lint + confirm after this lands).

## Estimated commit count
**1.** Bundled gate-fix (2 med + 2 low + the §13 tag + 2 defer-notes) — same area (apps/api projections/routes + the observability test tag), all P6-gate follow-ups, none safety-invariant (security auditor CLEAR). Step-8: code-quality phase-boundary (already ran — this IS the fix); security-reviewer not needed (no invariant touched — the fixes are correctness/coverage).

## Lessons-logged candidates anticipated
- Likely none. Possible one-liner: lineage edge-ids must be unique (React Flow breaks on dup ids) — the producer-side complement to P7.7's dangling-edge drop (LESSONS §30/§5). I author hot if it recurs.

## How to invoke
> obs (apps/api) session oriented — `/tdd`. cwd `apps/api/`. Stage only `apps/api/...` + `packages/observability/test/...` (the §13 tag). (Round-3 obs follow-up — the `/phase-exit P6` gate-fix bundle.)
1. **Run `/tdd p6_gate_fixes`.**
2. **Step 2.5** — answer the 2 questions, send the write-up + coverage map (map each finding → its fix/test).
3. **Step 9** — confirm `spec-lint tests 6` passes all 4 anchors + the 2 defer-notes are in. After this lands I re-verify the P6 gate → fully CLEAR.
