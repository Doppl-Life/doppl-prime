import { screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { type RunStoreState, initialRunStoreState } from "../../state/reducer.js";
import { renderWithStore } from "../../test-utils/render.js";
import { CheckEvidence } from "../CheckEvidence.js";

function stateWithChecks(): RunStoreState {
  return {
    ...initialRunStoreState,
    runId: "run_x",
    selection: { candidateId: "cand_1", agenomeId: null },
    checkResults: {
      a: {
        id: "a",
        candidateId: "cand_1",
        checkType: "transfer.source_validity",
        status: "passed",
        score: 1.0,
        evidenceRefs: [],
      },
      b: {
        id: "b",
        candidateId: "cand_1",
        checkType: "transfer.prior_art",
        status: "skipped",
        skipReason: "no_corpus_match",
        evidenceRefs: [],
      },
      c: {
        id: "c",
        candidateId: "cand_1",
        checkType: "final_judge",
        status: "passed",
        score: 21,
        evidenceRefs: [],
      },
    },
  };
}

describe("CheckEvidence", () => {
  test("no selection → placeholder", () => {
    renderWithStore(<CheckEvidence />);
    expect(screen.getByText(/Select a candidate/)).toBeInTheDocument();
  });

  test("passed/failed/skipped rows render with status + detail columns", () => {
    renderWithStore(<CheckEvidence />, { initialState: stateWithChecks() });
    expect(screen.getByText("transfer.source_validity")).toBeInTheDocument();
    expect(screen.getByText("transfer.prior_art")).toBeInTheDocument();
    expect(screen.getByText("no_corpus_match")).toBeInTheDocument();
  });

  test("final_judge check carries the JUDGE tag", () => {
    renderWithStore(<CheckEvidence />, { initialState: stateWithChecks() });
    expect(screen.getByText("JUDGE")).toBeInTheDocument();
  });

  test("empty checks → 'No check results yet'", () => {
    const state = stateWithChecks();
    state.checkResults = {};
    renderWithStore(<CheckEvidence />, { initialState: state });
    expect(screen.getByText(/No check results yet/)).toBeInTheDocument();
  });
});
