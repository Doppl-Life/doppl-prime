import { describe, expect, test } from "vitest";
import { fieldset } from "../../testing/fieldset-snapshot.js";
import { spec } from "../../testing/spec-tag.js";
import { CriticMandate, CriticMandateValues, CriticReview } from "../critic-review.js";

describe(`${spec("§7")} CriticReview`, () => {
  test("field-name set is frozen — no winner-selection or policy-mutation field", () => {
    expect(fieldset(CriticReview)).toMatchInlineSnapshot(`
      [
        "candidateId",
        "confidence",
        "critique",
        "evidenceRefs",
        "id",
        "mandate",
        "scores",
      ]
    `);
  });

  test("parses a valid review", () => {
    const r = {
      id: "rev_1",
      candidateId: "cand_1",
      mandate: "factual_grounding",
      scores: { accuracy: 0.8, citation_quality: 0.6 },
      critique: "evidence is partial",
      confidence: 0.7,
      evidenceRefs: [{ kind: "trace", eventId: "evt_1" }],
    };
    expect(CriticReview.parse(r)).toEqual(r);
  });

  test("rejects confidence > 1", () => {
    expect(() =>
      CriticReview.parse({
        id: "r",
        candidateId: "c",
        mandate: "feasibility",
        scores: {},
        critique: "",
        confidence: 1.1,
        evidenceRefs: [],
      }),
    ).toThrow();
  });

  test("rejects confidence < 0", () => {
    expect(() =>
      CriticReview.parse({
        id: "r",
        candidateId: "c",
        mandate: "feasibility",
        scores: {},
        critique: "",
        confidence: -0.1,
        evidenceRefs: [],
      }),
    ).toThrow();
  });

  test("rejects extra fields (would-be winner-selection field is the regression alarm)", () => {
    expect(() =>
      CriticReview.parse({
        id: "r",
        candidateId: "c",
        mandate: "feasibility",
        scores: {},
        critique: "",
        confidence: 0.5,
        evidenceRefs: [],
        selectedAsWinner: true,
      }),
    ).toThrow();
  });
});

describe(`${spec("§7")} CriticMandate 5-member union`, () => {
  test("is closed — CriticMandateValues snapshot", () => {
    expect([...CriticMandateValues].sort()).toMatchInlineSnapshot(`
      [
        "factual_grounding",
        "falsification",
        "feasibility",
        "novelty_prior_art",
        "subtype_specific",
      ]
    `);
  });

  test("accepts each of the 5 mandates", () => {
    for (const m of CriticMandateValues) {
      expect(CriticMandate.parse(m)).toBe(m);
    }
  });
});
