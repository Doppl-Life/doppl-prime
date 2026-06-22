import { cleanup, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import type { CalibratorIndex } from "../src/types";

const fixture: CalibratorIndex = {
  generated_at: "2026-06-22T00:00:00.000Z",
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
          kernel: "cody",
          body: "# Solution body",
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
});
