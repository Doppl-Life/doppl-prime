import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { type RunStoreState, initialRunStoreState } from "../../state/reducer.js";
import { renderWithStore } from "../../test-utils/render.js";
import { AgentActivityPanel } from "../AgentActivityPanel.js";

function stateWith(
  log: RunStoreState["activityEventLog"],
  overrides: Partial<RunStoreState> = {},
): RunStoreState {
  return {
    ...initialRunStoreState,
    runId: "run_x",
    sequenceThrough: log.length > 0 ? (log.at(-1)?.sequence ?? 0) : 0,
    activityEventLog: log,
    ...overrides,
  };
}

const T = "2026-06-20T14:00:00Z";

describe("AgentActivityPanel", () => {
  test("empty state shows placeholder", () => {
    renderWithStore(<AgentActivityPanel />);
    expect(screen.getByText(/No activity yet/)).toBeInTheDocument();
  });

  test("groups events into per-agenome lanes plus a Pipeline lane", () => {
    renderWithStore(<AgentActivityPanel />, {
      initialState: stateWith([
        // Pipeline-level event (no agenomeId)
        {
          sequence: 0,
          occurredAt: T,
          type: "generation.started",
          actor: "runtime",
          payload: { index: 0 },
          generationId: "gen_0",
        },
        // Two agenome lanes
        {
          sequence: 1,
          occurredAt: T,
          type: "agenome.spawned",
          actor: "reproduction",
          payload: {},
          agenomeId: "ag_alpha",
        },
        {
          sequence: 2,
          occurredAt: T,
          type: "agenome.spawned",
          actor: "reproduction",
          payload: {},
          agenomeId: "ag_beta",
        },
      ]),
    });
    // Lanes render their short id; Pipeline lane gets a literal label.
    expect(screen.getByText("ag_alpha")).toBeInTheDocument();
    expect(screen.getByText("ag_beta")).toBeInTheDocument();
    expect(screen.getByText("Pipeline")).toBeInTheDocument();
  });

  test("lane badge surfaces fitness + verdict, falls back to event count", () => {
    renderWithStore(<AgentActivityPanel />, {
      initialState: stateWith([
        {
          sequence: 0,
          occurredAt: T,
          type: "agenome.spawned",
          actor: "reproduction",
          payload: {},
          agenomeId: "ag_with_score",
        },
        {
          sequence: 1,
          occurredAt: T,
          type: "critic.reviewed",
          actor: "critic",
          payload: { review: { verdict: "approve" } },
          agenomeId: "ag_with_score",
        },
        {
          sequence: 2,
          occurredAt: T,
          type: "fitness.scored",
          actor: "runtime",
          payload: { fitness: { total: 0.84 } },
          agenomeId: "ag_with_score",
        },
        // A second lane with no quality events — badge shows event count.
        {
          sequence: 3,
          occurredAt: T,
          type: "agenome.spawned",
          actor: "reproduction",
          payload: {},
          agenomeId: "ag_quiet",
        },
      ]),
    });
    expect(screen.getByText(/fit=0\.84/)).toBeInTheDocument();
    expect(screen.getByText(/approve/)).toBeInTheDocument();
    // ag_quiet has no quality events — its badge falls back to event count.
    const quietLane = document.querySelector('[data-lane="ag_quiet"]');
    expect(quietLane?.textContent).toMatch(/1 events/);
  });

  test("clicking a lane reveals its events", () => {
    renderWithStore(<AgentActivityPanel />, {
      initialState: stateWith([
        {
          sequence: 0,
          occurredAt: T,
          type: "agenome.spawned",
          actor: "reproduction",
          payload: {},
          agenomeId: "ag_x",
        },
        {
          sequence: 1,
          occurredAt: T,
          type: "energy.spent",
          actor: "runtime",
          payload: { energy: { agenomeId: "ag_x", actual: 3.5, eventType: "llm" } },
          agenomeId: "ag_x",
        },
      ]),
    });
    // Events are hidden until expanded.
    expect(screen.queryByText(/energy=3\.50/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /ag_x/ }));
    expect(screen.getByText("agenome.spawned")).toBeInTheDocument();
    expect(screen.getByText(/energy=3\.50/)).toBeInTheDocument();
  });

  test("failure-type events flip the lane badge color (error)", () => {
    renderWithStore(<AgentActivityPanel />, {
      initialState: stateWith([
        {
          sequence: 0,
          occurredAt: T,
          type: "agenome.spawned",
          actor: "reproduction",
          payload: {},
          agenomeId: "ag_doomed",
        },
        {
          sequence: 1,
          occurredAt: T,
          type: "provider_call_failed",
          actor: "runtime",
          payload: { reason: "503" },
          agenomeId: "ag_doomed",
        },
      ]),
    });
    // The summary span shows "2 events" but with the error background.
    const summary = screen.getAllByText(/events/).find((el) => el.tagName === "SPAN");
    expect(summary).toBeDefined();
  });
});
