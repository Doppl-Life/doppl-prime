import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { type RunStoreState, initialRunStoreState } from "../../state/reducer.js";
import { renderWithStore } from "../../test-utils/render.js";
import { CandidateDetailInspector } from "../CandidateDetailInspector.js";
import { FinalIdeaPanel } from "../FinalIdeaPanel.js";

function stateWithWinner(): RunStoreState {
  return {
    ...initialRunStoreState,
    runId: "run_x",
    run: { id: "run_x", status: "running" },
    candidates: {
      cand_lo: { id: "cand_lo", agenomeId: "ag_1", status: "scored" },
      cand_hi: { id: "cand_hi", agenomeId: "ag_2", status: "selected" },
    },
    agenomes: {
      ag_1: { id: "ag_1", parentIds: [], status: "active" },
      ag_2: { id: "ag_2", parentIds: [], status: "eligible_parent" },
    },
    fitnessScores: {
      f1: {
        id: "f1",
        candidateId: "cand_lo",
        total: 1.5,
        components: {},
        policyVersion: "v1",
        explanation: "",
      },
      f2: {
        id: "f2",
        candidateId: "cand_hi",
        total: 3.5,
        components: {},
        policyVersion: "v1",
        explanation: "",
      },
    },
    criticReviews: {
      r1: {
        id: "r1",
        candidateId: "cand_hi",
        mandate: "factual_grounding",
        scores: {},
        critique: "",
        confidence: 0.8,
        evidenceRefs: [],
      },
    },
    checkResults: {
      c1: {
        id: "c1",
        candidateId: "cand_hi",
        checkType: "final_judge",
        status: "passed",
        score: 22,
        evidenceRefs: [],
      },
    },
    energySpend: { ag_2: 25 },
  };
}

describe("FinalIdeaPanel", () => {
  test("empty fitness → 'will appear here once...' placeholder", () => {
    renderWithStore(<FinalIdeaPanel />);
    expect(screen.getByText(/will appear here once fitness has been scored/)).toBeInTheDocument();
  });

  test("zero-survivors completed run → 'No surviving idea' placeholder", () => {
    renderWithStore(<FinalIdeaPanel />, {
      initialState: {
        ...initialRunStoreState,
        runId: "run_x",
        run: { id: "run_x", status: "completed" },
      },
    });
    expect(screen.getByText(/No surviving idea/)).toBeInTheDocument();
  });

  test("highest-fitness candidate selected as the winner with all 6 proof links resolved", () => {
    renderWithStore(<FinalIdeaPanel />, { initialState: stateWithWinner() });
    // Header now leads with the candidate's title/summary instead of the
    // UUID; the UUID stays on the value element's title= attribute. Look for
    // it by querying that title attribute so the test stays stable as we vary
    // what the visible header says.
    const heading = document.querySelector('[title="cand_hi"]');
    expect(heading).not.toBeNull();
    // Agenome line still mentions "agenome" or "agent" — the fallback uses
    // "agenome <id>"; the persona derivation here resolves to "Descendant"
    // for ag_2 because the fixture has no gen-0 ancestor declared.
    expect(screen.getByText(/agenome|agent/i)).toBeInTheDocument();
    // 6 link rows
    const linkIds = ["lineage", "critics", "checks", "score", "energy", "traces"];
    for (const id of linkIds) {
      const link = document.querySelector(`[data-link-id="${id}"]`);
      expect(link).not.toBeNull();
      expect(link?.getAttribute("data-resolved")).toBe("true");
    }
  });

  test("if energy is missing, the energy link is flagged UNRESOLVED", () => {
    const state = stateWithWinner();
    state.energySpend = {};
    renderWithStore(<FinalIdeaPanel />, { initialState: state });
    const energyLink = document.querySelector('[data-link-id="energy"]');
    expect(energyLink?.getAttribute("data-resolved")).toBe("false");
    expect(screen.getAllByText("UNRESOLVED").length).toBeGreaterThan(0);
  });

  test("when winner has an explanation, renders both the explanation and labeled technical summary", () => {
    const state = stateWithWinner();
    state.candidates.cand_hi = {
      ...state.candidates.cand_hi!,
      title: "Surge tanks for traffic",
      summary: "Cross-domain transfer from hydraulic engineering to traffic flow.",
      explanation: "Plain English: borrow a pressure-release trick from water pipes to smooth out traffic jams.",
    };
    renderWithStore(<FinalIdeaPanel />, { initialState: state });
    expect(screen.getByText(/Plain English: borrow a pressure-release trick/)).toBeInTheDocument();
    expect(screen.getByText(/Technical summary/i)).toBeInTheDocument();
    expect(screen.getByText(/Cross-domain transfer from hydraulic engineering/)).toBeInTheDocument();
  });

  test("Traces proof link cancels hash navigation (no longer pushes #/traces/... to URL)", () => {
    const state = stateWithWinner();
    renderWithStore(<FinalIdeaPanel />, { initialState: state });
    const tracesLink = document.querySelector('[data-link-id="traces"]') as HTMLAnchorElement;
    expect(tracesLink).not.toBeNull();
    const originalHash = window.location.hash;
    // Click must be cancellable; preventDefault fires inside the panel so the
    // hash never updates. Before the fix, this link did nothing AND polluted
    // the URL with an unhandled #/traces/<id> hash.
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    fireEvent(tracesLink, event);
    expect(event.defaultPrevented).toBe(true);
    expect(window.location.hash).toBe(originalHash);
  });

  test("each proof link selects the matching inspector tab (critics → Critics, checks → Evidence, others → Overview)", () => {
    const state = stateWithWinner();
    renderWithStore(
      <>
        <FinalIdeaPanel />
        <CandidateDetailInspector />
      </>,
      { initialState: state },
    );

    // Helper: click the proof link with the given data-link-id.
    const click = (id: string) => {
      const link = document.querySelector(`[data-link-id="${id}"]`) as HTMLAnchorElement;
      expect(link).not.toBeNull();
      fireEvent.click(link);
    };
    // Helper: read which inspector tab is currently selected.
    const selectedTab = () =>
      document.querySelector('[role="tab"][aria-selected="true"]')?.textContent ?? null;

    click("critics");
    expect(selectedTab()).toBe("Critics");

    click("checks");
    expect(selectedTab()).toBe("Evidence");

    click("score");
    expect(selectedTab()).toBe("Overview");

    click("lineage");
    expect(selectedTab()).toBe("Overview");

    click("traces");
    expect(selectedTab()).toBe("Overview");
  });

  test("when winner has no explanation, falls back to single summary line (no 'Technical summary' label)", () => {
    const state = stateWithWinner();
    state.candidates.cand_hi = {
      ...state.candidates.cand_hi!,
      title: "Surge tanks for traffic",
      summary: "Cross-domain transfer from hydraulic engineering to traffic flow.",
      // explanation intentionally omitted
    };
    renderWithStore(<FinalIdeaPanel />, { initialState: state });
    expect(screen.getByText(/Cross-domain transfer from hydraulic engineering/)).toBeInTheDocument();
    expect(screen.queryByText(/Technical summary/i)).toBeNull();
  });
});
