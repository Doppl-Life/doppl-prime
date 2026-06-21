# Agenome inspector — design

**Date:** 2026-06-21
**Status:** Approved (pending spec review)

## Goal

Let the user drill into any single agenome from the running dashboard
and see every detail the client already knows about it. Two entry
points: the existing per-agenome rows in `EnergyPanel`, and clicking
an agenome-type node in `LineageGraph`.

## Why this scope

`EnergyPanel` rows already dispatch `SELECT_AGENOME` on click and
keydown — the state slice (`selection.agenomeId`) and the action
exist but nothing renders when an agenome is selected. The work is
to fill that gap, mirror it onto the lineage graph, and avoid a
second source-of-truth for selection.

## Non-goals

- No new full-page "all agenomes" table — the user did not ask for
  side-by-side comparison and the Energy panel already enumerates
  them.
- No new server endpoint (`/runs/:id/agenomes/:aid`). The reducer
  already maintains everything we need from the streamed events.
- No persistent visual selection highlight on the Energy row. Useful
  later, not the ask.

## Architecture

```
state.selection.{candidateId, agenomeId}
                ├─ candidateId set ─► CandidateDetailInspector (existing)
                └─ agenomeId   set ─► AgenomeInspector (new)
                          ▲
                          ├─ EnergyPanel row click (already dispatches)
                          └─ LineageGraph agenome-node click (new wire)
```

A new `AgenomeInspector` panel renders entirely from existing client
state. The shell flips between `CandidateDetailInspector` and
`AgenomeInspector` based on which side of `selection` is set; the
two selections are mutually exclusive (see Selection model below),
so there is no ambiguity.

## Content shown for one agenome

- **Header**: persona name (from `useAgenomeDisplayNames`) + raw id
  (small, monospaced) + status badge using existing
  `StatusIndicator`.
- **Lineage**: parent ids rendered as chips. Each chip is a button
  that dispatches `SELECT_AGENOME` with that parent's id so the
  user can walk ancestors. Generation id surfaced next to status.
- **Energy**: total spent (from `energySpend[id]`) and percent of
  budget when `caps.energyBudget` is set — same math
  `EnergyPanel` uses.
- **Candidates produced**: compact list of candidates filtered from
  `state.candidates` by `agenomeId`. Each row shows title (or
  generated stub) + status; clicking a candidate dispatches
  `SELECT_CANDIDATE` so the user transitions naturally into
  `CandidateInspector`.
- **Best fitness**: maximum across `fitnessScores` for this
  agenome's candidates, or "—" if none yet.
- **Recent activity**: last N activity events from
  `state.activityEventLog` where `agenomeId` matches, rendered with
  type + occurredAt. N = 20.

## Triggers

- `EnergyPanel` rows: no change — already dispatch `SELECT_AGENOME`.
- `LineageGraph` nodes of `type: "agenome"`: wire a click handler
  on the node component to dispatch `SELECT_AGENOME`. Mirrors the
  existing candidate-node click path.
- Parent-id chips inside the inspector itself dispatch
  `SELECT_AGENOME` for that parent.

## Selection model

Add a single reducer rule: `SELECT_AGENOME` clears
`selection.candidateId`, and `SELECT_CANDIDATE` clears
`selection.agenomeId`. This is the only reducer change. The
inspector area then never shows two things at once.

The existing `DashboardShell` effect that opens the Inspector
view-tab on `hasCandidate` is widened to `hasCandidate ||
hasAgenome`, keyed off the same `selectionEpoch` so re-selecting
the same agenome still re-opens the tab.

## Tests

- `AgenomeInspector.test.tsx` (mirror of
  `CandidateInspector.test.tsx`):
  - Renders persona, energy, and candidate list from seeded state.
  - Clicking a candidate row dispatches `SELECT_CANDIDATE` with the
    right id.
  - Clicking a parent chip dispatches `SELECT_AGENOME` with the
    parent id.
  - Empty states: zero candidates, zero parents, zero activity
    each render without crashing.
- `LineageGraph.test.tsx`: add a case that simulates a click on an
  agenome-type node and asserts `SELECT_AGENOME` was dispatched.
- `reducer.test.ts`: add cases that `SELECT_AGENOME` clears any
  prior `candidateId`, and vice versa.

## Files touched

- New: `apps/web/src/panels/AgenomeInspector.tsx`
- New: `apps/web/src/panels/__tests__/AgenomeInspector.test.tsx`
- Edit: `apps/web/src/state/reducer.ts` — mutual exclusion on the
  two selection fields.
- Edit: `apps/web/src/state/__tests__/reducer.test.ts` — new cases.
- Edit: `apps/web/src/lineage/LineageGraph.tsx` — agenome-node
  click handler.
- Edit: `apps/web/src/lineage/__tests__/LineageGraph.test.tsx` —
  new case.
- Edit: `apps/web/src/layout/DashboardShell.tsx` — mount
  `AgenomeInspector` when `selection.agenomeId` is set; widen the
  open-Inspector-tab effect.

## Risks / open questions

- Lineage node click currently only resolves to candidates because
  the graph already wires that path. The agenome-node click needs
  to coexist with the existing node click handler without breaking
  candidate selection. The implementation plan should confirm the
  node-type discrimination happens in one place (single handler
  switching on `type`) rather than two competing handlers.
- The "recent activity" list reads from the capped
  `activityEventLog` (cap = 500). For long runs an agenome's
  activity may have rotated out. That is the same constraint that
  applies to every other consumer of the log; acceptable for v1.
