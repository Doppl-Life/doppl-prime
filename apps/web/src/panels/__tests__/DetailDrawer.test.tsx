import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { initialRunStoreState } from "../../state/reducer.js";
import { renderWithStore } from "../../test-utils/render.js";
import { DetailDrawer } from "../DetailDrawer.js";

const agenomeSelected = () => ({
  ...initialRunStoreState,
  runId: "run_x",
  run: { id: "run_x", status: "running", capsConfig: {} } as any,
  agenomes: {
    ag_child: { id: "ag_child", parentIds: [], status: "spawned" },
  },
  selection: {
    candidateId: null,
    agenomeId: "ag_child",
    inspectorTab: "overview" as const,
    selectionEpoch: 1,
  },
});

const candidateSelected = () => ({
  ...initialRunStoreState,
  runId: "run_x",
  run: { id: "run_x", status: "running", capsConfig: {} } as any,
  selection: {
    candidateId: "cand_1",
    agenomeId: null,
    inspectorTab: "overview" as const,
    selectionEpoch: 1,
  },
});

describe("DetailDrawer", () => {
  test("renders nothing when nothing is selected", () => {
    renderWithStore(<DetailDrawer />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("renders AgenomeInspector when an agenome is selected", () => {
    renderWithStore(<DetailDrawer />, { initialState: agenomeSelected() });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("ag_child")).toBeInTheDocument();
  });

  test("renders CandidateDetailInspector when a candidate is selected", () => {
    renderWithStore(<DetailDrawer />, { initialState: candidateSelected() });
    // CandidateDetailInspector is the wrapper; its presence is enough —
    // the deeper "no candidate data yet" placeholder shows up when the
    // stub api returns null.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  test("close button clears the selection (drawer closes)", () => {
    renderWithStore(<DetailDrawer />, { initialState: agenomeSelected() });
    fireEvent.click(screen.getByLabelText("Close detail"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("Escape clears the selection (drawer closes)", () => {
    renderWithStore(<DetailDrawer />, { initialState: candidateSelected() });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
