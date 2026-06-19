import { describe, expect, test } from "vitest";
import { IllegalTransitionError } from "../errors.js";
import { RunStateMachine } from "../run.js";

describe("RunStateMachine — closed transitions per ARCHITECTURE.md §3", () => {
  test("legal transitions form a snapshot-stable set", () => {
    const legal: Array<[string, string]> = [];
    for (const from of [
      "configured",
      "running",
      "completing",
      "completed",
      "stopping",
      "stopped",
      "failed",
      "cancelled",
    ] as const) {
      for (const to of [
        "configured",
        "running",
        "completing",
        "completed",
        "stopping",
        "stopped",
        "failed",
        "cancelled",
      ] as const) {
        if (RunStateMachine.canTransition(from, to)) {
          legal.push([from, to]);
        }
      }
    }
    expect(legal).toMatchInlineSnapshot(`
      [
        [
          "configured",
          "running",
        ],
        [
          "configured",
          "cancelled",
        ],
        [
          "running",
          "completing",
        ],
        [
          "running",
          "stopping",
        ],
        [
          "running",
          "failed",
        ],
        [
          "completing",
          "completed",
        ],
        [
          "stopping",
          "stopped",
        ],
      ]
    `);
  });

  test("terminalStates is the closed 4-member sink set", () => {
    expect([...RunStateMachine.terminalStates].sort()).toMatchInlineSnapshot(`
      [
        "cancelled",
        "completed",
        "failed",
        "stopped",
      ]
    `);
  });

  test("isTerminal returns true for every terminal state and false for non-terminal", () => {
    expect(RunStateMachine.isTerminal("completed")).toBe(true);
    expect(RunStateMachine.isTerminal("stopped")).toBe(true);
    expect(RunStateMachine.isTerminal("failed")).toBe(true);
    expect(RunStateMachine.isTerminal("cancelled")).toBe(true);
    expect(RunStateMachine.isTerminal("running")).toBe(false);
    expect(RunStateMachine.isTerminal("configured")).toBe(false);
  });

  test("canTransition out of a terminal state is always false", () => {
    for (const terminal of RunStateMachine.terminalStates) {
      for (const target of ["configured", "running", "completing", "stopping"] as const) {
        expect(RunStateMachine.canTransition(terminal, target)).toBe(false);
      }
    }
  });

  test("transition('configured', 'running') returns the next state", () => {
    expect(RunStateMachine.transition("configured", "running")).toBe("running");
  });

  test("transition('configured', 'completed') throws IllegalTransitionError naming the machine", () => {
    expect(() => RunStateMachine.transition("configured", "completed")).toThrow(
      IllegalTransitionError,
    );
    try {
      RunStateMachine.transition("configured", "completed");
    } catch (e) {
      const err = e as IllegalTransitionError;
      expect(err.machine).toBe("Run");
      expect(err.from).toBe("configured");
      expect(err.to).toBe("completed");
    }
  });

  test("transition('completed', 'running') throws (no resurrection from terminal)", () => {
    expect(() => RunStateMachine.transition("completed", "running")).toThrow(
      IllegalTransitionError,
    );
  });
});
