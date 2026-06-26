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
    // Status is in an output element with data-status="mutated"
    expect(screen.getByRole("status", { name: /unknown status/i })).toHaveAttribute("data-status", "mutated");
    // Energy: 25 spent, 25% of 100 budget.
    // Text may be split across elements, use function matcher
    expect(screen.getByText((content) => /25.*100/.test(content))).toBeInTheDocument();
    expect(screen.getByText((content) => /25.*%/.test(content))).toBeInTheDocument();
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
    // Parent chip displays the persona name "Explorer", not the raw ID
    fireEvent.click(screen.getByRole("button", { name: "Explorer" }));
    // After dispatch: selection.agenomeId = ag_root.
    // The header now shows ag_root, and ag_root's own candidate appears
    // while ag_child's candidates fall out of the list.
    expect(screen.getByText("ag_root")).toBeInTheDocument();
    expect(screen.getByText("Belongs to the root")).toBeInTheDocument();
    expect(screen.queryByText("First idea")).toBeNull();
  });

  test("recent activity rows render for matching agenome and exclude other agenomes' events", () => {
    const state = {
      ...seededState(),
      activityEventLog: [
        {
          sequence: 1,
          occurredAt: "2026-06-21T00:00:00Z",
          type: "candidate.created",
          actor: "runtime",
          payload: {},
          agenomeId: "ag_child",
        },
        {
          sequence: 2,
          occurredAt: "2026-06-21T00:00:00Z",
          type: "candidate.scored",
          actor: "runtime",
          payload: {},
          agenomeId: "ag_root",
        },
      ],
    };
    renderWithStore(<AgenomeInspector />, { initialState: state });
    expect(screen.getByText("candidate.created")).toBeInTheDocument();
    expect(screen.queryByText("candidate.scored")).toBeNull();
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
