import { describe, expect, test } from "vitest";
import { canonicalize } from "../canonical-serialization.js";

describe("spec(§4) canonicalize() — stable JSON for state-equivalence", () => {
  test("object key order doesn't matter", () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe(canonicalize({ a: 2, b: 1 }));
  });

  test("nested objects sort recursively", () => {
    expect(canonicalize({ x: { z: 1, y: 2 } })).toBe('{"x":{"y":2,"z":1}}');
  });

  test("arrays preserve order (meaningful)", () => {
    expect(canonicalize([3, 1, 2])).not.toBe(canonicalize([1, 2, 3]));
    expect(canonicalize([3, 1, 2])).toBe("[3,1,2]");
  });

  test("-0 normalizes to 0", () => {
    expect(canonicalize(-0)).toBe(canonicalize(0));
    expect(canonicalize(-0)).toBe("0");
  });

  test("null, true, false, empty string render as JSON literals", () => {
    expect(canonicalize(null)).toBe("null");
    expect(canonicalize(true)).toBe("true");
    expect(canonicalize(false)).toBe("false");
    expect(canonicalize("")).toBe('""');
  });

  test("nested structure stays self-equivalent after a deep copy", () => {
    const fx = {
      runId: "run_1",
      events: [
        { sequence: 0, type: "run.configured", payload: { config: { seed: "x" } } },
        { sequence: 1, type: "run.started" },
      ],
      meta: { generatedAt: "2026-06-19T12:00:00.000Z" },
    };
    expect(canonicalize(structuredClone(fx))).toBe(canonicalize(fx));
  });

  test("strings with quotes and unicode round-trip correctly", () => {
    expect(canonicalize('a"b')).toBe('"a\\"b"');
    expect(canonicalize("é")).toBe('"é"');
  });

  test("throws on Date", () => {
    expect(() => canonicalize(new Date())).toThrow(/unsupported|Date/i);
  });

  test("throws on Map", () => {
    expect(() => canonicalize(new Map())).toThrow(/unsupported|Map/i);
  });

  test("throws on Set", () => {
    expect(() => canonicalize(new Set())).toThrow(/unsupported|Set/i);
  });

  test("throws on functions", () => {
    expect(() => canonicalize(() => 1)).toThrow(/unsupported|function/i);
  });

  test("throws on symbols", () => {
    expect(() => canonicalize(Symbol("x"))).toThrow(/unsupported|symbol/i);
  });

  test("undefined inside an array — throws (not a valid JSON value)", () => {
    expect(() => canonicalize([undefined])).toThrow();
  });

  test("undefined inside an object — value is OMITTED (matches JSON.stringify)", () => {
    expect(canonicalize({ a: 1, b: undefined })).toBe('{"a":1}');
  });
});
