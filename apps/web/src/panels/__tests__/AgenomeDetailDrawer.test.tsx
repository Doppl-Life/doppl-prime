import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { initialRunStoreState } from "../../state/reducer.js";
import { renderWithStore } from "../../test-utils/render.js";
import { AgenomeDetailDrawer } from "../AgenomeDetailDrawer.js";

const seededState = () => ({
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

describe("AgenomeDetailDrawer", () => {
  test("renders nothing when no agenome is selected", () => {
    renderWithStore(<AgenomeDetailDrawer />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("renders the drawer and the wrapped AgenomeInspector when agenomeId is set", () => {
    renderWithStore(<AgenomeDetailDrawer />, { initialState: seededState() });
    const drawer = screen.getByRole("dialog");
    expect(drawer).toBeInTheDocument();
    // The selected agenome's id appears via the wrapped inspector.
    expect(screen.getByText("ag_child")).toBeInTheDocument();
  });

  test("clicking the close button clears the selection (drawer closes)", () => {
    renderWithStore(<AgenomeDetailDrawer />, { initialState: seededState() });
    fireEvent.click(screen.getByLabelText("Close agenome detail"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("pressing Escape clears the selection", () => {
    renderWithStore(<AgenomeDetailDrawer />, { initialState: seededState() });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
