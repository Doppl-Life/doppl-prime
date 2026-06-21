import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { initialRunStoreState } from "../../state/reducer.js";
import { renderWithStore } from "../../test-utils/render.js";
import { AgenomeDetailModal } from "../AgenomeDetailModal.js";

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

describe("AgenomeDetailModal", () => {
  test("renders nothing when no agenome is selected", () => {
    renderWithStore(<AgenomeDetailModal />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("renders the dialog and the wrapped AgenomeInspector when agenomeId is set", () => {
    renderWithStore(<AgenomeDetailModal />, { initialState: seededState() });
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    // The selected agenome's id appears via the wrapped inspector.
    expect(screen.getByText("ag_child")).toBeInTheDocument();
  });

  test("clicking the close button clears the selection (modal closes)", () => {
    renderWithStore(<AgenomeDetailModal />, { initialState: seededState() });
    fireEvent.click(screen.getByLabelText("Close agenome detail"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("clicking the backdrop clears the selection", () => {
    renderWithStore(<AgenomeDetailModal />, { initialState: seededState() });
    // The dialog itself is the backdrop; clicking it (not its inner card)
    // closes the modal.
    fireEvent.click(screen.getByRole("dialog"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("pressing Escape clears the selection", () => {
    renderWithStore(<AgenomeDetailModal />, { initialState: seededState() });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
