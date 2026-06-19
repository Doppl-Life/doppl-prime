import { describe, expect, test } from "vitest";
import { cosineDistance, cosineSimilarity } from "../cosine.js";

describe("cosineSimilarity", () => {
  test("identical vectors → similarity 1", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1, 10);
  });

  test("orthogonal vectors → similarity 0", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 10);
  });

  test("anti-parallel vectors → similarity -1", () => {
    expect(cosineSimilarity([1, 0, 0], [-1, 0, 0])).toBeCloseTo(-1, 10);
  });

  test("scale invariant", () => {
    expect(cosineSimilarity([3, 0], [9, 0])).toBeCloseTo(1, 10);
  });

  test("zero vector throws", () => {
    expect(() => cosineSimilarity([0, 0], [1, 0])).toThrow(/zero/i);
    expect(() => cosineSimilarity([1, 0], [0, 0])).toThrow(/zero/i);
  });

  test("mismatched length throws", () => {
    expect(() => cosineSimilarity([1, 0], [1, 0, 0])).toThrow(/dimension/i);
  });
});

describe("cosineDistance", () => {
  test("identical → 0", () => {
    expect(cosineDistance([1, 2, 3], [1, 2, 3])).toBeCloseTo(0, 10);
  });

  test("orthogonal → 1", () => {
    expect(cosineDistance([1, 0], [0, 1])).toBeCloseTo(1, 10);
  });

  test("anti-parallel → 2", () => {
    expect(cosineDistance([1, 0, 0], [-1, 0, 0])).toBeCloseTo(2, 10);
  });

  test("symmetric", () => {
    expect(cosineDistance([1, 2, 3], [4, 5, 6])).toBeCloseTo(
      cosineDistance([4, 5, 6], [1, 2, 3]),
      10,
    );
  });

  test("deterministic across runs", () => {
    const a = [0.1, 0.2, 0.3, 0.4];
    const b = [0.5, 0.6, 0.7, 0.8];
    const first = cosineDistance(a, b);
    const second = cosineDistance(a, b);
    expect(first).toBe(second);
  });
});
