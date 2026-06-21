# Agenome Inspector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render a side-panel detail view for any single agenome, triggered from clicks already wired in `EnergyPanel` and `LineageGraph`, so the user can drill into persona, lineage, energy, candidates produced, and recent activity.

**Architecture:** Make the candidate and agenome selections mutually exclusive in the reducer; build a new `AgenomeInspector` that reads everything from existing client state (no new server endpoint); mount it in `DashboardShell` alongside `CandidateDetailInspector`, switching based on which selection is set; widen the existing "open Inspector tab" effect to also fire on agenome selection.

**Tech Stack:** React 18, TypeScript, Vite, vitest, React Testing Library. The web reducer is a discriminated-union pattern (see `apps/web/src/state/reducer.ts`); store hooks are in `apps/web/src/state/runStore.tsx`.

**Source spec:** `docs/superpowers/specs/2026-06-21-agenome-inspector-design.md`

## Global Constraints

- All new TypeScript files use strict mode (the repo's `tsconfig.base.json` settings).
- Tests use `vitest` + `@testing-library/react`; reuse `renderWithStore` and `makeStubClient` from `apps/web/src/test-utils/render.tsx`.
- New panel files live under `apps/web/src/panels/`. Tests sit in `apps/web/src/panels/__tests__/`.
- Do not introduce any new runtime dependency; the inspector reads from existing reducer state only.
- Branch convention: phase PRs target `melissa`, not `main`. Commit directly on `melissa` (matches the recent history).
- Do not edit `apps/web/src/lineage/LineageGraph.tsx` — the agenome-node click is already wired (lines 236–242) and the spec's `LineageGraph` task is unnecessary; ignore that bullet of the spec.

---

### Task 1: Mutually exclusive candidate / agenome selection

Make the reducer enforce that `selection.candidateId` and `selection.agenomeId` are never both set, and have `SELECT_AGENOME` bump `selectionEpoch` so the inspector-opening effect (Task 3) can key off the same epoch for either selection kind.

**Files:**
- Modify: `apps/web/src/state/reducer.ts:517-534` (the `SELECT_CANDIDATE` and `SELECT_AGENOME` cases)
- Test: `apps/web/src/state/__tests__/reducer.test.ts` (append new cases at the end of the file)

**Interfaces:**
- Consumes: existing `RunStoreAction` discriminated union and `RunStoreState['selection']` shape — no changes to either.
- Produces: behavioral guarantee that after `SELECT_AGENOME`, `state.selection.candidateId === null`; after `SELECT_CANDIDATE`, `state.selection.agenomeId === null`; both bump `selectionEpoch`.

- [ ] **Step 1: Write the failing tests**

Append to `apps/web/src/state/__tests__/reducer.test.ts`:

```typescript
describe("runStoreReducer — selection mutual exclusion", () => {
  test("SELECT_AGENOME clears any prior candidateId", () => {
    const seeded = {
      ...initialRunStoreState,
      selection: {
        candidateId: "cand_x",
        agenomeId: null,
        inspectorTab: "overview" as const,
        selectionEpoch: 0,
      },
    };
    const next = runStoreReducer(seeded, {
      kind: "SELECT_AGENOME",
      agenomeId: "ag_1",
    });
    expect(next.selection.candidateId).toBeNull();
    expect(next.selection.agenomeId).toBe("ag_1");
  });

  test("SELECT_CANDIDATE clears any prior agenomeId", () => {
    const seeded = {
      ...initialRunStoreState,
      selection: {
        candidateId: null,
        agenomeId: "ag_1",
        inspectorTab: "overview" as const,
        selectionEpoch: 0,
      },
    };
    const next = runStoreReducer(seeded, {
      kind: "SELECT_CANDIDATE",
      candidateId: "cand_x",
    });
    expect(next.selection.agenomeId).toBeNull();
    expect(next.selection.candidateId).toBe("cand_x");
  });

  test("SELECT_AGENOME bumps selectionEpoch", () => {
    const seeded = {
      ...initialRunStoreState,
      selection: {
        candidateId: null,
        agenomeId: null,
        inspectorTab: "overview" as const,
        selectionEpoch: 4,
      },
    };
    const next = runStoreReducer(seeded, {
      kind: "SELECT_AGENOME",
      agenomeId: "ag_1",
    });
    expect(next.selection.selectionEpoch).toBe(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @doppl/web test -- reducer.test`
Expected: 3 new test cases FAIL — `SELECT_AGENOME` leaves prior `candidateId` intact, `SELECT_CANDIDATE` leaves prior `agenomeId` intact, and `selectionEpoch` does not increment on `SELECT_AGENOME`.

- [ ] **Step 3: Update the reducer**

In `apps/web/src/state/reducer.ts`, replace the existing `SELECT_CANDIDATE` and `SELECT_AGENOME` cases (currently around lines 517–534) with:

```typescript
    case "SELECT_CANDIDATE":
      return {
        ...state,
        selection: {
          ...state.selection,
          candidateId: action.candidateId,
          // Picking a candidate replaces any agenome focus so the
          // inspector area never tries to render both at once.
          agenomeId: null,
          selectionEpoch: (state.selection.selectionEpoch ?? 0) + 1,
          ...(action.inspectorTab !== undefined ? { inspectorTab: action.inspectorTab } : {}),
        },
      };
    case "SELECT_AGENOME":
      return {
        ...state,
        selection: {
          ...state.selection,
          agenomeId: action.agenomeId,
          // Symmetric clear — see SELECT_CANDIDATE.
          candidateId: null,
          selectionEpoch: (state.selection.selectionEpoch ?? 0) + 1,
        },
      };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @doppl/web test -- reducer.test`
Expected: all reducer tests PASS, including the three new ones.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/state/reducer.ts apps/web/src/state/__tests__/reducer.test.ts
git commit -m "fix(web): make candidate and agenome selections mutually exclusive

SELECT_AGENOME now clears any prior candidateId and bumps
selectionEpoch; SELECT_CANDIDATE now clears any prior agenomeId
(it was already bumping the epoch). This keeps the inspector area
from ever holding two selections at once and lets the
open-inspector-tab effect key off a single epoch regardless of
which kind of thing was just selected."
```

---

### Task 2: AgenomeInspector component

Build the new panel that renders detail for `state.selection.agenomeId` purely from existing reducer state — persona, parents (clickable), status, energy spent + % of budget, candidates produced (clickable), best fitness, and last 20 activity events involving this agenome.

**Files:**
- Create: `apps/web/src/panels/AgenomeInspector.tsx`
- Test: `apps/web/src/panels/__tests__/AgenomeInspector.test.tsx`

**Interfaces:**
- Consumes:
  - `useRunStore()` → `{ state, dispatch }` (defined in `apps/web/src/state/runStore.tsx:125`).
  - `useRunState()` → `RunStoreState` (defined in `apps/web/src/state/runStore.tsx:131`).
  - `useAgenomeDisplayNames()` → `Record<string, string>` (defined in `apps/web/src/state/runStore.tsx:200`).
  - `RunStoreState['agenomes']: Record<string, AgenomeView>`; `AgenomeView` shape `{ id, parentIds, status }`.
  - `RunStoreState['candidates']: Record<string, CandidateView>`; `CandidateView` shape `{ id, agenomeId, generationId?, subtype?, status, summary?, title?, explanation? }`.
  - `RunStoreState['energySpend']: Record<string, number>` (per-agenome total).
  - `RunStoreState['fitnessScores']: Record<string, FitnessScoreT>` keyed by candidate id; we read `.total` per candidate to compute best fitness.
  - `RunStoreState['activityEventLog']: ActivityEventView[]` for the recent activity slice.
  - `state.run?.capsConfig.energyBudget` for the % calculation (same path `EnergyPanel` uses on line 48).
  - `StatusIndicator` from `apps/web/src/ui/StatusIndicator.tsx` for the status pill.
  - `PanelTitle` from `apps/web/src/ui/PanelTitle.tsx` for the header.
- Produces: a default-exported React component `AgenomeInspector(): JSX.Element` consumed by `DashboardShell` (Task 3).

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/panels/__tests__/AgenomeInspector.test.tsx`:

```typescript
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { initialRunStoreState } from "../../state/reducer.js";
import { renderWithStore } from "../../test-utils/render.js";
import { AgenomeInspector } from "../AgenomeInspector.js";

const seededState = () => ({
  ...initialRunStoreState,
  runId: "run_x",
  run: {
    id: "run_x",
    status: "running",
    capsConfig: { energyBudget: 100 },
  } as any,
  agenomes: {
    ag_root: { id: "ag_root", parentIds: [], status: "spawned" },
    ag_child: { id: "ag_child", parentIds: ["ag_root"], status: "mutated" },
  },
  candidates: {
    cand_1: {
      id: "cand_1",
      agenomeId: "ag_child",
      status: "scored",
      title: "First idea",
      summary: "summary one",
    },
    cand_2: {
      id: "cand_2",
      agenomeId: "ag_child",
      status: "rejected",
      title: "Second idea",
    },
    cand_other: {
      id: "cand_other",
      agenomeId: "ag_root",
      status: "scored",
      title: "Belongs to the root",
    },
  },
  energySpend: { ag_child: 25 },
  selection: {
    candidateId: null,
    agenomeId: "ag_child",
    inspectorTab: "overview" as const,
    selectionEpoch: 1,
  },
});

describe("AgenomeInspector", () => {
  test("no agenome selected → placeholder", () => {
    renderWithStore(<AgenomeInspector />);
    expect(screen.getByText(/Select an agenome/i)).toBeInTheDocument();
  });

  test("renders persona id, status, energy, and only this agenome's candidates", () => {
    renderWithStore(<AgenomeInspector />, { initialState: seededState() });
    // Persona display falls back to the raw id when no display name exists.
    expect(screen.getByText("ag_child")).toBeInTheDocument();
    expect(screen.getByText(/mutated/i)).toBeInTheDocument();
    // Energy: 25 spent, 25% of 100 budget.
    expect(screen.getByText(/25\s*\/\s*100/)).toBeInTheDocument();
    expect(screen.getByText(/25%/)).toBeInTheDocument();
    // Only ag_child's candidates show in the list.
    expect(screen.getByText("First idea")).toBeInTheDocument();
    expect(screen.getByText("Second idea")).toBeInTheDocument();
    expect(screen.queryByText("Belongs to the root")).toBeNull();
  });

  test("click a candidate row → AgenomeInspector switches to its placeholder (Task 1 mutual exclusion in action)", () => {
    renderWithStore(<AgenomeInspector />, { initialState: seededState() });
    fireEvent.click(screen.getByText("First idea"));
    // After dispatch: selection.candidateId = cand_1, agenomeId = null.
    // The inspector's no-agenome branch now renders.
    expect(screen.getByText(/Select an agenome/i)).toBeInTheDocument();
  });

  test("click a parent chip → inspector reloads on the parent agenome", () => {
    renderWithStore(<AgenomeInspector />, { initialState: seededState() });
    fireEvent.click(screen.getByRole("button", { name: /ag_root/ }));
    // After dispatch: selection.agenomeId = ag_root.
    // The header now shows ag_root, and ag_root's own candidate appears
    // while ag_child's candidates fall out of the list.
    expect(screen.getByText("ag_root")).toBeInTheDocument();
    expect(screen.getByText("Belongs to the root")).toBeInTheDocument();
    expect(screen.queryByText("First idea")).toBeNull();
  });

  test("zero parents, zero candidates, zero activity → renders empty states without crashing", () => {
    const empty = {
      ...initialRunStoreState,
      runId: "run_x",
      run: { id: "run_x", status: "running", capsConfig: {} } as any,
      agenomes: { ag_lonely: { id: "ag_lonely", parentIds: [], status: "spawned" } },
      candidates: {},
      energySpend: {},
      selection: {
        candidateId: null,
        agenomeId: "ag_lonely",
        inspectorTab: "overview" as const,
        selectionEpoch: 1,
      },
    };
    renderWithStore(<AgenomeInspector />, { initialState: empty });
    expect(screen.getByText("ag_lonely")).toBeInTheDocument();
    expect(screen.getByText(/no parents/i)).toBeInTheDocument();
    expect(screen.getByText(/no candidates produced/i)).toBeInTheDocument();
    expect(screen.getByText(/no recent activity/i)).toBeInTheDocument();
  });
});
```

These tests verify behavior through the rendered DOM rather than spying on `dispatch` directly — that matches the rest of the suite. The candidate-click and parent-click cases rely on Task 1's mutual-exclusion change (`SELECT_CANDIDATE` clears `agenomeId`; `SELECT_AGENOME` clears `candidateId`), so Task 1 must land first.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @doppl/web test -- AgenomeInspector.test`
Expected: all five tests FAIL — module not found (`AgenomeInspector.js`).

- [ ] **Step 3: Implement the component**

Create `apps/web/src/panels/AgenomeInspector.tsx`:

```typescript
import type { JSX } from "react";
import { useMemo } from "react";
import { useAgenomeDisplayNames, useRunState, useRunStore } from "../state/runStore.js";
import type { CandidateView } from "../state/reducer.js";
import { PanelTitle } from "../ui/PanelTitle.js";
import { StatusIndicator } from "../ui/StatusIndicator.js";

/**
 * AgenomeInspector — side-panel detail view for one agenome. Renders
 * everything reducer state already knows: persona, lineage parents
 * (clickable to drill into ancestors), status, energy spend with %
 * of budget, candidates produced (clickable into CandidateInspector),
 * best fitness across those candidates, and the last 20 activity
 * events that mention this agenome. No server fetch — all reads come
 * from the streamed reducer state.
 */

const RECENT_ACTIVITY_LIMIT = 20;

interface RunCapsConfig {
  energyBudget?: number;
}

export function AgenomeInspector(): JSX.Element {
  const state = useRunState();
  const { dispatch } = useRunStore();
  const personaNames = useAgenomeDisplayNames();
  const agenomeId = state.selection.agenomeId;

  // All hooks must run on every render — compute these unconditionally
  // and bail out below only on the visible content.
  const candidates: CandidateView[] = useMemo(() => {
    if (!agenomeId) return [];
    return Object.values(state.candidates).filter((c) => c.agenomeId === agenomeId);
  }, [agenomeId, state.candidates]);

  const recentActivity = useMemo(() => {
    if (!agenomeId) return [];
    return state.activityEventLog
      .filter((e) => e.agenomeId === agenomeId)
      .slice(-RECENT_ACTIVITY_LIMIT)
      .reverse();
  }, [agenomeId, state.activityEventLog]);

  const bestFitness = useMemo(() => {
    let best: number | null = null;
    for (const c of candidates) {
      const score = state.fitnessScores[c.id]?.total;
      if (typeof score === "number" && (best === null || score > best)) best = score;
    }
    return best;
  }, [candidates, state.fitnessScores]);

  if (!agenomeId) {
    return (
      <section aria-label="Agenome inspector" data-panel="agenome-inspector">
        <PanelTitle>Agenome inspector</PanelTitle>
        <p style={{ color: "var(--doppl-text-secondary)" }}>
          Select an agenome from the Energy panel or the lineage graph to see
          its full detail.
        </p>
      </section>
    );
  }

  const agenome = state.agenomes[agenomeId];
  const personaName = personaNames[agenomeId];
  const energySpent = state.energySpend[agenomeId] ?? 0;
  const energyBudget = (state.run?.capsConfig as RunCapsConfig | undefined)?.energyBudget ?? 0;
  const energyPct = energyBudget > 0 ? Math.min(100, (energySpent / energyBudget) * 100) : null;

  return (
    <section aria-label="Agenome inspector" data-panel="agenome-inspector">
      <PanelTitle>Agenome inspector</PanelTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <header style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h3
              style={{ margin: 0, fontSize: 20, color: "var(--doppl-text-primary)" }}
              title={agenomeId}
            >
              {personaName ?? agenomeId}
            </h3>
            {agenome ? <StatusIndicator domain="agenome" status={agenome.status} size="sm" /> : null}
          </div>
          {personaName ? (
            <div
              style={{
                fontFamily: "var(--doppl-font-mono, monospace)",
                fontSize: 12,
                color: "var(--doppl-text-secondary)",
              }}
            >
              {agenomeId}
            </div>
          ) : null}
        </header>

        <div>
          <div style={{ color: "var(--doppl-text-secondary)", fontSize: 13, marginBottom: 4 }}>
            Lineage
          </div>
          {agenome && agenome.parentIds.length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {agenome.parentIds.map((parentId) => (
                <button
                  key={parentId}
                  type="button"
                  onClick={() => dispatch({ kind: "SELECT_AGENOME", agenomeId: parentId })}
                  style={{
                    fontFamily: "var(--doppl-font-mono, monospace)",
                    fontSize: 12,
                    padding: "2px 8px",
                    borderRadius: 999,
                    border: "1px solid var(--doppl-border)",
                    background: "var(--doppl-bg-input)",
                    color: "var(--doppl-text-primary)",
                    cursor: "pointer",
                  }}
                >
                  {personaNames[parentId] ?? parentId}
                </button>
              ))}
            </div>
          ) : (
            <div style={{ color: "var(--doppl-text-secondary)", fontSize: 13 }}>No parents</div>
          )}
        </div>

        <div>
          <div style={{ color: "var(--doppl-text-secondary)", fontSize: 13, marginBottom: 4 }}>
            Energy
          </div>
          <div
            style={{
              fontVariantNumeric: "tabular-nums",
              color: "var(--doppl-text-primary)",
              fontSize: 14,
            }}
          >
            {energyBudget > 0
              ? `${energySpent.toFixed(2)} / ${energyBudget}`
              : energySpent.toFixed(2)}
            {energyPct !== null ? (
              <span style={{ color: "var(--doppl-text-secondary)", marginLeft: 6 }}>
                {energyPct.toFixed(0)}%
              </span>
            ) : null}
          </div>
        </div>

        <div>
          <div style={{ color: "var(--doppl-text-secondary)", fontSize: 13, marginBottom: 4 }}>
            Best fitness
          </div>
          <div
            style={{
              fontVariantNumeric: "tabular-nums",
              color: "var(--doppl-text-primary)",
              fontSize: 14,
            }}
          >
            {bestFitness !== null ? bestFitness.toFixed(3) : "—"}
          </div>
        </div>

        <div>
          <div style={{ color: "var(--doppl-text-secondary)", fontSize: 13, marginBottom: 4 }}>
            Candidates produced
          </div>
          {candidates.length === 0 ? (
            <div style={{ color: "var(--doppl-text-secondary)", fontSize: 13 }}>
              No candidates produced yet
            </div>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 4 }}>
              {candidates.map((cand) => (
                <li key={cand.id}>
                  <button
                    type="button"
                    onClick={() => dispatch({ kind: "SELECT_CANDIDATE", candidateId: cand.id })}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "6px 10px",
                      borderRadius: 6,
                      border: "1px solid var(--doppl-hairline)",
                      background: "transparent",
                      color: "var(--doppl-text-primary)",
                      cursor: "pointer",
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 8,
                    }}
                  >
                    <span>{cand.title ?? cand.summary ?? cand.id}</span>
                    <span style={{ color: "var(--doppl-text-secondary)", fontSize: 12 }}>
                      {cand.status}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <div style={{ color: "var(--doppl-text-secondary)", fontSize: 13, marginBottom: 4 }}>
            Recent activity
          </div>
          {recentActivity.length === 0 ? (
            <div style={{ color: "var(--doppl-text-secondary)", fontSize: 13 }}>
              No recent activity for this agenome
            </div>
          ) : (
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                display: "flex",
                flexDirection: "column",
                gap: 2,
                fontSize: 12,
              }}
            >
              {recentActivity.map((evt) => (
                <li
                  key={evt.sequence}
                  style={{ display: "flex", gap: 8, color: "var(--doppl-text-secondary)" }}
                >
                  <span style={{ fontFamily: "var(--doppl-font-mono, monospace)" }}>
                    {evt.type}
                  </span>
                  <span>{evt.occurredAt}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @doppl/web test -- AgenomeInspector.test`
Expected: all five tests PASS.

If the parent-chip click test fails because `getByRole("button", { name: /ag_root/ })` doesn't match (e.g. the persona name overrides the id), update only the test query (e.g. `screen.getByText("ag_root")`) — the implementation should be left alone.

- [ ] **Step 5: Typecheck the new file**

Run: `pnpm --filter @doppl/web typecheck`
Expected: PASS (no new errors).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/panels/AgenomeInspector.tsx apps/web/src/panels/__tests__/AgenomeInspector.test.tsx
git commit -m "feat(web): add AgenomeInspector side-panel detail view

Renders persona, lineage (clickable parents), status, energy spend
with budget %, candidates produced (clickable into CandidateInspector),
best fitness across them, and the last 20 activity events touching
the agenome. All data comes from existing reducer state — no new
api endpoint."
```

---

### Task 3: Mount AgenomeInspector in DashboardShell

Render `AgenomeInspector` whenever `selection.agenomeId` is set (instead of `CandidateDetailInspector`), and widen the existing effect that opens the Inspector view-tab so an agenome selection opens the tab too.

**Files:**
- Modify: `apps/web/src/layout/DashboardShell.tsx` (the `hasCandidate` effect around line 306–320 and the `CandidateDetailInspector` mount around line 428)

**Interfaces:**
- Consumes: `AgenomeInspector` from Task 2 and `CandidateDetailInspector` (existing).
- Produces: no exported interface change — the shell behavior is observable only.

- [ ] **Step 1: Read the current selection effect and the inspector mount**

Open `apps/web/src/layout/DashboardShell.tsx`. Locate:

```typescript
  const hasCandidate = state.selection.candidateId != null;
  const selectionEpoch = state.selection.selectionEpoch;

  // ... effect that opens the Inspector tab when hasCandidate flips on,
  //     keyed by [hasCandidate, selectionEpoch]
```

and the JSX that currently renders only `<CandidateDetailInspector />`.

- [ ] **Step 2: Widen the effect to fire on either selection kind**

Replace the `hasCandidate`/`selectionEpoch` derivation and the effect's dependency array with:

```typescript
  const hasCandidate = state.selection.candidateId != null;
  const hasAgenome = state.selection.agenomeId != null;
  const hasSelection = hasCandidate || hasAgenome;
  const selectionEpoch = state.selection.selectionEpoch;
```

Then update the existing `useEffect(...)` that opens the Inspector tab so its guard reads `hasSelection` (or `hasCandidate || hasAgenome`) instead of just `hasCandidate`, and its dependency array becomes `[hasSelection, selectionEpoch]`.

Because Task 1 made the two selections mutually exclusive and made `SELECT_AGENOME` bump `selectionEpoch`, no other change to the effect body is needed — re-selecting either kind still re-opens the tab via the epoch.

- [ ] **Step 3: Swap the inspector mount to switch on selection type**

Find:

```typescript
            <CandidateDetailInspector />
```

Replace with:

```typescript
            {state.selection.agenomeId != null ? (
              <AgenomeInspector />
            ) : (
              <CandidateDetailInspector />
            )}
```

And add the import at the top of the file (next to the existing `CandidateDetailInspector` import):

```typescript
import { AgenomeInspector } from "../panels/AgenomeInspector.js";
```

- [ ] **Step 4: Run the full web test suite**

Run: `pnpm --filter @doppl/web test`
Expected: every test PASSES, including the new reducer and AgenomeInspector cases. Existing DashboardShell tests (if any) should keep passing — the candidate-only path is untouched, and the new agenome path doesn't have a unit test in this plan (it's verified manually in Step 5).

- [ ] **Step 5: Manual smoke test in the running dev server**

Run: `pnpm --filter @doppl/web dev`
Open the printed local URL. With a seeded or live run loaded:
1. Click an agenome row in the Energy panel → the Inspector view-tab opens and shows `AgenomeInspector` with persona, lineage, energy, candidates, recent activity.
2. Click a parent chip inside the inspector → the inspector reloads on that parent agenome.
3. Click an agenome node in the lineage graph → same Inspector tab opens on that agenome.
4. Click one of the listed candidates → the Inspector switches to `CandidateDetailInspector` for that candidate.
5. Click an agenome again → Inspector switches back; only one of the two inspectors is ever visible.

Expected: every transition leaves the inspector area with exactly one inspector rendered. No console errors.

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @doppl/web typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/layout/DashboardShell.tsx
git commit -m "feat(web): mount AgenomeInspector when an agenome is selected

Switch the Inspector view-tab between CandidateDetailInspector and
AgenomeInspector based on which side of state.selection is set;
widen the open-Inspector-tab effect so an agenome selection opens
it just like a candidate selection. Mutual exclusion on the two
selection fields (Task 1) means only one inspector ever renders."
```

- [ ] **Step 8: Push**

```bash
git push origin melissa
```

Once pushed, the Railway web service auto-builds from `melissa`. Verify on the deployed URL that the same five manual steps from Step 5 work against the live api.

---

## Self-Review

Skim spec → plan:

- "Mutual exclusion on the two selection fields" → Task 1 ✓
- "Render persona / id / status, parents (clickable), energy %, candidates (clickable), best fitness, recent activity (cap 20)" → Task 2 covers each field with a test ✓
- "Mount in DashboardShell; widen open-Inspector-tab effect" → Task 3 ✓
- "No new api endpoint" → component reads only from reducer state ✓
- "LineageGraph agenome-node click" → explicitly removed in Global Constraints because the wiring already exists at `LineageGraph.tsx:236–242` ✓

Placeholder scan: no "TBD", no "implement appropriate error handling", no "similar to Task N" — each task's code is shown in full. ✓

Type consistency: `SELECT_AGENOME { agenomeId: string | null }`, `SELECT_CANDIDATE { candidateId: string | null }`, `selection.selectionEpoch?: number` — all match the existing reducer file referenced at the head of Task 1. The `AgenomeView` / `CandidateView` shapes used in Task 2's tests match `reducer.ts:50-67`. ✓

No spec requirement is unimplemented in this plan.
