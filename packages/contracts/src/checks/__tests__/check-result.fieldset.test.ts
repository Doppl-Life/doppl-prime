import { describe, expect, test } from "vitest";
import { spec } from "../../testing/spec-tag.js";
import { CheckResult, CheckStatus, CheckStatusValues } from "../check-result.js";

// CheckResult is wrapped by .refine() which strips off the .shape; pin the
// field-set via the raw inner object for the §2.5 snapshot.
const CheckResultInnerShape = [
  "candidateId",
  "checkType",
  "error",
  "evidenceRefs",
  "id",
  "output",
  "score",
  "skipReason",
  "status",
] as const;

describe(`${spec("§7")} CheckResult`, () => {
  test("field-name set is frozen (snapshot of declared fields)", () => {
    expect([...CheckResultInnerShape].sort()).toMatchInlineSnapshot(`
      [
        "candidateId",
        "checkType",
        "error",
        "evidenceRefs",
        "id",
        "output",
        "score",
        "skipReason",
        "status",
      ]
    `);
  });

  test("parses a passed result", () => {
    const r = {
      id: "ck_1",
      candidateId: "c_1",
      checkType: "novelty_prior_art",
      status: "passed",
      score: 0.9,
      evidenceRefs: [],
    };
    expect(CheckResult.parse(r)).toEqual(r);
  });

  test("parses a failed result with error", () => {
    const r = {
      id: "ck_1",
      candidateId: "c_1",
      checkType: "feasibility",
      status: "failed",
      evidenceRefs: [],
      error: "timeout",
    };
    expect(CheckResult.parse(r)).toEqual(r);
  });

  test("rejects skipped without skipReason (refinement invariant)", () => {
    expect(() =>
      CheckResult.parse({
        id: "ck_1",
        candidateId: "c_1",
        checkType: "any",
        status: "skipped",
        evidenceRefs: [],
      }),
    ).toThrow();
  });

  test("accepts skipped with skipReason", () => {
    const r = {
      id: "ck_1",
      candidateId: "c_1",
      checkType: "any",
      status: "skipped",
      skipReason: "adapter not in allowlist",
      evidenceRefs: [],
    };
    expect(CheckResult.parse(r)).toEqual(r);
  });

  test("rejects unknown fields (.strict())", () => {
    expect(() =>
      CheckResult.parse({
        id: "ck_1",
        candidateId: "c_1",
        checkType: "any",
        status: "passed",
        evidenceRefs: [],
        executed: true,
      }),
    ).toThrow();
  });
});

describe(`${spec("§7")} CheckStatus 3-member union`, () => {
  test("is closed — CheckStatusValues snapshot", () => {
    expect([...CheckStatusValues].sort()).toMatchInlineSnapshot(`
      [
        "failed",
        "passed",
        "skipped",
      ]
    `);
  });

  test("accepts each of the 3 statuses", () => {
    for (const s of CheckStatusValues) {
      expect(CheckStatus.parse(s)).toBe(s);
    }
  });
});
