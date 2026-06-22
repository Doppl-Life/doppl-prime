import { cleanup, render, screen, waitFor } from "@testing-library/react";
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
      solutions: [
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

  it("loads the case and disables submit until score is selected", async () => {
    render(<App />);
    expect(await screen.findByRole("heading", { name: "When the Crashes Don't Come" })).toBeInTheDocument();
    expect(screen.getByLabelText("Comparison set provenance")).toHaveTextContent(
      "FSD Accident Economy Kernel Comparison v0",
    );
    expect(screen.getByLabelText("Comparison set provenance")).toHaveTextContent("fixture only");
    expect(screen.getByText("Seeded representative artifact.")).toBeInTheDocument();
    expect(screen.getByLabelText("Human calibration history")).toHaveTextContent("Human avg");
    expect(screen.getByLabelText("Human calibration history")).toHaveTextContent("+4");
    expect(screen.getByLabelText("Human calibration history")).toHaveTextContent("investigate 1");
    expect(screen.getByRole("button", { name: "Submit rating" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "+4" }));
    expect(screen.getByRole("button", { name: "Submit rating" })).toBeEnabled();
  });

  it("submits a rating and shows the saved path", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: "When the Crashes Don't Come" });
    await userEvent.click(screen.getByRole("button", { name: "+4" }));
    await userEvent.click(screen.getByRole("button", { name: "investigate" }));
    await userEvent.type(screen.getByLabelText("Notes"), "Useful solution.");
    await userEvent.click(screen.getByRole("button", { name: "Submit rating" }));
    await waitFor(() => {
      expect(screen.getByText(/rating_test.md/)).toBeInTheDocument();
    });
  });

  it("falls back to the static index in read-only preview mode", async () => {
    vi.mocked(fetch).mockImplementation(async (input: string | URL | Request) => {
      const url = input.toString();
      if (url === "/api/index") {
        return new Response("not found", { status: 404 });
      }
      if (url === "calibration-index.json") {
        return new Response(JSON.stringify(fixture), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    });

    render(<App />);
    expect(await screen.findByRole("heading", { name: "When the Crashes Don't Come" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "+4" }));
    expect(screen.getByRole("button", { name: "Submit rating" })).toBeDisabled();
    expect(screen.getByText("Rating writes require the local dev server.")).toBeInTheDocument();
  });

  it("filters solutions by source status", async () => {
    render(<App />);
    expect((await screen.findAllByText("Crash Substrate Exposure Map")).length).toBeGreaterThan(0);
    await userEvent.selectOptions(screen.getByLabelText("Source status"), "pending");
    expect(screen.queryByText("Crash Substrate Exposure Map")).not.toBeInTheDocument();
    expect(screen.getAllByText("Michael Branch Pending Solution").length).toBeGreaterThan(0);
    await userEvent.selectOptions(screen.getByLabelText("Source status"), "live_run");
    expect(screen.getByText("No solutions match this filter.")).toBeInTheDocument();
  });
});
