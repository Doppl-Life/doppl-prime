import { screen, waitFor } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { initialRunStoreState } from "../../state/reducer.js";
import { makeStubClient, renderWithStore } from "../../test-utils/render.js";
import { LineageGraph } from "../LineageGraph.js";

// React Flow needs ResizeObserver + matchMedia in jsdom. Patch minimal
// stubs so the component doesn't blow up on render.
class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver?: typeof StubResizeObserver }).ResizeObserver =
  StubResizeObserver;
if (!("matchMedia" in window)) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
}

describe("LineageGraph", () => {
  test("shows 'no run loaded' when runId is null", () => {
    renderWithStore(<LineageGraph />);
    expect(screen.getByText(/No run loaded/i)).toBeInTheDocument();
  });

  test("shows the empty-projection placeholder when projection is empty", async () => {
    const client = makeStubClient({
      getLineage: async () => ({ runId: "run_x", sequenceThrough: 0, nodes: [], edges: [] }),
    });
    renderWithStore(<LineageGraph />, {
      client,
      initialState: { ...initialRunStoreState, runId: "run_x" },
    });
    await waitFor(() => {
      expect(screen.getByText(/No lineage yet/i)).toBeInTheDocument();
    });
  });

  test("error message surfaces when getLineage rejects", async () => {
    const client = makeStubClient({
      getLineage: async () => {
        throw new Error("boom");
      },
    });
    renderWithStore(<LineageGraph />, {
      client,
      initialState: { ...initialRunStoreState, runId: "run_x" },
    });
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("boom");
    });
  });

  test("populated projection renders the React Flow container", async () => {
    const client = makeStubClient({
      getLineage: async () => ({
        runId: "run_x",
        sequenceThrough: 1,
        nodes: [
          { id: "ag_1", type: "agenome", label: "ag_1" },
          { id: "cand_1", type: "candidate", label: "cand_1", status: "created" },
        ],
        edges: [
          {
            id: "ag_1__owns_candidate__cand_1",
            source: "ag_1",
            target: "cand_1",
            type: "owns_candidate",
          },
        ],
      }),
    });
    const { container } = renderWithStore(<LineageGraph />, {
      client,
      initialState: { ...initialRunStoreState, runId: "run_x" },
    });
    await waitFor(() => {
      expect(container.querySelector('[aria-label="Lineage graph"]')).not.toBeNull();
    });
  });
});
