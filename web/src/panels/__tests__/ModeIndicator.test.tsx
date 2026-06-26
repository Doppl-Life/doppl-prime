import { screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { initialRunStoreState } from "../../state/reducer.js";
import { renderWithStore } from "../../test-utils/render.js";
import { ModeIndicator } from "../ModeIndicator.js";

describe("ModeIndicator", () => {
  test("idle mode shows IDLE badge + helpful subtext", () => {
    renderWithStore(<ModeIndicator />, {
      initialState: { ...initialRunStoreState, mode: "idle" },
    });
    expect(screen.getByText(/IDLE/)).toBeInTheDocument();
    expect(screen.getByText(/Configure a run/)).toBeInTheDocument();
  });

  test("live mode shows LIVE badge", () => {
    renderWithStore(<ModeIndicator />, {
      initialState: { ...initialRunStoreState, mode: "live" },
    });
    expect(screen.getByText("LIVE")).toBeInTheDocument();
  });

  test("polling mode shows DEGRADED badge + subtext", () => {
    renderWithStore(<ModeIndicator />, {
      initialState: { ...initialRunStoreState, mode: "polling" },
    });
    expect(screen.getByText(/DEGRADED/)).toBeInTheDocument();
    expect(screen.getByText(/SSE unavailable/)).toBeInTheDocument();
  });

  test("replay mode shows REPLAY + 'original timestamps' subtext", () => {
    renderWithStore(<ModeIndicator />, {
      initialState: { ...initialRunStoreState, mode: "replay" },
    });
    expect(screen.getByText("REPLAY")).toBeInTheDocument();
    expect(screen.getByText(/original timestamps/)).toBeInTheDocument();
  });

  test("serverRunMode='replay' wins over local mode='live' (PD.6)", () => {
    renderWithStore(<ModeIndicator />, {
      initialState: {
        ...initialRunStoreState,
        mode: "live",
        serverRunMode: "replay",
      },
    });
    expect(screen.getByText("REPLAY")).toBeInTheDocument();
    expect(screen.getByText(/fallback rung active/)).toBeInTheDocument();
  });

  test("serverRunMode='rehearsal' surfaces rehearsal subtext", () => {
    renderWithStore(<ModeIndicator />, {
      initialState: {
        ...initialRunStoreState,
        mode: "live",
        serverRunMode: "rehearsal",
      },
    });
    expect(screen.getByText(/rehearsal-recorded/)).toBeInTheDocument();
  });
});
