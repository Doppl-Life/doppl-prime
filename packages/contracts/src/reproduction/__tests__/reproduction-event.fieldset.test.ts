import { describe, expect, test } from "vitest";
import { fieldset } from "../../testing/fieldset-snapshot.js";
import { spec } from "../../testing/spec-tag.js";
import {
  ReproductionEvent,
  ReproductionMode,
  ReproductionModeValues,
} from "../reproduction-event.js";

describe(`${spec("§8")} ReproductionEvent`, () => {
  test("field-name set is frozen", () => {
    expect(fieldset(ReproductionEvent)).toMatchInlineSnapshot(`
      [
        "childAgenomeId",
        "crossoverPoints",
        "id",
        "mode",
        "mutationSummary",
        "parentAgenomeIds",
        "runId",
      ]
    `);
  });

  test("parses a fusion event", () => {
    const r = {
      id: "rp_1",
      runId: "run_1",
      parentAgenomeIds: ["ag_1", "ag_2"],
      childAgenomeId: "ag_3",
      mode: "fusion",
      crossoverPoints: ["systemPrompt", "personaWeights"],
      mutationSummary: "blended persona",
    };
    expect(ReproductionEvent.parse(r)).toEqual(r);
  });

  test("parses a mutation_only degenerate fallback (single parent)", () => {
    const r = {
      id: "rp_1",
      runId: "run_1",
      parentAgenomeIds: ["ag_1"],
      childAgenomeId: "ag_2",
      mode: "mutation_only",
      crossoverPoints: [],
      mutationSummary: "drift on toolPermissions",
    };
    expect(ReproductionEvent.parse(r)).toEqual(r);
  });
});

describe(`${spec("§8")} ReproductionMode 4-member union`, () => {
  test("is closed", () => {
    expect([...ReproductionModeValues].sort()).toMatchInlineSnapshot(`
      [
        "crossover",
        "fusion",
        "mutation_only",
        "output_synthesis",
      ]
    `);
    for (const m of ReproductionModeValues) {
      expect(ReproductionMode.parse(m)).toBe(m);
    }
    expect(() => ReproductionMode.parse("clone")).toThrow();
  });
});
