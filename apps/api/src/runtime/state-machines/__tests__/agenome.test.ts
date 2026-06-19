import { describe, expect, test } from "vitest";
import { AgenomeStateMachine } from "../agenome.js";
import { IllegalTransitionError } from "../errors.js";

const ALL_STATES = [
  "seeded",
  "active",
  "spent",
  "eligible_parent",
  "failed",
  "reproduced",
  "culled",
] as const;

describe("AgenomeStateMachine — closed transitions per DOMAIN_MODEL.md §184-189", () => {
  test("legal transitions form a snapshot-stable set", () => {
    const legal: Array<[string, string]> = [];
    for (const from of ALL_STATES) {
      for (const to of ALL_STATES) {
        if (AgenomeStateMachine.canTransition(from, to)) {
          legal.push([from, to]);
        }
      }
    }
    expect(legal).toMatchInlineSnapshot(`
      [
        [
          "seeded",
          "active",
        ],
        [
          "active",
          "spent",
        ],
        [
          "active",
          "failed",
        ],
        [
          "active",
          "culled",
        ],
        [
          "spent",
          "eligible_parent",
        ],
        [
          "eligible_parent",
          "reproduced",
        ],
        [
          "eligible_parent",
          "culled",
        ],
      ]
    `);
  });

  test("terminalStates = {failed, reproduced, culled}", () => {
    expect([...AgenomeStateMachine.terminalStates].sort()).toEqual([
      "culled",
      "failed",
      "reproduced",
    ]);
  });

  test("happy path: seeded → active → spent → eligible_parent → reproduced", () => {
    let s = AgenomeStateMachine.transition("seeded", "active");
    s = AgenomeStateMachine.transition(s, "spent");
    s = AgenomeStateMachine.transition(s, "eligible_parent");
    s = AgenomeStateMachine.transition(s, "reproduced");
    expect(s).toBe("reproduced");
    expect(AgenomeStateMachine.isTerminal(s)).toBe(true);
  });

  test("reproduced → active throws (no resurrection)", () => {
    expect(() => AgenomeStateMachine.transition("reproduced", "active")).toThrow(
      IllegalTransitionError,
    );
  });

  test("active → reproduced direct (skipping spent + eligible_parent) is rejected", () => {
    expect(AgenomeStateMachine.canTransition("active", "reproduced")).toBe(false);
  });

  test("eligible_parent → culled is legal (parent not selected for reproduction)", () => {
    expect(AgenomeStateMachine.canTransition("eligible_parent", "culled")).toBe(true);
  });
});
