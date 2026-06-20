import { screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { type RunStoreState, initialRunStoreState } from "../../state/reducer.js";
import { renderWithStore } from "../../test-utils/render.js";
import { CriticGauntlet } from "../CriticGauntlet.js";

function stateWith(): RunStoreState {
  return {
    ...initialRunStoreState,
    runId: "run_x",
    candidates: {
      cand_1: {
        id: "cand_1",
        agenomeId: "ag_1",
        status: "scored",
        summary: "Candidate body content here.",
      },
    },
    criticReviews: {
      r1: {
        id: "r1",
        candidateId: "cand_1",
        mandate: "factual_grounding",
        scores: {},
        critique: "Reasonable.",
        confidence: 0.7,
        evidenceRefs: [{ kind: "raw_output", eventId: "evt_e" }],
      },
      r2: {
        id: "r2",
        candidateId: "cand_1",
        mandate: "feasibility",
        scores: {},
        critique: "Plausible.",
        confidence: 0.6,
        evidenceRefs: [],
      },
    },
    selection: { candidateId: "cand_1", agenomeId: null },
  };
}

describe("CriticGauntlet", () => {
  test("no selection → placeholder", () => {
    renderWithStore(<CriticGauntlet />);
    expect(screen.getByText(/Select a candidate/)).toBeInTheDocument();
  });

  test("renders reviews + candidate-as-data block (rubric vs DATA delimited)", () => {
    renderWithStore(<CriticGauntlet />, { initialState: stateWith() });
    expect(screen.getByText("factual_grounding")).toBeInTheDocument();
    expect(screen.getByText("feasibility")).toBeInTheDocument();
    expect(screen.getByText("Reasonable.")).toBeInTheDocument();
    // candidate body is in a clearly delimited "untrusted data" block
    const untrusted = screen.getByLabelText(/Candidate output — untrusted data/);
    expect(untrusted).toBeInTheDocument();
    expect(untrusted).toHaveTextContent(/Candidate body content/);
  });

  test("zero reviews → 'No critic reviews yet'", () => {
    const state = stateWith();
    state.criticReviews = {};
    renderWithStore(<CriticGauntlet />, { initialState: state });
    expect(screen.getByText(/No critic reviews yet/)).toBeInTheDocument();
  });
});
