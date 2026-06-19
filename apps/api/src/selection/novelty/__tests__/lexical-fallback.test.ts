import { describe, expect, test } from "vitest";
import { charNGramSet, jaccardDistance, jaccardSimilarity } from "../lexical-fallback.js";

describe("charNGramSet", () => {
  test("default n=3 produces 3-character windows over the lowercased text", () => {
    const s = charNGramSet("abcdef");
    expect(s).toEqual(new Set(["abc", "bcd", "cde", "def"]));
  });

  test("case-folds the input", () => {
    expect(charNGramSet("ABC")).toEqual(charNGramSet("abc"));
  });

  test("text shorter than n is space-padded so very short strings still produce a set", () => {
    expect(charNGramSet("ab")).toEqual(new Set(["ab "]));
  });

  test("non-integer or non-positive n throws", () => {
    expect(() => charNGramSet("abc", 0)).toThrow();
    expect(() => charNGramSet("abc", -1)).toThrow();
    expect(() => charNGramSet("abc", 1.5)).toThrow();
  });
});

describe("jaccardSimilarity", () => {
  test("identical sets → 1", () => {
    expect(jaccardSimilarity(new Set(["a", "b"]), new Set(["a", "b"]))).toBe(1);
  });

  test("disjoint sets → 0", () => {
    expect(jaccardSimilarity(new Set(["a"]), new Set(["b"]))).toBe(0);
  });

  test("both empty sets → 1 (boundary value)", () => {
    expect(jaccardSimilarity(new Set(), new Set())).toBe(1);
  });

  test("partial overlap is exact", () => {
    // intersection = 1, union = 3 → 1/3
    expect(jaccardSimilarity(new Set(["a", "b"]), new Set(["b", "c"]))).toBeCloseTo(1 / 3, 10);
  });
});

describe("jaccardDistance", () => {
  test("identical → 0", () => {
    expect(jaccardDistance(new Set(["a"]), new Set(["a"]))).toBe(0);
  });

  test("disjoint → 1", () => {
    expect(jaccardDistance(new Set(["a"]), new Set(["b"]))).toBe(1);
  });

  test("deterministic across runs", () => {
    const a = charNGramSet("the quick brown fox");
    const b = charNGramSet("the lazy dog");
    const first = jaccardDistance(a, b);
    const second = jaccardDistance(a, b);
    expect(first).toBe(second);
  });
});
