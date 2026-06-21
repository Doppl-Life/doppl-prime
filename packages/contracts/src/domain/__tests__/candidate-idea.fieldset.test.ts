import { describe, expect, test } from "vitest";
import { spec } from "../../testing/spec-tag.js";
import {
  CandidateIdea,
  CandidateIdeaFieldNames,
  CandidateStatus,
  CandidateStatusValues,
} from "../candidate-idea.js";

const xdomain = {
  id: "cand_1",
  runId: "run_1",
  generationId: "gen_1",
  agenomeId: "ag_1",
  title: "t",
  summary: "s",
  claims: ["c1"],
  evidenceRefs: [{ kind: "trace", eventId: "evt_1" }],
  status: "created",
  subtype: "cross_domain_transfer",
  subtypePayload: {
    sourceDomain: "a",
    sourceTechnique: "b",
    targetDomain: "c",
    targetProblem: "d",
    transferMapping: "e",
    expectedMechanism: "f",
  },
} as const;

const zeitgeist = {
  id: "cand_2",
  runId: "run_1",
  generationId: "gen_1",
  agenomeId: "ag_1",
  title: "t",
  summary: "s",
  claims: [],
  evidenceRefs: [],
  status: "under_review",
  subtype: "zeitgeist_synthesis",
  subtypePayload: {
    thesis: "x",
    audience: "y",
    currentSignals: [],
    whyNow: "z",
    falsifiablePredictions: [],
    comparablePriorArt: [],
  },
} as const;

describe(`${spec("§3")} CandidateIdea`, () => {
  test("top-level field-name set is frozen", () => {
    expect(CandidateIdeaFieldNames).toMatchInlineSnapshot(`
      [
        "agenomeId",
        "claims",
        "evidenceRefs",
        "explanation",
        "generationId",
        "id",
        "runId",
        "status",
        "subtype",
        "subtypePayload",
        "summary",
        "title",
      ]
    `);
  });

  test("parses a valid cross_domain_transfer candidate", () => {
    expect(CandidateIdea.parse(xdomain)).toEqual(xdomain);
  });

  test("parses a valid zeitgeist_synthesis candidate", () => {
    expect(CandidateIdea.parse(zeitgeist)).toEqual(zeitgeist);
  });

  test("rejects mismatched subtype/subtypePayload (zeitgeist payload under cross_domain_transfer)", () => {
    expect(() =>
      CandidateIdea.parse({
        ...xdomain,
        subtypePayload: zeitgeist.subtypePayload,
      }),
    ).toThrow();
  });

  test("rejects mismatched subtype/subtypePayload (cross_domain payload under zeitgeist_synthesis)", () => {
    expect(() =>
      CandidateIdea.parse({
        ...zeitgeist,
        subtypePayload: xdomain.subtypePayload,
      }),
    ).toThrow();
  });

  test("rejects unknown top-level fields (.strict() on both variants)", () => {
    expect(() => CandidateIdea.parse({ ...xdomain, bogus: 1 })).toThrow();
  });

  test("parses a candidate that includes an optional explanation", () => {
    const withExplanation = { ...xdomain, explanation: "In plain English: it borrows a trick from plumbing." };
    expect(CandidateIdea.parse(withExplanation)).toEqual(withExplanation);
  });

  test("parses a candidate that omits the optional explanation (back-compat)", () => {
    // xdomain has no `explanation` key; should still parse.
    expect(CandidateIdea.parse(xdomain)).toEqual(xdomain);
  });

  test("rejects an empty-string explanation (min(1) guard)", () => {
    expect(() => CandidateIdea.parse({ ...xdomain, explanation: "" })).toThrow();
  });
});

describe(`${spec("§3")} CandidateStatus 8-member union`, () => {
  test("is closed — CandidateStatusValues snapshot", () => {
    expect([...CandidateStatusValues].sort()).toMatchInlineSnapshot(`
      [
        "checked",
        "created",
        "culled",
        "invalid",
        "rejected",
        "scored",
        "selected",
        "under_review",
      ]
    `);
  });

  test("accepts each of the 8 statuses", () => {
    for (const s of CandidateStatusValues) {
      expect(CandidateStatus.parse(s)).toBe(s);
    }
  });
});
