import { screen, waitFor } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { initialRunStoreState } from "../../state/reducer.js";
import { makeStubClient, renderWithStore } from "../../test-utils/render.js";
import { CandidateInspector } from "../CandidateInspector.js";

describe("CandidateInspector", () => {
  test("no candidate selected → placeholder", () => {
    renderWithStore(<CandidateInspector />);
    expect(screen.getByText(/Select a candidate/)).toBeInTheDocument();
  });

  test("cross-domain candidate renders its subtype payload", async () => {
    const client = makeStubClient({
      getCandidate: async () => ({
        runId: "run_x",
        candidate: {
          id: "cand_1",
          runId: "run_x",
          generationId: "gen_0",
          agenomeId: "ag_1",
          subtype: "cross_domain_transfer",
          title: "Selection-as-loss",
          summary: "fitness pressure → validation loss",
          claims: ["claim 1"],
          evidenceRefs: [{ kind: "raw_output", eventId: "evt_1" }],
          status: "scored",
          subtypePayload: {
            sourceDomain: "biology",
            sourceTechnique: "natural selection",
            targetDomain: "ML",
            targetProblem: "regression overfit",
            transferMapping: "fitness → loss",
            expectedMechanism: "diversity sampler",
          },
        },
      }),
    });
    renderWithStore(<CandidateInspector />, {
      client,
      initialState: {
        ...initialRunStoreState,
        runId: "run_x",
        selection: { candidateId: "cand_1", agenomeId: null, selectionEpoch: 0 },
      },
    });
    await waitFor(() => {
      expect(screen.getByText("Selection-as-loss")).toBeInTheDocument();
    });
    expect(screen.getByText("biology")).toBeInTheDocument();
    expect(screen.getByText("ML")).toBeInTheDocument();
    expect(screen.getByText("claim 1")).toBeInTheDocument();
  });

  test("zeitgeist candidate renders its subtype payload", async () => {
    const client = makeStubClient({
      getCandidate: async () => ({
        runId: "run_x",
        candidate: {
          id: "cand_z",
          runId: "run_x",
          generationId: "gen_0",
          agenomeId: "ag_z",
          subtype: "zeitgeist_synthesis",
          title: "Agent eval thesis",
          summary: "small evaluators ship inside agent products",
          claims: [],
          evidenceRefs: [],
          status: "scored",
          subtypePayload: {
            thesis: "small evaluators ship inside agent products",
            audience: "agent builders",
            currentSignals: ["sig a", "sig b"],
            whyNow: "evaluator hosting can't keep up",
            falsifiablePredictions: ["pred 1"],
            comparablePriorArt: ["prior 1"],
          },
        },
      }),
    });
    renderWithStore(<CandidateInspector />, {
      client,
      initialState: {
        ...initialRunStoreState,
        runId: "run_x",
        selection: { candidateId: "cand_z", agenomeId: null, selectionEpoch: 0 },
      },
    });
    await waitFor(() => {
      expect(screen.getByText("Agent eval thesis")).toBeInTheDocument();
    });
    expect(screen.getByText(/sig a/)).toBeInTheDocument();
    expect(screen.getByText("pred 1")).toBeInTheDocument();
  });

  test("error from getCandidate surfaces via alert", async () => {
    const client = makeStubClient({
      getCandidate: async () => {
        throw new Error("not found");
      },
    });
    renderWithStore(<CandidateInspector />, {
      client,
      initialState: {
        ...initialRunStoreState,
        runId: "run_x",
        selection: { candidateId: "cand_missing", agenomeId: null, selectionEpoch: 0 },
      },
    });
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("not found");
    });
  });

  test("renders title/summary/explanation from the store even when API response lacks them", async () => {
    const client = makeStubClient({
      getCandidate: async () => ({
        runId: "run_x",
        candidate: {
          // API projection is lossy; pretend the server returned only the skeleton.
          id: "cand_se",
          runId: "run_x",
          generationId: "gen_0",
          agenomeId: "ag_1",
          subtype: "cross_domain_transfer",
          // title, summary, subtypePayload intentionally absent from this response
          claims: [],
          evidenceRefs: [],
          status: "scored",
        } as unknown as never,
      }),
    });
    renderWithStore(<CandidateInspector />, {
      client,
      initialState: {
        ...initialRunStoreState,
        runId: "run_x",
        selection: { candidateId: "cand_se", agenomeId: null, selectionEpoch: 0 },
        candidates: {
          cand_se: {
            id: "cand_se",
            agenomeId: "ag_1",
            generationId: "gen_0",
            subtype: "cross_domain_transfer",
            status: "scored",
            title: "Stored title",
            summary: "Stored technical summary.",
            explanation: "Plain English: stored layperson explanation.",
          },
        },
      },
    });
    await waitFor(() => {
      expect(screen.getByText("Stored title")).toBeInTheDocument();
    });
    expect(screen.getByText(/stored layperson explanation/i)).toBeInTheDocument();
    expect(screen.getByText("Technical summary")).toBeInTheDocument();
    expect(screen.getByText(/Stored technical summary\./)).toBeInTheDocument();
  });
});
