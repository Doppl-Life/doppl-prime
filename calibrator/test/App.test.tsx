import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import type { CalibratorIndex } from "../src/types";

const fixture: CalibratorIndex = {
  generated_at: "2026-06-22T00:00:00.000Z",
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
          body: "# Imported recovered problem body",
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
    expect(screen.getByLabelText("Review artifact")).toHaveTextContent("Crash-Volume Revenue Dependency");
    expect(screen.getByLabelText("Review artifact")).toHaveTextContent("Accident-Economy Transition Ledger");
    expect(screen.getByLabelText("Review artifact")).not.toHaveTextContent("Crash Substrate Exposure Map");
    expect(screen.getByLabelText("Case and selected artifact review")).toHaveTextContent("Case Study");
    expect(screen.getByLabelText("Case and selected artifact review")).toHaveTextContent("Stated Context");
    expect(screen.queryByText("Seeded representative artifact.")).not.toBeInTheDocument();
    expect(screen.queryByText("investigate")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit problem rating" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Score/), { target: { value: "4" } });
    expect(screen.getByRole("button", { name: "Submit problem rating" })).toBeEnabled();
  });

  it("moves to the next unrated artifact in the review queue", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: "When the Crashes Don't Come" });
    expect(screen.getByRole("heading", { name: "Crash-Volume Revenue Dependency" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Next unrated" }));
    expect(screen.getByRole("heading", { name: "Accident-Economy Transition Ledger" })).toBeInTheDocument();
    expect(screen.getByLabelText("Review artifact")).toHaveValue(
      "solution:dalton-fsd-accident-economy-001__solution",
    );
  });

  it("submits a rating and shows the saved path", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: "When the Crashes Don't Come" });
    await userEvent.selectOptions(
      screen.getByLabelText("Review artifact"),
      "solution:dalton-fsd-accident-economy-001__solution",
    );
    fireEvent.change(screen.getByLabelText(/Score/), { target: { value: "4" } });
    await userEvent.type(screen.getByLabelText("Notes"), "Useful solution.");
    await userEvent.click(screen.getByRole("button", { name: "Submit solution rating" }));
    await waitFor(() => {
      expect(screen.getByText(/rating_test.md/)).toBeInTheDocument();
    });
  });

  it("submits a problem recovery rating payload", async () => {
    const fetchMock = vi.mocked(fetch);
    render(<App />);
    await screen.findByRole("heading", { name: "When the Crashes Don't Come" });
    await userEvent.selectOptions(
      screen.getByLabelText("Review artifact"),
      "problem_recovery:dalton-fsd-accident-economy-001__problem_recovery",
    );
    expect(screen.getByText("Crash-Volume Revenue Dependency")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Score/), { target: { value: "4" } });
    await userEvent.click(screen.getByRole("button", { name: "Submit problem rating" }));
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
    await userEvent.selectOptions(
      screen.getByLabelText("Review artifact"),
      "solution:dalton-fsd-accident-economy-001__solution",
    );
    fireEvent.change(screen.getByLabelText(/Score/), { target: { value: "4" } });
    expect(screen.getByRole("button", { name: "Submit solution rating" })).toBeDisabled();
    expect(screen.getByText("Rating writes require the local dev server.")).toBeInTheDocument();
  });

  it("keeps source details collapsed behind one toggle", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: "When the Crashes Don't Come" });
    await userEvent.click(screen.getByLabelText("Include audit artifacts"));
    await userEvent.selectOptions(screen.getByLabelText("Review artifact"), "solution:cody-accident-economy-map");
    expect((await screen.findAllByText("Crash Substrate Exposure Map")).length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("Comparison set provenance")).not.toBeInTheDocument();
    expect(screen.queryByText("source status")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show source details +" }));
    expect(screen.getByLabelText("Comparison set provenance")).toHaveTextContent(
      "FSD Accident Economy Kernel Comparison v0",
    );
    expect(screen.getByLabelText("Comparison set provenance")).toHaveTextContent("fixture only");
    expect(screen.getByText("Seeded representative artifact.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Score/), { target: { value: "4" } });
    expect(screen.getByRole("button", { name: "Submit solution rating" })).toBeDisabled();
    expect(screen.getByText("Audit-only artifacts are visible for provenance but are not rateable.")).toBeInTheDocument();
  });

  it("masks source labels in blind review mode", async () => {
    render(<App />);
    await userEvent.selectOptions(
      await screen.findByLabelText("Review artifact"),
      "solution:dalton-fsd-accident-economy-001__solution",
    );
    expect((await screen.findAllByText("Accident-Economy Transition Ledger")).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByLabelText("Blind"));
    expect(screen.getAllByText("Solution A").length).toBeGreaterThan(0);
    expect(screen.queryByText("Accident-Economy Transition Ledger")).not.toBeInTheDocument();
    expect(screen.queryByText("source status")).not.toBeInTheDocument();
    expect(screen.getByText("Source labels, branch names, and provenance metadata are hidden.")).toBeInTheDocument();
  });
});
