import { describe, expect, test } from "vitest";
import { fieldset } from "../../testing/fieldset-snapshot.js";
import { spec } from "../../testing/spec-tag.js";
import { FINAL_JUDGE_AXES, FinalJudgeRubric } from "../final-judge-rubric.js";

const validRubric = {
  version: "v1",
  axes: [
    "grounding",
    "novelty",
    "feasibility",
    "falsification_survival",
    "subtype_check_pass",
  ] as const,
  scaleMin: 0 as const,
  scaleMax: 5 as const,
  weights: {
    grounding: 1,
    novelty: 1,
    feasibility: 1,
    falsification_survival: 1,
    subtype_check_pass: 1,
  },
};

describe(`${spec("§7")} FinalJudgeRubric (immutable to agents)`, () => {
  test("field-name set is frozen", () => {
    expect(fieldset(FinalJudgeRubric)).toMatchInlineSnapshot(`
      [
        "axes",
        "scaleMax",
        "scaleMin",
        "version",
        "weights",
      ]
    `);
  });

  test("axes constant pins exactly the 5 §7 axes in order", () => {
    expect([...FINAL_JUDGE_AXES]).toEqual([
      "grounding",
      "novelty",
      "feasibility",
      "falsification_survival",
      "subtype_check_pass",
    ]);
    expect(FINAL_JUDGE_AXES).toHaveLength(5);
  });

  test("parses a valid rubric with equal starting weights", () => {
    expect(FinalJudgeRubric.parse(validRubric)).toEqual(validRubric);
  });

  test("rejects a 4-axis tuple (too short)", () => {
    expect(() =>
      FinalJudgeRubric.parse({
        ...validRubric,
        axes: ["grounding", "novelty", "feasibility", "falsification_survival"],
      }),
    ).toThrow();
  });

  test("rejects a 6-axis tuple (too long)", () => {
    expect(() =>
      FinalJudgeRubric.parse({
        ...validRubric,
        axes: [...validRubric.axes, "extra_axis"],
      }),
    ).toThrow();
  });

  test("rejects a wrong axis name at the schema level", () => {
    expect(() =>
      FinalJudgeRubric.parse({
        ...validRubric,
        axes: ["grounding", "novelty", "feasibility", "creativity", "subtype_check_pass"],
      }),
    ).toThrow();
  });

  test("rejects scaleMin != 0 or scaleMax != 5 (the 0-5 spec is pinned at schema level)", () => {
    expect(() => FinalJudgeRubric.parse({ ...validRubric, scaleMin: 1 })).toThrow();
    expect(() => FinalJudgeRubric.parse({ ...validRubric, scaleMax: 10 })).toThrow();
  });
});
