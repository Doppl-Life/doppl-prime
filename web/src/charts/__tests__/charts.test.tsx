import { screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { type RunStoreState, initialRunStoreState } from "../../state/reducer.js";
import { renderWithStore } from "../../test-utils/render.js";
import { FitnessOverTime } from "../FitnessOverTime.js";
import { GenerationComparison } from "../GenerationComparison.js";
import { SERIES_THEMES, pickSeriesTheme } from "../chartTheme.js";

// React Flow + Recharts both need ResizeObserver
class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver?: typeof StubResizeObserver }).ResizeObserver =
  StubResizeObserver;

function stateWithFitness(
  rows: { id: string; candidateId: string; total: number; gen: number }[],
): RunStoreState {
  const fitnessScores: Record<string, RunStoreState["fitnessScores"][string]> = {};
  const candidates: Record<string, RunStoreState["candidates"][string]> = {};
  for (const r of rows) {
    fitnessScores[r.id] = {
      id: r.id,
      candidateId: r.candidateId,
      total: r.total,
      components: {},
      policyVersion: "v1",
      explanation: "",
    };
    candidates[r.candidateId] = {
      id: r.candidateId,
      agenomeId: "ag",
      generationId: `gen_${r.gen}`,
      status: "scored",
    };
  }
  return { ...initialRunStoreState, runId: "run_x", fitnessScores, candidates };
}

describe("chartTheme", () => {
  test("returns distinct dasharray for adjacent indexes", () => {
    expect(pickSeriesTheme(0).strokeDasharray).not.toBe(pickSeriesTheme(1).strokeDasharray);
  });

  test("wraps when index exceeds length", () => {
    expect(pickSeriesTheme(SERIES_THEMES.length).stroke).toBe(SERIES_THEMES[0]?.stroke);
  });
});

describe("FitnessOverTime", () => {
  test("empty data renders the placeholder", () => {
    renderWithStore(<FitnessOverTime />);
    expect(screen.getByText(/No fitness data yet/)).toBeInTheDocument();
  });

  test("populated data renders the chart container with aria-label", () => {
    const state = stateWithFitness([
      { id: "f1", candidateId: "c1", total: 1.0, gen: 0 },
      { id: "f2", candidateId: "c1", total: 2.0, gen: 1 },
    ]);
    const { container } = renderWithStore(<FitnessOverTime />, { initialState: state });
    expect(screen.getByLabelText("Fitness over time")).toBeInTheDocument();
    expect(container.querySelector("svg")).not.toBeNull();
  });
});

describe("GenerationComparison", () => {
  test("empty data renders the placeholder", () => {
    renderWithStore(<GenerationComparison />);
    expect(screen.getByText(/No generation data yet/)).toBeInTheDocument();
  });

  test("populated data renders the chart container", () => {
    const state = stateWithFitness([
      { id: "f1", candidateId: "c1", total: 1.0, gen: 0 },
      { id: "f2", candidateId: "c2", total: 2.0, gen: 0 },
      { id: "f3", candidateId: "c1", total: 3.0, gen: 1 },
    ]);
    const { container } = renderWithStore(<GenerationComparison />, { initialState: state });
    expect(screen.getByLabelText("Generation comparison")).toBeInTheDocument();
    expect(container.querySelector("svg")).not.toBeNull();
  });
});
