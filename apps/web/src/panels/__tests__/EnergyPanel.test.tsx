import { screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { type RunStoreState, initialRunStoreState } from "../../state/reducer.js";
import { renderWithStore } from "../../test-utils/render.js";
import { EnergyPanel } from "../EnergyPanel.js";

function stateWith(rows: Record<string, number>, exhausted = false): RunStoreState {
  return {
    ...initialRunStoreState,
    runId: "run_x",
    run: { id: "run_x", status: "running", capsConfig: { energyBudget: 100 } },
    energySpend: rows,
    failureEvents: exhausted
      ? [{ sequence: 5, type: "energy_exhausted", payload: { reason: "cap" } }]
      : [],
  };
}

describe("EnergyPanel", () => {
  test("empty state shows placeholder", () => {
    renderWithStore(<EnergyPanel />);
    expect(screen.getByText(/No energy events yet/)).toBeInTheDocument();
  });

  test("renders agenome rows sorted by descending energy", () => {
    renderWithStore(<EnergyPanel />, {
      initialState: stateWith({ ag_b: 5, ag_a: 25 }),
    });
    const rows = screen.getAllByRole("row");
    // first row is header
    expect(rows[1]).toHaveTextContent("ag_a");
    expect(rows[2]).toHaveTextContent("ag_b");
  });

  test("energy_exhausted surfaces the banner", () => {
    renderWithStore(<EnergyPanel />, {
      initialState: stateWith({ ag_a: 99 }, true),
    });
    expect(screen.getByRole("alert")).toHaveTextContent(/energy_exhausted/);
  });
});
