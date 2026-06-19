import { describe, expect, test } from "vitest";
import { fieldset } from "../../testing/fieldset-snapshot.js";
import { spec } from "../../testing/spec-tag.js";
import { NoveltyScore } from "../novelty-score.js";

describe(`${spec("§8")} NoveltyScore`, () => {
  test("field-name set is frozen", () => {
    expect(fieldset(NoveltyScore)).toMatchInlineSnapshot(`
      [
        "candidateId",
        "comparisonSet",
        "dimension",
        "embeddingModelId",
        "explanation",
        "id",
        "method",
        "score",
        "vector",
      ]
    `);
  });

  test("parses a complete novelty score", () => {
    const n = {
      id: "nv_1",
      candidateId: "cand_1",
      vector: [0.1, 0.2, 0.3],
      embeddingModelId: "text-embedding-3-small",
      dimension: 3,
      comparisonSet: ["cand_2", "cand_3"],
      method: "app-cosine",
      score: 0.42,
      explanation: "moderate novelty",
    };
    expect(NoveltyScore.parse(n)).toEqual(n);
  });

  test("documents the runtime invariant vector.length === dimension (asserted by integration)", () => {
    const n = {
      id: "nv_1",
      candidateId: "cand_1",
      vector: [0.1, 0.2, 0.3],
      embeddingModelId: "m",
      dimension: 3,
      comparisonSet: [],
      method: "x",
      score: 0,
      explanation: "",
    };
    const parsed = NoveltyScore.parse(n);
    expect(parsed.vector.length).toBe(parsed.dimension);
  });

  test("rejects dimension <= 0", () => {
    expect(() =>
      NoveltyScore.parse({
        id: "n",
        candidateId: "c",
        vector: [],
        embeddingModelId: "m",
        dimension: 0,
        comparisonSet: [],
        method: "x",
        score: 0,
        explanation: "",
      }),
    ).toThrow();
  });
});
