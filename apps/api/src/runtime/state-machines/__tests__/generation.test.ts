import { describe, expect, test } from "vitest";
import { IllegalTransitionError } from "../errors.js";
import { GenerationStateMachine } from "../generation.js";

const ALL_STATES = [
  "pending",
  "running",
  "degraded",
  "verifying",
  "scoring",
  "reproducing",
  "completed",
  "failed",
  "skipped",
] as const;

describe("GenerationStateMachine — closed transitions per ARCHITECTURE.md §3", () => {
  test("legal transitions form a snapshot-stable set (includes degraded edge)", () => {
    const legal: Array<[string, string]> = [];
    for (const from of ALL_STATES) {
      for (const to of ALL_STATES) {
        if (GenerationStateMachine.canTransition(from, to)) {
          legal.push([from, to]);
        }
      }
    }
    expect(legal).toMatchInlineSnapshot(`
      [
        [
          "pending",
          "running",
        ],
        [
          "pending",
          "skipped",
        ],
        [
          "running",
          "degraded",
        ],
        [
          "running",
          "verifying",
        ],
        [
          "running",
          "failed",
        ],
        [
          "degraded",
          "verifying",
        ],
        [
          "verifying",
          "scoring",
        ],
        [
          "verifying",
          "failed",
        ],
        [
          "scoring",
          "reproducing",
        ],
        [
          "scoring",
          "completed",
        ],
        [
          "scoring",
          "failed",
        ],
        [
          "reproducing",
          "completed",
        ],
        [
          "reproducing",
          "failed",
        ],
      ]
    `);
  });

  test("terminalStates = {completed, failed, skipped}", () => {
    expect([...GenerationStateMachine.terminalStates].sort()).toEqual([
      "completed",
      "failed",
      "skipped",
    ]);
  });

  test("running → degraded is legal (partial-failure edge)", () => {
    expect(GenerationStateMachine.canTransition("running", "degraded")).toBe(true);
    expect(GenerationStateMachine.transition("running", "degraded")).toBe("degraded");
  });

  test("scoring → completed is legal (zero-survivors edge — generation completes with no offspring)", () => {
    expect(GenerationStateMachine.canTransition("scoring", "completed")).toBe(true);
  });

  test("transition('failed', 'completed') throws (no resurrection)", () => {
    expect(() => GenerationStateMachine.transition("failed", "completed")).toThrow(
      IllegalTransitionError,
    );
  });

  test("running → completed direct (no scoring) is rejected", () => {
    expect(GenerationStateMachine.canTransition("running", "completed")).toBe(false);
  });

  test("pending → skipped is legal", () => {
    expect(GenerationStateMachine.canTransition("pending", "skipped")).toBe(true);
  });
});
