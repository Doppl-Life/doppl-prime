import { describe, expect, test } from "vitest";
import { CandidateStateMachine } from "../candidate.js";
import { IllegalTransitionError } from "../errors.js";

const ALL_STATES = [
  "created",
  "under_review",
  "checked",
  "scored",
  "selected",
  "rejected",
  "culled",
  "invalid",
] as const;

describe("CandidateStateMachine — closed transitions per DOMAIN_MODEL.md §173-180", () => {
  test("legal transitions form a snapshot-stable set", () => {
    const legal: Array<[string, string]> = [];
    for (const from of ALL_STATES) {
      for (const to of ALL_STATES) {
        if (CandidateStateMachine.canTransition(from, to)) {
          legal.push([from, to]);
        }
      }
    }
    expect(legal).toMatchInlineSnapshot(`
      [
        [
          "created",
          "under_review",
        ],
        [
          "created",
          "invalid",
        ],
        [
          "under_review",
          "checked",
        ],
        [
          "under_review",
          "rejected",
        ],
        [
          "checked",
          "scored",
        ],
        [
          "scored",
          "selected",
        ],
        [
          "scored",
          "culled",
        ],
      ]
    `);
  });

  test("terminalStates = {selected, rejected, culled, invalid}", () => {
    expect([...CandidateStateMachine.terminalStates].sort()).toEqual([
      "culled",
      "invalid",
      "rejected",
      "selected",
    ]);
  });

  test("created → under_review is the happy path after a successful (or repaired) generation", () => {
    expect(CandidateStateMachine.canTransition("created", "under_review")).toBe(true);
  });

  test("created → invalid is the structured-output-failed path (U6 repair-state edge)", () => {
    expect(CandidateStateMachine.canTransition("created", "invalid")).toBe(true);
  });

  test("scored → culled (post-scoring cull) is legal", () => {
    expect(CandidateStateMachine.canTransition("scored", "culled")).toBe(true);
  });

  test("rejected → selected is rejected (no resurrection)", () => {
    expect(() => CandidateStateMachine.transition("rejected", "selected")).toThrow(
      IllegalTransitionError,
    );
  });

  test("created → scored directly (skipping review) is rejected", () => {
    expect(CandidateStateMachine.canTransition("created", "scored")).toBe(false);
  });
});
