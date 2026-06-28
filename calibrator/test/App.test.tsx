import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
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
          problem_recovery_id:
            "dalton-fsd-accident-economy-001__problem_recovery",
          title: "Crash-Volume Revenue Dependency",
          source_type: "kernel",
          source_status: "imported",
          kernel: "dalton",
          body: '# Imported recovered problem body\n\nTRACE ### CASE STUDY · SYNOPSIS\n\nFTC reports on algorithmic bias <span class="arrow"-> field: xai-frameworks</span>\n\nGROWTH — PROBLEM RECOVERY ### CLAIM MANUAL UNDERWRITING IS TOO SLOW\n\nThe recovered problem is visible.',
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

async function waitForReviewWorkspace(
  name = "Crash-Volume Revenue Dependency",
) {
  return screen.findByRole("heading", { name });
}

describe("App", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/calibrator/");
    window.localStorage.clear();
    window.localStorage.setItem(
      "doppl-calibrator-reviewer-email",
      "dalton.dinderman@challenger.gauntletai.com",
    );
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
              relativePath:
                "calibration-vault/cases/fsd-accident-economy/ratings/rating_test.md",
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
    window.history.pushState({}, "", "/calibrator/");
    vi.unstubAllGlobals();
  });

  it("renders the hidden Agora route without reviewer login", async () => {
    window.localStorage.clear();
    window.history.pushState(
      {},
      "",
      `${window.location.origin}/calibrator/agora/`,
    );
    const agoraFixture: CalibratorIndex = structuredClone(fixture);
    agoraFixture.cases[0].problem_recoveries[1].scores = {
      judge: 1,
      human: 4,
      n: 2,
    };
    agoraFixture.cases[0].problem_recoveries[1].human_ratings = [
      {
        rating_id: "rating_agora_1",
        rating_target: "problem_recovery",
        case_id: "fsd-accident-economy",
        problem_recovery_id:
          "dalton-fsd-accident-economy-001__problem_recovery",
        score: 4,
        reviewer_email: "dalton.dinderman@challenger.gauntletai.com",
        submitted_at: "2026-06-25T12:00:00.000Z",
        app_version: "calibrator-v0",
        body: "",
      },
      {
        rating_id: "rating_agora_2",
        rating_target: "problem_recovery",
        case_id: "fsd-accident-economy",
        problem_recovery_id:
          "dalton-fsd-accident-economy-001__problem_recovery",
        score: 5,
        reviewer_email: "cody.clayton@challenger.gauntletai.com",
        submitted_at: "2026-06-25T12:01:00.000Z",
        app_version: "calibrator-v0",
        body: "",
      },
    ];
    vi.mocked(fetch).mockImplementation(
      async (input: string | URL | Request) => {
        const url = input.toString();
        if (url === "/api/index")
          return new Response(JSON.stringify(agoraFixture), { status: 200 });
        return new Response("not found", { status: 404 });
      },
    );

    render(<App />);

    expect(window.location.pathname).toBe("/calibrator/agora/");
    expect(await screen.findByText("Score map")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Agora" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Reviewer email")).not.toBeInTheDocument();
    expect(
      screen.getAllByText("Crash-Volume Revenue Dependency").length,
    ).toBeGreaterThan(1);
    expect(screen.getAllByText("Judge missed").length).toBeGreaterThan(1);
    expect(screen.getByText("Human ratings")).toBeInTheDocument();
    expect(screen.getByText("Comparison table")).toBeInTheDocument();
    expect(screen.getAllByText("+3.5").length).toBeGreaterThan(1);
  });

  it("prefers The Rock Star Drone Problem when it is present in the index", async () => {
    const preferredFixture: CalibratorIndex = structuredClone(fixture);
    preferredFixture.cases = [
      {
        case_id: "jack-drone-privacy-fd080117",
        title: "The Rock Star Drone Problem",
        visibility: "internal",
        source_paths: [],
        body: "# The Rock Star Drone Problem",
        problem: {
          body: "# The Rock Star Drone Problem",
          source: "case-study",
        },
        problem_recoveries: [
          {
            case_id: "jack-drone-privacy-fd080117",
            problem_recovery_id: "earlier_problem_recovery",
            node_id: "earlier_problem_recovery",
            title: "Earlier Problem Recovery",
            source_type: "kernel",
            source_status: "imported",
            body: "# Earlier Problem Recovery",
            human_ratings: [],
          },
          {
            case_id: "jack-drone-privacy-fd080117",
            problem_recovery_id:
              "the-asset-is-the-photograph-not-the-drone-9b2e71c4",
            node_id: "the-asset-is-the-photograph-not-the-drone-9b2e71c4",
            title: "The Asset Is the Photograph, Not the Drone",
            source_type: "kernel",
            source_status: "imported",
            body: "# The Asset Is the Photograph, Not the Drone",
            human_ratings: [],
          },
        ],
        solutions: [],
      },
      ...preferredFixture.cases,
    ];
    vi.mocked(fetch).mockImplementation(
      async (input: string | URL | Request) => {
        const url = input.toString();
        if (url === "/api/index")
          return new Response(JSON.stringify(preferredFixture), {
            status: 200,
          });
        return new Response("not found", { status: 404 });
      },
    );

    render(<App />);

    expect(
      await screen.findByRole("heading", {
        name: "The Asset Is the Photograph, Not the Drone",
      }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Case study")).toHaveValue(
      "jack-drone-privacy-fd080117",
    );
    expect(screen.getByLabelText("Problem recovery")).toHaveValue(
      "the-asset-is-the-photograph-not-the-drone-9b2e71c4",
    );
  });

  it("loads the single-column trace with a neutral-default 0 to 10 score", async () => {
    render(<App />);
    expect(await waitForReviewWorkspace()).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Problem recoveries" }),
    ).toHaveClass("active");
    expect(
      screen.getByText(
        /Rate how useful this problem recovery is for understanding or solving the case/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Choose a case")).toBeInTheDocument();
    expect(screen.getByText("Read the problem recovery")).toBeInTheDocument();
    expect(
      screen.getByText("Score usefulness from 0 to 10"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Problem recoveries are judged on whether they frame the important hidden problem clearly and usefully.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("0 misleading")).toBeInTheDocument();
    expect(screen.getByText("5 neutral")).toBeInTheDocument();
    expect(screen.getByText("10 highly useful")).toBeInTheDocument();
    expect(screen.getByLabelText("Problem recovery")).toHaveTextContent(
      "Crash-Volume Revenue Dependency",
    );
    expect(screen.getByLabelText("Problem recovery")).not.toHaveTextContent(
      "Accident-Economy Transition Ledger",
    );
    await userEvent.click(screen.getByRole("button", { name: "Doppls" }));
    expect(screen.getByLabelText("Doppl")).toHaveTextContent(
      "Accident-Economy Transition Ledger",
    );
    expect(screen.getByLabelText("Doppl")).not.toHaveTextContent(
      "Crash Substrate Exposure Map",
    );
    expect(
      screen.getByText(
        /Rate how useful this doppl is for understanding or solving the case/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Read the doppl")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Doppls are judged on whether they offer a useful finding, implication, or solution path.",
      ),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Problem recoveries" }),
    );
    expect(
      screen.getByLabelText("Case study: When the Crashes Don't Come"),
    ).toHaveTextContent("When the Crashes Don't Come");
    expect(
      screen.getByLabelText("Case study: When the Crashes Don't Come"),
    ).not.toHaveTextContent("Case Study:");
    expect(screen.queryByLabelText("Blind")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Include audit artifacts"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Current review status"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Vault")).not.toBeInTheDocument();
    expect(screen.queryByText("1 case")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Seeded representative artifact."),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("investigate")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Notes")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Next unrated" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Calibrator" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Submit problem recovery rating" }),
    ).toBeEnabled();
  });

  it("focuses the reading surface on only the selected artifact", async () => {
    render(<App />);
    await waitForReviewWorkspace();
    await userEvent.click(screen.getByRole("button", { name: "Doppls" }));

    expect(
      screen.queryByText("Parent Problem Recovery"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", {
        name: "Crash-Volume Revenue Dependency",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Accident-Economy Transition Ledger",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("The recovered problem is visible."),
    ).not.toBeInTheDocument();
  });

  it("summarizes an aGarden-backed index by rateable cases only", async () => {
    vi.mocked(fetch).mockImplementation(
      async (input: string | URL | Request) => {
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
      },
    );

    render(<App />);
    await waitForReviewWorkspace();
    expect(screen.queryByText("aGarden")).not.toBeInTheDocument();
    expect(screen.queryByText("1 case")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Case study")).not.toHaveTextContent(
      "Houston Baggage Claim Complaints",
    );
  });

  it("hides empty aGarden cases so reviewers only see rateable work", async () => {
    vi.mocked(fetch).mockImplementation(
      async (input: string | URL | Request) => {
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
      },
    );

    render(<App />);
    expect(await waitForReviewWorkspace()).toBeInTheDocument();
    expect(screen.getByLabelText("Case study")).toHaveValue(
      "fsd-accident-economy",
    );
    expect(screen.getByLabelText("Case study")).not.toHaveTextContent(
      "Houston Baggage Claim Complaints",
    );
    expect(screen.getByLabelText("Problem recovery")).toHaveTextContent(
      "Crash-Volume Revenue Dependency",
    );
  });

  it("gates the calibrator behind a valid reviewer email", async () => {
    window.localStorage.clear();
    render(<App />);
    const reviewerInput = await screen.findByLabelText("Reviewer email");
    expect(
      screen.queryByLabelText("Matching reviewers"),
    ).not.toBeInTheDocument();
    await userEvent.type(reviewerInput, "melissa");
    expect(
      screen.queryByLabelText("Matching reviewers"),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByLabelText("Reviewer email")).toBeInTheDocument();
    expect(
      screen.getByText("Enter a valid email address to continue."),
    ).toBeInTheDocument();
    await userEvent.clear(reviewerInput);
    await userEvent.type(reviewerInput, "outside@example.com");
    expect(
      screen.queryByText("Enter a valid email address to continue."),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await waitForReviewWorkspace()).toBeInTheDocument();
    expect(screen.queryByLabelText("Reviewer email")).not.toBeInTheDocument();
  });

  it("loads the previously selected rater from local storage", async () => {
    window.localStorage.setItem(
      "doppl-calibrator-reviewer-email",
      "cody.clayton@challenger.gauntletai.com",
    );
    render(<App />);
    await waitForReviewWorkspace();
    expect(screen.queryByLabelText("Reviewer email")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Log out" }));
    expect(screen.getByLabelText("Reviewer email")).toBeInTheDocument();
  });

  it("moves to the next unrated artifact after a successful submit", async () => {
    render(<App />);
    await waitForReviewWorkspace();
    expect(
      screen.getByRole("heading", { name: "Crash-Volume Revenue Dependency" }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Score/), {
      target: { value: "4" },
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Submit problem recovery rating" }),
    );
    await waitFor(() => {
      expect(
        screen.getByRole("heading", {
          name: "Accident-Economy Transition Ledger",
        }),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByRole("heading", {
        name: "Accident-Economy Transition Ledger",
      }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Doppl")).toHaveValue(
      "dalton-fsd-accident-economy-001__solution",
    );
  });

  it("shows the selected reviewer's existing rating and skips items they already rated", async () => {
    const personalizedFixture: CalibratorIndex = structuredClone(fixture);
    personalizedFixture.cases[0].problem_recoveries[1].human_ratings = [
      {
        rating_id: "rating_dalton_pr",
        rating_target: "problem_recovery",
        case_id: "fsd-accident-economy",
        problem_recovery_id:
          "dalton-fsd-accident-economy-001__problem_recovery",
        score: 3,
        reviewer_email: "dalton.dinderman@challenger.gauntletai.com",
        submitted_at: "2026-06-24T12:00:00.000Z",
        app_version: "calibrator-v0",
        body: "Useful.",
      },
    ];
    vi.mocked(fetch).mockImplementation(
      async (input: string | URL | Request) => {
        const url = input.toString();
        if (url === "/api/index")
          return new Response(JSON.stringify(personalizedFixture), {
            status: 200,
          });
        if (url === "/api/ratings")
          return new Response(JSON.stringify({ ratingId: "rating_test" }), {
            status: 201,
          });
        return new Response("not found", { status: 404 });
      },
    );

    render(<App />);
    await waitForReviewWorkspace();

    expect(
      screen.getByText("Your current rating for this item is 3."),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Score/), {
      target: { value: "3" },
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Update problem recovery rating" }),
    );
    await waitFor(() => {
      expect(
        screen.getByRole("heading", {
          name: "Accident-Economy Transition Ledger",
        }),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByRole("heading", {
        name: "Accident-Economy Transition Ledger",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("You have not rated this item yet."),
    ).toBeInTheDocument();
  });

  it("returns to a neutral score when switching to a reviewer who has not rated the artifact", async () => {
    window.localStorage.setItem(
      "doppl-calibrator-reviewer-email",
      "cody.clayton@challenger.gauntletai.com",
    );
    const personalizedFixture: CalibratorIndex = structuredClone(fixture);
    personalizedFixture.cases[0].problem_recoveries[1].human_ratings = [
      {
        rating_id: "rating_dalton_pr",
        rating_target: "problem_recovery",
        case_id: "fsd-accident-economy",
        problem_recovery_id:
          "dalton-fsd-accident-economy-001__problem_recovery",
        score: 3,
        reviewer_email: "dalton.dinderman@challenger.gauntletai.com",
        submitted_at: "2026-06-24T12:00:00.000Z",
        app_version: "calibrator-v0",
        body: "Useful.",
      },
    ];
    vi.mocked(fetch).mockImplementation(
      async (input: string | URL | Request) => {
        const url = input.toString();
        if (url === "/api/index")
          return new Response(JSON.stringify(personalizedFixture), {
            status: 200,
          });
        return new Response("not found", { status: 404 });
      },
    );

    render(<App />);
    await waitForReviewWorkspace();
    expect(
      screen.getByText("You have not rated this item yet."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Score/)).toHaveValue("5");
    expect(
      screen.getByRole("button", { name: "Submit problem recovery rating" }),
    ).toBeEnabled();
  });

  it("formats compressed aGarden artifact markdown as readable sections", async () => {
    render(<App />);
    await waitForReviewWorkspace();
    expect(screen.getByRole("heading", { name: "Trace" })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Growth — Problem recovery" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Claim Manual Underwriting Is Too Slow",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "FTC reports on algorithmic bias -> field: xai-frameworks",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/span class/)).not.toBeInTheDocument();
    for (const heading of screen.getAllByRole("heading")) {
      expect(heading.textContent).not.toContain("#");
    }
  });

  it("formats generated implications, opportunities, and sprouts as bullet lists", async () => {
    const listFixture: CalibratorIndex = structuredClone(fixture);
    listFixture.cases[0].solutions[0].body = [
      "# Mobility Financialization",
      "",
      "## Growth — Doppl",
      "",
      "Claim Usage-based autonomy pricing disrupts consumer lending models.",
      "",
      "Implications - auto loan default prediction models lose predictive validity without depreciation/collateral proxies - consumer lending shifts from asset-backed to behavior-based underwriting frameworks",
      "",
      "Opportunities - behavioral telemetry underwriting engines replacing FICO/credit bureau dependencies - credit scoring platform migrations targeting fleet operator payment streams",
      "",
      "Sprouts - real-time mobility payment stream securitization vehicles replacing auto-loan ABS markets - consumer credit model migration tools",
      "",
      "## Evaluation",
      "",
      "Novelty +4 78% of language absent from the seed.",
    ].join("\n");

    vi.mocked(fetch).mockImplementation(
      async (input: string | URL | Request) => {
        const url = input.toString();
        if (url === "/api/index")
          return new Response(JSON.stringify(listFixture), { status: 200 });
        return new Response("not found", { status: 404 });
      },
    );

    render(<App />);
    await waitForReviewWorkspace();
    await userEvent.click(screen.getByRole("button", { name: "Doppls" }));

    expect(
      screen.getByRole("heading", { name: "Implications:" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Auto Loan Default Prediction Models Lose Predictive Validity Without Depreciation/Collateral Proxies",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Consumer Lending Shifts From Asset-Backed To Behavior-Based Underwriting Frameworks",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Opportunities:" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Sprouts:" }),
    ).toBeInTheDocument();
  });

  it("formats compressed problem recovery fields as cards, emphasis, and lists", async () => {
    const problemFixture: CalibratorIndex = structuredClone(fixture);
    problemFixture.cases[0].problem_recoveries[1].node_id =
      "liquidity-bridge-via-mobility-backed-bonds-d3b01a15";
    problemFixture.cases[0].problem_recoveries[1].problem_recovery_id =
      "liquidity-bridge-via-mobility-backed-bonds-d3b01a15";
    problemFixture.cases[0].problem_recoveries[1].title =
      "Liquidity Bridge via Mobility-Backed Bonds";
    problemFixture.cases[0].problem_recoveries[1].body = [
      "# Liquidity Bridge via Mobility-Backed Bonds",
      "",
      "## Growth — Problem Recovery",
      "",
      "Surface Complaint Immediate Revenue Cliff Causes Service Cuts And Credit Downgrades Before Ruc Matures Deleted Assumption Revenue Replacement Must Be Immediate And Operationally Identical To Legacy Streams Hidden Variable Fiscal Transition Lags Create Liquidity Gaps That Markets Price As Insolvency Risk, Triggering Self-Fulfilling Credit Crises Actual Problem Municipalities Face A Timing Mismatch Between Revenue Collapse And Ruc Implementation, Triggering Market Panic And Borrowing Cost Spikes That Worsen The Fiscal Cliff Candidate Response Issue Automated-Mobility-Backed Municipal Bonds To Bridge The 3-Year Transition Gap, Repaid By Future Ruc Streams With Smart Contract Escrow",
      "",
      "Candidate Response",
      "This standalone candidate response should also stay hidden.",
      "",
      "Skin In The Game - Treasury Departments - Credit Rating Agencies - Av Investors - Bondholders Sprouts - Revenue Anticipation Notes Tied To Fleet Adoption Milestones - Smart Contract Payment Escrows - Credit Default Swaps For Mobility Risk Hedging",
    ].join("\n");

    vi.mocked(fetch).mockImplementation(
      async (input: string | URL | Request) => {
        const url = input.toString();
        if (url === "/api/index")
          return new Response(JSON.stringify(problemFixture), { status: 200 });
        return new Response("not found", { status: 404 });
      },
    );

    render(<App />);
    await waitForReviewWorkspace("Liquidity Bridge via Mobility-Backed Bonds");

    expect(
      screen.getByRole("heading", { name: "Surface complaint" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Deleted assumption" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Hidden variable" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Actual problem:" }),
    ).toBeInTheDocument();
    const actualProblemSection = screen
      .getByRole("heading", { name: "Actual problem:" })
      .closest("section");
    expect(actualProblemSection).not.toBeNull();
    expect(
      within(actualProblemSection as HTMLElement).getByText(
        /Municipalities Face A Timing Mismatch Between Revenue Collapse/i,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Candidate Response/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Automated-Mobility-Backed Municipal Bonds/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/standalone candidate response/i),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Skin in the Game:" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Treasury Departments")).toBeInTheDocument();
    expect(screen.getByText("Credit Rating Agencies")).toBeInTheDocument();
    expect(screen.getByText("AV Investors")).toBeInTheDocument();
    expect(screen.getByText("Bondholders")).toBeInTheDocument();
    expect(
      screen.getByText(
        /Which cash-flow forecast would show the gap between collapsing legacy revenue and future mobility-backed repayment/i,
      ),
    ).toBeInTheDocument();
  });

  it("shows trace but keeps discovery collapsed until opened", async () => {
    const discoveryFixture: CalibratorIndex = structuredClone(fixture);
    discoveryFixture.cases[0].problem_recoveries[1].body = [
      "# Crash-Volume Revenue Dependency",
      "",
      "TRACE",
      "Case study · Synopsis",
      "",
      "Crash frequency anchors the visible economics.",
      "",
      "DISCOVERY",
      "Finding 1",
      "",
      "Hidden discovery evidence should start collapsed.",
      "",
      "GROWTH — PROBLEM RECOVERY",
      "",
      "Actual Problem Crash revenue dependence creates transition risk.",
    ].join("\n");

    vi.mocked(fetch).mockImplementation(
      async (input: string | URL | Request) => {
        const url = input.toString();
        if (url === "/api/index")
          return new Response(JSON.stringify(discoveryFixture), {
            status: 200,
          });
        return new Response("not found", { status: 404 });
      },
    );

    render(<App />);
    await waitForReviewWorkspace();

    expect(
      screen.getByText("Crash frequency anchors the visible economics."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Hidden discovery evidence should start collapsed."),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Discovery +" }));

    expect(
      screen.getByText("Hidden discovery evidence should start collapsed."),
    ).toBeInTheDocument();
  });

  it("removes judge evaluation from the review surface", async () => {
    const evaluationFixture: CalibratorIndex = structuredClone(fixture);
    evaluationFixture.cases[0].solutions[0].body = [
      "# Mobility Financialization",
      "",
      "Claim Usage-based autonomy pricing disrupts consumer lending models.",
      "",
      "## Evaluation",
      "",
      "Novelty +4 78% of language absent from the seed.",
    ].join("\n");

    vi.mocked(fetch).mockImplementation(
      async (input: string | URL | Request) => {
        const url = input.toString();
        if (url === "/api/index")
          return new Response(JSON.stringify(evaluationFixture), {
            status: 200,
          });
        return new Response("not found", { status: 404 });
      },
    );

    render(<App />);
    await waitForReviewWorkspace();
    await userEvent.click(screen.getByRole("button", { name: "Doppls" }));

    expect(
      screen.queryByRole("button", { name: "Judge evaluation" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Novelty +4 78% of language absent from the seed."),
    ).not.toBeInTheDocument();
  });

  it("hides judge evaluation entirely for ordinary reviewers", async () => {
    window.localStorage.setItem(
      "doppl-calibrator-reviewer-email",
      "adam.foosaner@challenger.gauntletai.com",
    );
    const evaluationFixture: CalibratorIndex = structuredClone(fixture);
    evaluationFixture.cases[0].solutions[0].body = [
      "# Mobility Financialization",
      "",
      "Claim Usage-based autonomy pricing disrupts consumer lending models.",
      "",
      "## Evaluation",
      "",
      "Novelty +4 78% of language absent from the seed.",
    ].join("\n");

    vi.mocked(fetch).mockImplementation(
      async (input: string | URL | Request) => {
        const url = input.toString();
        if (url === "/api/index")
          return new Response(JSON.stringify(evaluationFixture), {
            status: 200,
          });
        return new Response("not found", { status: 404 });
      },
    );

    render(<App />);
    await waitForReviewWorkspace();
    await userEvent.click(screen.getByRole("button", { name: "Doppls" }));

    expect(
      screen.queryByRole("button", { name: "Judge evaluation" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Novelty +4 78% of language absent from the seed."),
    ).not.toBeInTheDocument();
  });

  it("collapses plain generated Evaluation labels by default", async () => {
    const evaluationFixture: CalibratorIndex = structuredClone(fixture);
    evaluationFixture.cases[0].solutions[0].body = [
      "# Frequency-to-Probability Underwriting Cliff",
      "",
      "Claim crash frequency drops below actuarial thresholds.",
      "",
      "Implications",
      "- Specialty auto captives must renegotiate treaty triggers or face insolvency - Traditional P&C insurers will misprice autonomy risk",
      "",
      "Evaluation",
      "",
      "Novelty +3",
      "",
      "73% of language absent from the seed; 3 dependency markers.",
    ].join("\n");

    vi.mocked(fetch).mockImplementation(
      async (input: string | URL | Request) => {
        const url = input.toString();
        if (url === "/api/index")
          return new Response(JSON.stringify(evaluationFixture), {
            status: 200,
          });
        return new Response("not found", { status: 404 });
      },
    );

    render(<App />);
    await waitForReviewWorkspace();
    await userEvent.click(screen.getByRole("button", { name: "Doppls" }));

    expect(
      screen.getByText(
        "Specialty Auto Captives Must Renegotiate Treaty Triggers Or Face Insolvency",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Traditional P&C Insurers Will Misprice Autonomy Risk"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Judge evaluation" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Novelty +3")).not.toBeInTheDocument();
  });

  it("collapses nested markdown Evaluation headings by default", async () => {
    const evaluationFixture: CalibratorIndex = structuredClone(fixture);
    evaluationFixture.cases[0].solutions[0].body = [
      "# Liability Inversion Protocol",
      "",
      "## Growth — Doppl",
      "### Claim",
      "Municipalities will shift from static depreciation accounting to dynamic liability escrows.",
      "### Implications",
      "- DOT budgets decouple from fuel-tax yields",
      "### Evaluation",
      "#### Novelty +3",
      "70% of language absent from the seed; 3 dependency markers.",
      "#### Grounding +3",
      "3 evidence item(s); 1 causal markers; 0 hedge(s).",
      "## Path",
      "next: null",
    ].join("\n");

    vi.mocked(fetch).mockImplementation(
      async (input: string | URL | Request) => {
        const url = input.toString();
        if (url === "/api/index")
          return new Response(JSON.stringify(evaluationFixture), {
            status: 200,
          });
        return new Response("not found", { status: 404 });
      },
    );

    render(<App />);
    await waitForReviewWorkspace();
    await userEvent.click(screen.getByRole("button", { name: "Doppls" }));

    expect(
      screen.getByText("Dot Budgets Decouple From Fuel-Tax Yields"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Judge evaluation" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/70% of language absent from the seed/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("next: null")).not.toBeInTheDocument();
  });

  it("keeps judge evaluation hidden when switching artifacts", async () => {
    const evaluationFixture: CalibratorIndex = structuredClone(fixture);
    evaluationFixture.cases[0].solutions[0].body = [
      "# Liability Inversion Protocol",
      "",
      "## Growth — Doppl",
      "### Claim",
      "First artifact body.",
      "### Evaluation",
      "#### Novelty +3",
      "First hidden evaluation.",
    ].join("\n");
    evaluationFixture.cases[0].solutions[1].source_status = "imported";
    evaluationFixture.cases[0].solutions[1].body = [
      "# Telemetry API Utility Billing",
      "",
      "## Growth — Doppl",
      "### Claim",
      "Second artifact body.",
      "### Evaluation",
      "#### Novelty +4",
      "Second hidden evaluation.",
    ].join("\n");

    vi.mocked(fetch).mockImplementation(
      async (input: string | URL | Request) => {
        const url = input.toString();
        if (url === "/api/index")
          return new Response(JSON.stringify(evaluationFixture), {
            status: 200,
          });
        return new Response("not found", { status: 404 });
      },
    );

    render(<App />);
    await waitForReviewWorkspace();
    await userEvent.click(screen.getByRole("button", { name: "Doppls" }));

    expect(
      screen.queryByRole("button", { name: "Judge evaluation" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/First Hidden Evaluation/),
    ).not.toBeInTheDocument();

    await userEvent.selectOptions(
      screen.getByLabelText("Doppl"),
      "cody-accident-economy-map",
    );

    expect(
      screen.queryByRole("button", { name: "Judge evaluation" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/First Hidden Evaluation/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Second Hidden Evaluation/),
    ).not.toBeInTheDocument();
  });

  it("collapses inline generated Evaluation labels by default", async () => {
    const evaluationFixture: CalibratorIndex = structuredClone(fixture);
    evaluationFixture.cases[0].solutions[0].body = [
      "# Frequency-to-Probability Underwriting Cliff",
      "",
      "Claim crash frequency drops below actuarial thresholds.",
      "",
      "Sprouts - real-time mobility payment stream securitization vehicles replacing auto-loan ABS markets - consumer credit model migration tools",
      "",
      "Evaluation Novelty +4 82% Of Language Absent From The Seed; 0 Dependency Markers. Grounding +3 3 Evidence Item(s); 1 Causal Markers; 0 Hedge(s). Falsifiability +3 Bridged From The Falsifiability Measurement (checkable Markers, Claims, Evidence). Cost-Efficiency +0 Judge-Only Axis — Defaults To 0 Under The Deterministic Bridge. Relevance +0 Judge-Only Axis — Defaults To 0 Under The Deterministic Bridge.",
    ].join("\n");

    vi.mocked(fetch).mockImplementation(
      async (input: string | URL | Request) => {
        const url = input.toString();
        if (url === "/api/index")
          return new Response(JSON.stringify(evaluationFixture), {
            status: 200,
          });
        return new Response("not found", { status: 404 });
      },
    );

    render(<App />);
    await waitForReviewWorkspace();
    await userEvent.click(screen.getByRole("button", { name: "Doppls" }));

    expect(
      screen.getByText(
        "Real-Time Mobility Payment Stream Securitization Vehicles Replacing Auto-Loan Abs Markets",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Judge evaluation" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/82% Of Language Absent From The Seed/i),
    ).not.toBeInTheDocument();
  });

  it("hydrates hosted ratings from the public aGarden ledger and switches to update mode", async () => {
    window.DOPPL_CALIBRATOR_CONFIG = {
      ratingsEndpoint: "https://ratings.example.test/api/agarden/ratings",
      ratingsLedgerUrl: "https://raw.example.test/ratings-ledger.json",
      requiresAccessCode: false,
    };
    vi.mocked(fetch).mockImplementation(
      async (input: string | URL | Request) => {
        const url = input.toString();
        if (url === "/api/index")
          return new Response("not found", { status: 404 });
        if (url.startsWith("calibration-index.json"))
          return new Response(JSON.stringify(fixture), { status: 200 });
        if (url.startsWith("https://raw.example.test/ratings-ledger.json")) {
          return new Response(
            JSON.stringify([
              {
                node_id: "dalton-fsd-accident-economy-001__problem_recovery",
                ratings: [
                  {
                    rater_id: "dalton.dinderman@challenger.gauntletai.com",
                    score: -2,
                    rate_date: "2026-06-25T16:00:00.000Z",
                  },
                ],
              },
            ]),
            { status: 200 },
          );
        }
        return new Response("not found", { status: 404 });
      },
    );

    render(<App />);
    await waitForReviewWorkspace();
    expect(
      screen.getByText("Your current rating for this item is -2."),
    ).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: /Score/ })).toHaveValue("0");
    expect(
      screen.getByRole("button", { name: "Update problem recovery rating" }),
    ).toBeInTheDocument();
  });

  it("does not show discovery context paragraphs in the rating workspace", async () => {
    vi.mocked(fetch).mockImplementation(
      async (input: string | URL | Request) => {
        const url = input.toString();
        if (url === "/api/index") {
          return new Response(
            JSON.stringify({
              ...fixture,
              cases: [
                {
                  ...fixture.cases[0],
                  body: "# Case\n\nShared paragraph.\n\nCase-only paragraph.",
                  problem: {
                    body: "Shared paragraph.\n\nProblem-only paragraph.",
                    source: "case-study",
                  },
                },
              ],
            }),
            { status: 200 },
          );
        }
        return new Response("not found", { status: 404 });
      },
    );

    render(<App />);
    await waitForReviewWorkspace();
    expect(screen.queryByText("Shared paragraph.")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Problem-only paragraph."),
    ).not.toBeInTheDocument();
  });

  it("does not show case study context sections in the rating workspace", async () => {
    vi.mocked(fetch).mockImplementation(
      async (input: string | URL | Request) => {
        const url = input.toString();
        if (url === "/api/index") {
          return new Response(
            JSON.stringify({
              ...fixture,
              cases: [
                {
                  ...fixture.cases[0],
                  body: "# When the Crashes Don't Come\n\n## Context\n\nContext body.\n\n## The Situation\n\nSituation body.\n\n## Decision Point\n\nDecision body.\n\n## Synopsis\n\nSynopsis body.",
                },
              ],
            }),
            { status: 200 },
          );
        }
        return new Response("not found", { status: 404 });
      },
    );

    render(<App />);
    await waitForReviewWorkspace();
    expect(
      screen.queryByRole("button", { name: "Context" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "The Situation" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Decision Point" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Synopsis" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Context body.")).not.toBeInTheDocument();
  });

  it("submits a rating through the configured endpoint", async () => {
    const fetchMock = vi.mocked(fetch);
    render(<App />);
    await waitForReviewWorkspace();
    await userEvent.click(screen.getByRole("button", { name: "Doppls" }));
    await userEvent.selectOptions(
      screen.getByLabelText("Doppl"),
      "dalton-fsd-accident-economy-001__solution",
    );
    fireEvent.change(screen.getByLabelText(/Score/), {
      target: { value: "4" },
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Submit doppl rating" }),
    );
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/ratings",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"rating_target":"solution"'),
        }),
      );
    });
  });

  it("submits a problem recovery rating payload", async () => {
    const fetchMock = vi.mocked(fetch);
    render(<App />);
    await waitForReviewWorkspace();
    await userEvent.selectOptions(
      screen.getByLabelText("Problem recovery"),
      "dalton-fsd-accident-economy-001__problem_recovery",
    );
    expect(
      screen.getByRole("heading", { name: "Crash-Volume Revenue Dependency" }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Score/), {
      target: { value: "4" },
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Submit problem recovery rating" }),
    );
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
        body: expect.stringContaining(
          '"problem_recovery_id":"dalton-fsd-accident-economy-001__problem_recovery"',
        ),
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
    fetchMock.mockImplementation(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = input.toString();
        if (url === "/api/index")
          return new Response(JSON.stringify(agardenFixture), { status: 200 });
        if (url === "/api/ratings" && init?.method === "POST") {
          return new Response(
            JSON.stringify({
              ratingId: "node-pr:dalton",
              relativePath: "ratings-ledger.json",
              scores: { human: 4, n: 1 },
            }),
            { status: 201 },
          );
        }
        return new Response("not found", { status: 404 });
      },
    );

    render(<App />);
    await waitForReviewWorkspace("Problem Recovery");
    fireEvent.change(screen.getByLabelText(/Score/), {
      target: { value: "4" },
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Submit problem recovery rating" }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/ratings",
        expect.objectContaining({
          body: expect.stringContaining('"node_id":"node-pr"'),
        }),
      );
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/ratings",
      expect.objectContaining({
        body: expect.stringContaining('"node_id":"node-pr"'),
      }),
    );
  });

  it("falls back to the static index in read-only preview mode", async () => {
    vi.mocked(fetch).mockImplementation(
      async (input: string | URL | Request) => {
        const url = input.toString();
        if (url === "/api/index") {
          return new Response("not found", { status: 404 });
        }
        if (url.startsWith("calibration-index.json")) {
          return new Response(JSON.stringify(fixture), { status: 200 });
        }
        return new Response("not found", { status: 404 });
      },
    );

    render(<App />);
    expect(await waitForReviewWorkspace()).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Doppls" }));
    await userEvent.selectOptions(
      screen.getByLabelText("Doppl"),
      "dalton-fsd-accident-economy-001__solution",
    );
    fireEvent.change(screen.getByLabelText(/Score/), {
      target: { value: "4" },
    });
    expect(
      screen.getByRole("button", { name: "Submit doppl rating" }),
    ).toBeDisabled();
    expect(
      screen.getByText(
        "Rating writes require the local dev server or hosted ratings API.",
      ),
    ).toBeInTheDocument();
  });

  it("submits through the hosted ratings endpoint without a reviewer access code when configured", async () => {
    window.DOPPL_CALIBRATOR_CONFIG = {
      ratingsEndpoint: "https://ratings.example.test/api/agarden/ratings",
      requiresAccessCode: false,
    };
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = input.toString();
        if (url === "/api/index") {
          return new Response("not found", { status: 404 });
        }
        if (url.startsWith("calibration-index.json")) {
          return new Response(JSON.stringify(fixture), { status: 200 });
        }
        if (
          url === "https://ratings.example.test/api/agarden/ratings" &&
          init?.method === "POST"
        ) {
          return new Response(
            JSON.stringify({
              ratingId: "hosted-rating",
              relativePath: "ratings-ledger.json",
            }),
            { status: 201 },
          );
        }
        return new Response("not found", { status: 404 });
      },
    );

    render(<App />);
    await waitForReviewWorkspace();
    expect(screen.queryByLabelText("Access code")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Score/), {
      target: { value: "4" },
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Submit problem recovery rating" }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "https://ratings.example.test/api/agarden/ratings",
        expect.objectContaining({
          method: "POST",
        }),
      );
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://ratings.example.test/api/agarden/ratings",
      expect.objectContaining({
        method: "POST",
        headers: expect.not.objectContaining({
          authorization: expect.any(String),
        }),
      }),
    );
  });

  it("keeps the current queue and advances after submit when hosted index refresh is stale", async () => {
    window.DOPPL_CALIBRATOR_CONFIG = {
      ratingsEndpoint: "https://ratings.example.test/api/agarden/ratings",
      requiresAccessCode: false,
    };
    const staleIndex: CalibratorIndex = {
      ...fixture,
      cases: [],
    };
    let staticIndexReads = 0;
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = input.toString();
        if (url === "/api/index") {
          return new Response("not found", { status: 404 });
        }
        if (url.startsWith("calibration-index.json")) {
          staticIndexReads += 1;
          return new Response(
            JSON.stringify(staticIndexReads === 1 ? fixture : staleIndex),
            { status: 200 },
          );
        }
        if (
          url === "https://ratings.example.test/api/agarden/ratings" &&
          init?.method === "POST"
        ) {
          return new Response(
            JSON.stringify({
              ratingId: "hosted-rating",
              relativePath: "ratings-ledger.json",
            }),
            { status: 201 },
          );
        }
        return new Response("not found", { status: 404 });
      },
    );

    render(<App />);
    await waitForReviewWorkspace();
    fireEvent.change(screen.getByLabelText(/Score/), {
      target: { value: "8" },
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Submit problem recovery rating" }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole("heading", {
          name: "Accident-Economy Transition Ledger",
        }),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByText("No rateable problem recoveries or doppls are available."),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Doppl")).toHaveValue(
      "dalton-fsd-accident-economy-001__solution",
    );
  });

  it("can still require a hosted access code when configured for a gated deployment", async () => {
    window.DOPPL_CALIBRATOR_CONFIG = {
      ratingsEndpoint: "https://ratings.example.test/api/agarden/ratings",
      requiresAccessCode: true,
    };
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = input.toString();
        if (url === "/api/index") {
          return new Response("not found", { status: 404 });
        }
        if (url.startsWith("calibration-index.json")) {
          return new Response(JSON.stringify(fixture), { status: 200 });
        }
        if (
          url === "https://ratings.example.test/api/agarden/ratings" &&
          init?.method === "POST"
        ) {
          return new Response(
            JSON.stringify({
              ratingId: "hosted-rating",
              relativePath: "ratings-ledger.json",
            }),
            {
              status: 201,
            },
          );
        }
        return new Response("not found", { status: 404 });
      },
    );

    render(<App />);
    await waitForReviewWorkspace();
    fireEvent.change(screen.getByLabelText(/Score/), {
      target: { value: "4" },
    });
    expect(
      screen.getByRole("button", { name: "Submit problem recovery rating" }),
    ).toBeDisabled();
    await userEvent.type(
      screen.getByLabelText("Access code"),
      "review-session-secret",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Submit problem recovery rating" }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "https://ratings.example.test/api/agarden/ratings",
        expect.objectContaining({
          method: "POST",
        }),
      );
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://ratings.example.test/api/agarden/ratings",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer review-session-secret",
        }),
      }),
    );
  });

  it("keeps source details collapsed behind one toggle", async () => {
    render(<App />);
    await waitForReviewWorkspace();
    await userEvent.click(screen.getByRole("button", { name: "Doppls" }));
    await userEvent.selectOptions(
      screen.getByLabelText("Doppl"),
      "dalton-fsd-accident-economy-001__solution",
    );
    expect(
      (await screen.findAllByText("Accident-Economy Transition Ledger")).length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByLabelText("Comparison set provenance"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("source status")).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Show source details +" }),
    );
    expect(screen.getByText("source status")).toBeInTheDocument();
    expect(screen.getByText("imported")).toBeInTheDocument();
    expect(
      screen.queryByText(
        "Audit-only artifacts are visible for provenance but are not rateable.",
      ),
    ).not.toBeInTheDocument();
  });

  it("keeps artifact labels visible without blind review mode", async () => {
    render(<App />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Doppls" }),
    );
    await userEvent.selectOptions(
      await screen.findByLabelText("Doppl"),
      "dalton-fsd-accident-economy-001__solution",
    );
    expect(
      (await screen.findAllByText("Accident-Economy Transition Ledger")).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByLabelText("Blind")).not.toBeInTheDocument();
    expect(screen.queryByText("Doppl A")).not.toBeInTheDocument();
    expect(screen.queryByText("source status")).not.toBeInTheDocument();
  });
});
