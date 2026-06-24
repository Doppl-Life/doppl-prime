import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import { ALLOWED_RATERS } from "../src/raters";
import type { CalibratorIndex } from "../src/types";

const fixture: CalibratorIndex = {
  generated_at: "2026-06-22T00:00:00.000Z",
  source_kind: "vault",
  comparison_sets: [
    {
      comparison_set_id: "fsd-accident-economy-v0",
      case_id: "fsd-accident-economy",
      title: "FSD Accident Economy Kernel Comparison v0",
      status: "fixture_only",
      input_hash: "sha256:fixture-fsd-accident-economy-v0",
      input_paths: ["case.md", "problem.md"],
      adapter_version: "calibrator-comparison-v0",
      body: "# Comparison",
    },
  ],
  cases: [
    {
      case_id: "fsd-accident-economy",
      title: "When the Crashes Don't Come",
      visibility: "internal",
      source_paths: [],
      body: "# Case body",
      problem: { body: "# Problem body", source: "case-study" },
      problem_recoveries: [
        {
          case_id: "fsd-accident-economy",
          problem_recovery_id: "pr_fsd_accident_economy_fixture",
          title: "Accident Economy Dependency Shock",
          source_type: "manual",
          source_status: "fixture",
          body: "# Recovered problem body",
          human_ratings: [],
        },
        {
          case_id: "fsd-accident-economy",
          problem_recovery_id: "dalton-fsd-accident-economy-001__problem_recovery",
          title: "Crash-Volume Revenue Dependency",
          source_type: "kernel",
          source_status: "imported",
          kernel: "dalton",
          body:
            "# Imported recovered problem body\n\nTRACE ### CASE STUDY · SYNOPSIS\n\nFTC reports on algorithmic bias <span class=\"arrow\"-> field: xai-frameworks</span>\n\nGROWTH — PROBLEM RECOVERY ### CLAIM MANUAL UNDERWRITING IS TOO SLOW\n\nThe recovered problem is visible.",
          human_ratings: [],
        },
      ],
      solutions: [
        {
          case_id: "fsd-accident-economy",
          solution_id: "dalton-fsd-accident-economy-001__solution",
          title: "Accident-Economy Transition Ledger",
          source_type: "kernel",
          source_status: "imported",
          kernel: "dalton",
          body: "# Imported solution body",
          human_ratings: [],
        },
        {
          case_id: "fsd-accident-economy",
          solution_id: "cody-accident-economy-map",
          title: "Crash Substrate Exposure Map",
          source_type: "kernel",
          comparison_set_id: "fsd-accident-economy-v0",
          comparison_input_hash: "sha256:fixture-fsd-accident-economy-v0",
          comparison_input_paths: ["case.md", "problem.md"],
          source_status: "fixture",
          source_branch: "cody",
          source_commit: "unavailable-for-fixture",
          adapter_version: "calibrator-comparison-v0",
          adapter_notes: "Seeded representative artifact.",
          kernel: "cody",
          judge_score: 3.7,
          body: "# Solution body",
          human_ratings: [
            {
              rating_id: "rating_fixture",
              rating_target: "solution",
              case_id: "fsd-accident-economy",
              solution_id: "cody-accident-economy-map",
              score: 4,
              verdict: "investigate",
              submitted_at: "2026-06-22T12:00:00.000Z",
              app_version: "calibrator-v0",
              body: "## Notes\n\nUseful.",
            },
          ],
        },
        {
          case_id: "fsd-accident-economy",
          solution_id: "michael-branch-solution-import",
          title: "Michael Branch Pending Solution",
          source_type: "kernel",
          comparison_set_id: "fsd-accident-economy-v0",
          source_status: "pending",
          kernel: "michael",
          body: "# Pending body",
          human_ratings: [],
        },
      ],
    },
  ],
};

describe("App", () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete window.DOPPL_CALIBRATOR_CONFIG;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === "/api/index") {
          return new Response(JSON.stringify(fixture), { status: 200 });
        }
        if (url === "/api/ratings" && init?.method === "POST") {
          return new Response(
            JSON.stringify({
              ratingId: "rating_test",
              relativePath: "calibration-vault/cases/fsd-accident-economy/ratings/rating_test.md",
            }),
            { status: 201 },
          );
        }
        return new Response("not found", { status: 404 });
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("loads the single-column trace and disables submit until score is selected", async () => {
    render(<App />);
    expect(await screen.findByRole("heading", { name: "When the Crashes Don't Come" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Problem recoveries" })).toHaveClass("active");
    expect(screen.getByLabelText("Problem recovery")).toHaveTextContent("Crash-Volume Revenue Dependency");
    expect(screen.getByLabelText("Problem recovery")).not.toHaveTextContent("Accident-Economy Transition Ledger");
    await userEvent.click(screen.getByRole("button", { name: "Doppls" }));
    expect(screen.getByLabelText("Doppl")).toHaveTextContent("Accident-Economy Transition Ledger");
    expect(screen.getByLabelText("Doppl")).not.toHaveTextContent("Crash Substrate Exposure Map");
    await userEvent.click(screen.getByRole("button", { name: "Problem recoveries" }));
    expect(screen.getByLabelText("Case and selected artifact review")).toHaveTextContent("Case Study");
    expect(screen.queryByLabelText("Blind")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Include audit artifacts")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Current review status")).not.toBeInTheDocument();
    expect(screen.queryByText("Vault")).not.toBeInTheDocument();
    expect(screen.queryByText("1 case")).not.toBeInTheDocument();
    expect(screen.queryByText("Seeded representative artifact.")).not.toBeInTheDocument();
    expect(screen.queryByText("investigate")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Notes")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit problem recovery rating" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Score/), { target: { value: "4" } });
    expect(screen.getByRole("button", { name: "Submit problem recovery rating" })).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Reviewer email"), "dalton.dinderman@challenger.gauntletai.com");
    expect(screen.getByRole("button", { name: "Submit problem recovery rating" })).toBeEnabled();
  });

  it("summarizes an aGarden-backed index by rateable cases only", async () => {
    vi.mocked(fetch).mockImplementation(async (input: string | URL | Request) => {
      const url = input.toString();
      if (url === "/api/index") {
        return new Response(
          JSON.stringify({
            ...fixture,
            source_kind: "agarden",
            cases: [
              ...fixture.cases,
              {
                case_id: "houston-baggage-claim-complaints-57251c2c",
                title: "Houston Baggage Claim Complaints",
                visibility: "internal",
                source_paths: [],
                body: "# Houston",
                problem: { body: "# Context", source: "agarden" },
                problem_recoveries: [],
                solutions: [],
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response("not found", { status: 404 });
    });

    render(<App />);
    await screen.findByRole("heading", { name: "When the Crashes Don't Come" });
    expect(screen.queryByText("aGarden")).not.toBeInTheDocument();
    expect(screen.queryByText("1 case")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Case study")).not.toHaveTextContent("Houston Baggage Claim Complaints");
  });

  it("hides empty aGarden cases so reviewers only see rateable work", async () => {
    vi.mocked(fetch).mockImplementation(async (input: string | URL | Request) => {
      const url = input.toString();
      if (url === "/api/index") {
        return new Response(
          JSON.stringify({
            ...fixture,
            source_kind: "agarden",
            cases: [
              {
                case_id: "houston-baggage-claim-complaints-57251c2c",
                title: "Houston Baggage Claim Complaints",
                visibility: "internal",
                source_paths: [],
                body: "# Houston",
                problem: { body: "# Context", source: "agarden" },
                problem_recoveries: [],
                solutions: [],
              },
              ...fixture.cases,
            ],
          }),
          { status: 200 },
        );
      }
      return new Response("not found", { status: 404 });
    });

    render(<App />);
    expect(await screen.findByRole("heading", { name: "When the Crashes Don't Come" })).toBeInTheDocument();
    expect(screen.getByLabelText("Case study")).toHaveValue("fsd-accident-economy");
    expect(screen.getByLabelText("Case study")).not.toHaveTextContent("Houston Baggage Claim Complaints");
    expect(screen.getByLabelText("Problem recovery")).toHaveTextContent("Crash-Volume Revenue Dependency");
  });

  it("renders a searchable rater allow-list and rejects unknown reviewers", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: "When the Crashes Don't Come" });
    const reviewerInput = screen.getByLabelText("Reviewer email");
    expect(reviewerInput).toHaveAttribute("list", "reviewer-email-options");
    expect(
      document.querySelector('datalist#reviewer-email-options option[value="melissa.hargis@challenger.gauntletai.com"]'),
    ).toBeInTheDocument();
    expect(document.querySelectorAll("datalist#reviewer-email-options option")).toHaveLength(ALLOWED_RATERS.length);

    fireEvent.change(screen.getByLabelText(/Score/), { target: { value: "4" } });
    await userEvent.type(reviewerInput, "unknown@example.com");
    expect(screen.getByRole("button", { name: "Submit problem recovery rating" })).toBeDisabled();
    expect(screen.getByText("Choose a reviewer from the allow-list.")).toBeInTheDocument();
  });

  it("loads the previously selected rater from local storage", async () => {
    window.localStorage.setItem("doppl-calibrator-reviewer-email", "cody.clayton@challenger.gauntletai.com");
    render(<App />);
    await screen.findByRole("heading", { name: "When the Crashes Don't Come" });
    expect(screen.getByLabelText("Reviewer email")).toHaveValue("cody.clayton@challenger.gauntletai.com");
  });

  it("moves to the next unrated artifact in the review queue", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: "When the Crashes Don't Come" });
    expect(screen.getByRole("heading", { name: "Crash-Volume Revenue Dependency" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Next unrated" }));
    expect(screen.getByRole("heading", { name: "Accident-Economy Transition Ledger" })).toBeInTheDocument();
    expect(screen.getByLabelText("Doppl")).toHaveValue("dalton-fsd-accident-economy-001__solution");
  });

  it("formats compressed aGarden artifact markdown as readable sections", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: "When the Crashes Don't Come" });
    expect(screen.getByRole("heading", { name: "Trace" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Case study · Synopsis" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Growth — Problem recovery" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Claim Manual Underwriting Is Too Slow" })).toBeInTheDocument();
    expect(screen.getByText("FTC reports on algorithmic bias -> field: xai-frameworks")).toBeInTheDocument();
    expect(screen.queryByText(/span class/)).not.toBeInTheDocument();
    for (const heading of screen.getAllByRole("heading")) {
      expect(heading.textContent).not.toContain("#");
    }
  });

  it("deduplicates discovery context paragraphs already shown in the case study", async () => {
    vi.mocked(fetch).mockImplementation(async (input: string | URL | Request) => {
      const url = input.toString();
      if (url === "/api/index") {
        return new Response(
          JSON.stringify({
            ...fixture,
            cases: [
              {
                ...fixture.cases[0],
                body: "# Case\n\nShared paragraph.\n\nCase-only paragraph.",
                problem: { body: "Shared paragraph.\n\nProblem-only paragraph.", source: "case-study" },
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response("not found", { status: 404 });
    });

    render(<App />);
    await screen.findByRole("heading", { name: "When the Crashes Don't Come" });
    expect(screen.getAllByText("Shared paragraph.")).toHaveLength(1);
    expect(screen.getByText("Problem-only paragraph.")).toBeInTheDocument();
  });

  it("collapses case study sections by default and expands them on demand", async () => {
    vi.mocked(fetch).mockImplementation(async (input: string | URL | Request) => {
      const url = input.toString();
      if (url === "/api/index") {
        return new Response(
          JSON.stringify({
            ...fixture,
            cases: [
              {
                ...fixture.cases[0],
                body:
                  "# When the Crashes Don't Come\n\n## Context\n\nContext body.\n\n## The Situation\n\nSituation body.\n\n## Decision Point\n\nDecision body.\n\n## Synopsis\n\nSynopsis body.",
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response("not found", { status: 404 });
    });

    render(<App />);
    await screen.findByRole("heading", { name: "When the Crashes Don't Come" });
    expect(screen.getByRole("button", { name: "Context" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "The Situation" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "Decision Point" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "Synopsis" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Context body.")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Context" }));
    expect(screen.getByRole("button", { name: "Context" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Context body.")).toBeInTheDocument();
  });

  it("submits a rating and shows the saved path", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: "When the Crashes Don't Come" });
    await userEvent.click(screen.getByRole("button", { name: "Doppls" }));
    await userEvent.selectOptions(
      screen.getByLabelText("Doppl"),
      "dalton-fsd-accident-economy-001__solution",
    );
    fireEvent.change(screen.getByLabelText(/Score/), { target: { value: "4" } });
    await userEvent.type(screen.getByLabelText("Reviewer email"), "melissa.hargis@challenger.gauntletai.com");
    await userEvent.click(screen.getByRole("button", { name: "Submit doppl rating" }));
    await waitFor(() => {
      expect(screen.getByText(/rating_test.md/)).toBeInTheDocument();
    });
  });

  it("submits a problem recovery rating payload", async () => {
    const fetchMock = vi.mocked(fetch);
    render(<App />);
    await screen.findByRole("heading", { name: "When the Crashes Don't Come" });
    await userEvent.selectOptions(
      screen.getByLabelText("Problem recovery"),
      "dalton-fsd-accident-economy-001__problem_recovery",
    );
    expect(screen.getByRole("heading", { name: "Crash-Volume Revenue Dependency" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Score/), { target: { value: "4" } });
    await userEvent.type(screen.getByLabelText("Reviewer email"), "cody.clayton@challenger.gauntletai.com");
    await userEvent.click(screen.getByRole("button", { name: "Submit problem recovery rating" }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/ratings",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"rating_target":"problem_recovery"'),
        }),
      );
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/ratings",
      expect.objectContaining({
        body: expect.stringContaining('"problem_recovery_id":"dalton-fsd-accident-economy-001__problem_recovery"'),
      }),
    );
  });

  it("submits aGarden ratings with the selected node id", async () => {
    const fetchMock = vi.mocked(fetch);
    const agardenFixture: CalibratorIndex = {
      generated_at: "2026-06-24T00:00:00.000Z",
      source_kind: "agarden",
      comparison_sets: [],
      cases: [
        {
          node_id: "case-a",
          case_id: "case-a",
          title: "Case A",
          source_kind: "agarden",
          visibility: "internal",
          source_paths: ["flow/case-a/case-a.md"],
          body: "# Case A",
          problem: { body: "Problem", source: "agarden" },
          problem_recoveries: [
            {
              node_id: "node-pr",
              case_id: "case-a",
              problem_recovery_id: "node-pr",
              title: "Problem Recovery",
              source_path: "flow/case-a/problem-recovery/node-pr.md",
              ledger_path: "ratings-ledger.json",
              source_type: "kernel",
              source_status: "imported",
              body: "# Problem Recovery",
              human_ratings: [],
            },
          ],
          solutions: [],
        },
      ],
    };
    fetchMock.mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
      const url = input.toString();
      if (url === "/api/index") return new Response(JSON.stringify(agardenFixture), { status: 200 });
      if (url === "/api/ratings" && init?.method === "POST") {
        return new Response(
          JSON.stringify({ ratingId: "node-pr:dalton", relativePath: "ratings-ledger.json", scores: { human: 4, n: 1 } }),
          { status: 201 },
        );
      }
      return new Response("not found", { status: 404 });
    });

    render(<App />);
    await screen.findByRole("heading", { name: "Case A" });
    fireEvent.change(screen.getByLabelText(/Score/), { target: { value: "4" } });
    await userEvent.type(screen.getByLabelText("Reviewer email"), "dalton.dinderman@challenger.gauntletai.com");
    await userEvent.click(screen.getByRole("button", { name: "Submit problem recovery rating" }));

    await waitFor(() => {
      expect(screen.getByText(/ratings-ledger\.json/)).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/ratings",
      expect.objectContaining({
        body: expect.stringContaining('"node_id":"node-pr"'),
      }),
    );
  });

  it("falls back to the static index in read-only preview mode", async () => {
    vi.mocked(fetch).mockImplementation(async (input: string | URL | Request) => {
      const url = input.toString();
      if (url === "/api/index") {
        return new Response("not found", { status: 404 });
      }
      if (url.startsWith("calibration-index.json")) {
        return new Response(JSON.stringify(fixture), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    });

    render(<App />);
    expect(await screen.findByRole("heading", { name: "When the Crashes Don't Come" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Doppls" }));
    await userEvent.selectOptions(
      screen.getByLabelText("Doppl"),
      "dalton-fsd-accident-economy-001__solution",
    );
    fireEvent.change(screen.getByLabelText(/Score/), { target: { value: "4" } });
    expect(screen.getByRole("button", { name: "Submit doppl rating" })).toBeDisabled();
    expect(screen.getByText("Rating writes require the local dev server or hosted ratings API.")).toBeInTheDocument();
  });

  it("submits through the hosted ratings endpoint when static preview is configured", async () => {
    window.DOPPL_CALIBRATOR_CONFIG = {
      ratingsEndpoint: "https://ratings.example.test/api/agarden/ratings",
    };
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
      const url = input.toString();
      if (url === "/api/index") {
        return new Response("not found", { status: 404 });
      }
      if (url.startsWith("calibration-index.json")) {
        return new Response(JSON.stringify(fixture), { status: 200 });
      }
      if (url === "https://ratings.example.test/api/agarden/ratings" && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            ratingId: "hosted-rating",
            relativePath: "ratings-ledger.json",
          }),
          { status: 201 },
        );
      }
      return new Response("not found", { status: 404 });
    });

    render(<App />);
    await screen.findByRole("heading", { name: "When the Crashes Don't Come" });
    fireEvent.change(screen.getByLabelText(/Score/), { target: { value: "4" } });
    await userEvent.type(screen.getByLabelText("Reviewer email"), "dalton.dinderman@challenger.gauntletai.com");
    await userEvent.click(screen.getByRole("button", { name: "Submit problem recovery rating" }));

    await waitFor(() => {
      expect(screen.getByText(/ratings-ledger\.json/)).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://ratings.example.test/api/agarden/ratings",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("keeps source details collapsed behind one toggle", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: "When the Crashes Don't Come" });
    await userEvent.click(screen.getByRole("button", { name: "Doppls" }));
    await userEvent.selectOptions(screen.getByLabelText("Doppl"), "dalton-fsd-accident-economy-001__solution");
    expect((await screen.findAllByText("Accident-Economy Transition Ledger")).length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("Comparison set provenance")).not.toBeInTheDocument();
    expect(screen.queryByText("source status")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show source details +" }));
    expect(screen.getByText("source status")).toBeInTheDocument();
    expect(screen.getByText("imported")).toBeInTheDocument();
    expect(screen.queryByText("Audit-only artifacts are visible for provenance but are not rateable.")).not.toBeInTheDocument();
  });

  it("keeps artifact labels visible without blind review mode", async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "Doppls" }));
    await userEvent.selectOptions(
      await screen.findByLabelText("Doppl"),
      "dalton-fsd-accident-economy-001__solution",
    );
    expect((await screen.findAllByText("Accident-Economy Transition Ledger")).length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("Blind")).not.toBeInTheDocument();
    expect(screen.queryByText("Doppl A")).not.toBeInTheDocument();
    expect(screen.queryByText("source status")).not.toBeInTheDocument();
  });
});
