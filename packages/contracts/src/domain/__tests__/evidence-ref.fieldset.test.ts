import { describe, expect, test } from "vitest";
import { fieldset } from "../../testing/fieldset-snapshot.js";
import { spec } from "../../testing/spec-tag.js";
import { EvidenceKind, EvidenceKindValues, EvidenceRef } from "../evidence-ref.js";

describe(`${spec("§9")} EvidenceRef`, () => {
  test("field-name set is frozen", () => {
    expect(fieldset(EvidenceRef)).toMatchInlineSnapshot(`
      [
        "eventId",
        "kind",
        "label",
        "langfuseObservationId",
        "uri",
      ]
    `);
  });

  test("accepts an eventId-only ref", () => {
    expect(EvidenceRef.parse({ kind: "trace", eventId: "evt_1" })).toEqual({
      kind: "trace",
      eventId: "evt_1",
    });
  });

  test("accepts a uri-only ref", () => {
    expect(EvidenceRef.parse({ kind: "prior_art", uri: "https://example.com/x" })).toBeDefined();
  });

  test("accepts a langfuseObservationId-only ref", () => {
    expect(EvidenceRef.parse({ kind: "trace", langfuseObservationId: "obs_1" })).toBeDefined();
  });

  test("accepts no locator at all (runtime resolves)", () => {
    expect(EvidenceRef.parse({ kind: "other" })).toEqual({ kind: "other" });
  });

  test("rejects unknown kind", () => {
    expect(() => EvidenceRef.parse({ kind: "podcast" })).toThrow();
  });

  test("rejects unknown fields (.strict())", () => {
    expect(() => EvidenceRef.parse({ kind: "trace", extra: true })).toThrow();
  });
});

describe(`${spec("§9")} EvidenceKind 6-member union`, () => {
  test("is closed — EvidenceKindValues snapshot", () => {
    expect([...EvidenceKindValues].sort()).toMatchInlineSnapshot(`
      [
        "check_output",
        "other",
        "prior_art",
        "raw_output",
        "signal",
        "trace",
      ]
    `);
  });

  test("accepts each of the 6 kinds", () => {
    for (const k of EvidenceKindValues) {
      expect(EvidenceKind.parse(k)).toBe(k);
    }
  });
});
