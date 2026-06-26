import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { makeStubClient, renderWithStore } from "../../test-utils/render.js";
import { OperatorPromptPanel } from "../OperatorPromptPanel.js";

const CURATED = [
  { id: "cross-domain-transfer", title: "Cross-domain transfer", subtype: "cross_domain_transfer" },
  { id: "zeitgeist-synthesis", title: "Zeitgeist synthesis", subtype: "zeitgeist_synthesis" },
];

describe("OperatorPromptPanel", () => {
  test("prepared mode: dropdown populated, submit posts problemId", async () => {
    const startDemoLive = vi.fn(async () => ({
      runId: "run-1",
      runMode: "live" as const,
      warnings: [],
      source: "prepared" as const,
    }));
    const client = makeStubClient({ startDemoLive });
    renderWithStore(<OperatorPromptPanel initialPrompts={CURATED} />, { client });

    expect(screen.getByLabelText("Curated problem")).toHaveValue("cross-domain-transfer");
    fireEvent.click(screen.getByLabelText("Start demo run"));
    await waitFor(() => {
      expect(startDemoLive).toHaveBeenCalledWith({ problemId: "cross-domain-transfer" });
    });
  });

  test("operator mode: textarea + submit posts operatorPrompt", async () => {
    const startDemoLive = vi.fn(async () => ({
      runId: "run-2",
      runMode: "live" as const,
      warnings: [],
      source: "operator" as const,
    }));
    const client = makeStubClient({ startDemoLive });
    renderWithStore(<OperatorPromptPanel initialPrompts={CURATED} />, { client });

    fireEvent.click(screen.getByLabelText(/Custom prompt/));
    fireEvent.change(screen.getByLabelText("Operator prompt"), {
      target: { value: "A novel approach" },
    });
    fireEvent.click(screen.getByLabelText("Start demo run"));
    await waitFor(() => {
      expect(startDemoLive).toHaveBeenCalledWith({ operatorPrompt: "A novel approach" });
    });
  });

  test("empty custom prompt: submit button disabled", async () => {
    const startDemoLive = vi.fn(async () => ({
      runId: "x",
      runMode: "live" as const,
      warnings: [],
      source: "operator" as const,
    }));
    const client = makeStubClient({ startDemoLive });
    renderWithStore(<OperatorPromptPanel initialPrompts={CURATED} />, { client });

    fireEvent.click(screen.getByLabelText(/Custom prompt/));
    expect(screen.getByLabelText("Start demo run")).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Operator prompt"), { target: { value: "   " } });
    expect(screen.getByLabelText("Start demo run")).toBeDisabled();
    expect(startDemoLive).not.toHaveBeenCalled();
  });

  test("cap-override values flow into the request body", async () => {
    const startDemoLive = vi.fn(async () => ({
      runId: "run-cap",
      runMode: "live" as const,
      warnings: [],
      source: "prepared" as const,
    }));
    const client = makeStubClient({ startDemoLive });
    renderWithStore(<OperatorPromptPanel initialPrompts={CURATED} />, { client });

    fireEvent.change(screen.getByLabelText("maxPopulation override"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("maxGenerations override"), { target: { value: "3" } });
    fireEvent.click(screen.getByLabelText("Start demo run"));
    await waitFor(() => {
      expect(startDemoLive).toHaveBeenCalledWith({
        problemId: "cross-domain-transfer",
        capOverride: { maxPopulation: 4, maxGenerations: 3 },
      });
    });
  });
});
