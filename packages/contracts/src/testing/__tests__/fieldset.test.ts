import { describe, expect, test } from "vitest";
import { z } from "zod";
import { fieldset } from "../fieldset-snapshot.js";
import { spec } from "../spec-tag.js";

describe(`${spec("§2.5")} fieldset() snapshot helper`, () => {
  test("returns top-level field names sorted alphabetically", () => {
    const schema = z.object({ b: z.string(), a: z.number(), c: z.boolean() });
    expect(fieldset(schema)).toEqual(["a", "b", "c"]);
  });

  test("returns only top-level keys for nested object schemas", () => {
    const schema = z.object({
      outer: z.string(),
      nested: z.object({ innerA: z.number(), innerB: z.number() }),
    });
    expect(fieldset(schema)).toEqual(["nested", "outer"]);
  });

  test("returns empty array for empty object schema", () => {
    expect(fieldset(z.object({}))).toEqual([]);
  });

  test("preserves optional field names in the set", () => {
    const schema = z.object({
      required: z.string(),
      maybe: z.string().optional(),
    });
    expect(fieldset(schema)).toEqual(["maybe", "required"]);
  });

  test("throws on non-ZodObject input (z.string())", () => {
    expect(() => fieldset(z.string() as never)).toThrow(/expected ZodObject/i);
  });

  test("throws on non-ZodObject input (z.array())", () => {
    expect(() => fieldset(z.array(z.string()) as never)).toThrow(/expected ZodObject/i);
  });
});

describe(`${spec("§2.5")} spec() test-name tagger`, () => {
  test("produces the expected prefix format", () => {
    expect(spec("§4")).toBe("spec(§4)");
  });

  test("accepts arbitrary anchor strings", () => {
    expect(spec("§9 ModelRoute")).toBe("spec(§9 ModelRoute)");
  });
});
