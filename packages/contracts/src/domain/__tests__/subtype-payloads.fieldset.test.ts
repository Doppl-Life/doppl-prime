import { describe, expect, test } from "vitest";
import { fieldset } from "../../testing/fieldset-snapshot.js";
import { spec } from "../../testing/spec-tag.js";
import {
  CrossDomainTransferPayload,
  SubtypeName,
  SubtypeNameValues,
  ZeitgeistSynthesisPayload,
} from "../subtype-payloads.js";

describe(`${spec("§3")} SubtypeName 2-member union`, () => {
  test("is closed — SubtypeNameValues snapshot", () => {
    expect([...SubtypeNameValues].sort()).toMatchInlineSnapshot(`
      [
        "cross_domain_transfer",
        "zeitgeist_synthesis",
      ]
    `);
  });

  test("accepts both members", () => {
    for (const s of SubtypeNameValues) {
      expect(SubtypeName.parse(s)).toBe(s);
    }
  });
});

describe(`${spec("§3")} CrossDomainTransferPayload`, () => {
  test("field-name set is frozen", () => {
    expect(fieldset(CrossDomainTransferPayload)).toMatchInlineSnapshot(`
      [
        "executableCheckIdea",
        "expectedMechanism",
        "sourceDomain",
        "sourceTechnique",
        "targetDomain",
        "targetProblem",
        "transferMapping",
      ]
    `);
  });

  test("parses a complete payload (without optional executableCheckIdea)", () => {
    const p = {
      sourceDomain: "biology",
      sourceTechnique: "selective pressure",
      targetDomain: "ML",
      targetProblem: "model collapse",
      transferMapping: "fitness landscape -> training loss",
      expectedMechanism: "diversity-preserving sampler",
    };
    expect(CrossDomainTransferPayload.parse(p)).toEqual(p);
  });

  test("rejects unknown fields (.strict())", () => {
    expect(() =>
      CrossDomainTransferPayload.parse({
        sourceDomain: "a",
        sourceTechnique: "b",
        targetDomain: "c",
        targetProblem: "d",
        transferMapping: "e",
        expectedMechanism: "f",
        bogus: 1,
      }),
    ).toThrow();
  });
});

describe(`${spec("§3")} ZeitgeistSynthesisPayload`, () => {
  test("field-name set is frozen", () => {
    expect(fieldset(ZeitgeistSynthesisPayload)).toMatchInlineSnapshot(`
      [
        "audience",
        "comparablePriorArt",
        "currentSignals",
        "falsifiablePredictions",
        "thesis",
        "whyNow",
      ]
    `);
  });

  test("parses a complete payload", () => {
    const p = {
      thesis: "x",
      audience: "y",
      currentSignals: ["a", "b"],
      whyNow: "z",
      falsifiablePredictions: ["p1"],
      comparablePriorArt: ["q1"],
    };
    expect(ZeitgeistSynthesisPayload.parse(p)).toEqual(p);
  });
});
