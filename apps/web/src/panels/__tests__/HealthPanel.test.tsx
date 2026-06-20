import { screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { initialRunStoreState } from "../../state/reducer.js";
import { makeStubClient, renderWithStore } from "../../test-utils/render.js";
import { HealthPanel } from "../HealthPanel.js";

describe("HealthPanel", () => {
  test("renders nothing when no runId is set", () => {
    const { container } = renderWithStore(<HealthPanel />);
    expect(container.querySelector("section")).toBeNull();
  });

  test("stale heartbeat surfaces 'consider fallback' banner (PD.6)", async () => {
    const client = makeStubClient({
      getHealth: vi.fn(async () => ({
        runId: "r1",
        status: "running" as const,
        currentGeneration: 2,
        candidatesInFlight: 1,
        lastEventOccurredAt: new Date().toISOString(),
        capsConsumed: { energy: 100, generations: 2, candidates: 5, toolCalls: 10 },
        lastHeartbeatMs: 12_000, // > 10s threshold
      })),
    });
    renderWithStore(<HealthPanel />, {
      client,
      initialState: { ...initialRunStoreState, runId: "r1", serverRunMode: "live" },
    });
    await waitFor(() => {
      expect(screen.getByTestId("health-consider-fallback")).toBeInTheDocument();
    });
  });

  test("fresh heartbeat shows no fallback banner", async () => {
    const client = makeStubClient({
      getHealth: vi.fn(async () => ({
        runId: "r2",
        status: "running" as const,
        currentGeneration: 1,
        candidatesInFlight: 1,
        lastEventOccurredAt: new Date().toISOString(),
        capsConsumed: { energy: 0, generations: 1, candidates: 1, toolCalls: 0 },
        lastHeartbeatMs: 500,
      })),
    });
    renderWithStore(<HealthPanel />, {
      client,
      initialState: { ...initialRunStoreState, runId: "r2", serverRunMode: "live" },
    });
    await waitFor(() => {
      expect(screen.getByText(/Run health/)).toBeInTheDocument();
    });
    expect(screen.queryByTestId("health-consider-fallback")).toBeNull();
  });

  test("replay-mode runs suppress the fallback hint", async () => {
    const client = makeStubClient({
      getHealth: vi.fn(async () => ({
        runId: "r3",
        status: "running" as const,
        currentGeneration: 1,
        candidatesInFlight: 0,
        lastEventOccurredAt: new Date().toISOString(),
        capsConsumed: { energy: 0, generations: 1, candidates: 1, toolCalls: 0 },
        lastHeartbeatMs: 30_000,
      })),
    });
    renderWithStore(<HealthPanel />, {
      client,
      initialState: { ...initialRunStoreState, runId: "r3", serverRunMode: "replay" },
    });
    await waitFor(() => {
      expect(screen.getByText(/Run health/)).toBeInTheDocument();
    });
    expect(screen.queryByTestId("health-consider-fallback")).toBeNull();
  });
});
