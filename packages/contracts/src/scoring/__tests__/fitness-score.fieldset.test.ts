import { describe, expect, test } from "vitest";
import { fieldset } from "../../testing/fieldset-snapshot.js";
import { spec } from "../../testing/spec-tag.js";
import { FitnessScore } from "../fitness-score.js";

describe(`${spec("§8")} FitnessScore`, () => {
  test("field-name set is frozen", () => {
    expect(fieldset(FitnessScore)).toMatchInlineSnapshot(`
      [
        "candidateId",
        "components",
        "explanation",
        "id",
        "policyVersion",
        "total",
      ]
    `);
  });

  test("parses a complete fitness score", () => {
    const f = {
      id: "ft_1",
      candidateId: "cand_1",
      total: 0.7,
      components: {
        critic_factual_grounding: 0.8,
        check_novelty_prior_art: 0.6,
        novelty: 0.4,
        energy_efficiency: 0.9,
        final_judge_acceptance: 0.7,
      },
      policyVersion: "v1",
      explanation: "evidence-supported",
    };
    expect(FitnessScore.parse(f)).toEqual(f);
  });

  test("requires policyVersion (ties a score to its scoring policy)", () => {
    expect(() =>
      FitnessScore.parse({
        id: "ft_1",
        candidateId: "cand_1",
        total: 0.7,
        components: {},
        explanation: "",
      }),
    ).toThrow();
  });
});
