import { describe, expect, test } from "vitest";
import { createSeededRng } from "../rng.js";

describe("createSeededRng — determinism", () => {
  test("same seed produces the same first-100 next() sequence", () => {
    const a = createSeededRng("seed-1");
    const b = createSeededRng("seed-1");
    const seqA: number[] = [];
    const seqB: number[] = [];
    for (let i = 0; i < 100; i += 1) {
      seqA.push(a.next());
      seqB.push(b.next());
    }
    expect(seqA).toEqual(seqB);
  });

  test("different seeds produce divergent sequences within the first 5 draws", () => {
    const a = createSeededRng("seed-A");
    const b = createSeededRng("seed-B");
    let diverged = false;
    for (let i = 0; i < 5; i += 1) {
      if (a.next() !== b.next()) {
        diverged = true;
        break;
      }
    }
    expect(diverged).toBe(true);
  });

  test("the rng instance exposes the seed it was constructed with", () => {
    const rng = createSeededRng("my-seed");
    expect(rng.seed).toBe("my-seed");
  });
});

describe("createSeededRng — next() shape", () => {
  test("next() returns a float in [0, 1)", () => {
    const rng = createSeededRng("seed");
    for (let i = 0; i < 100; i += 1) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("createSeededRng — nextInt", () => {
  test("nextInt(0, 9) over 1000 draws stays in [0, 9]", () => {
    const rng = createSeededRng("seed");
    for (let i = 0; i < 1000; i += 1) {
      const v = rng.nextInt(0, 9);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(9);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  test("nextInt(5, 5) always returns 5", () => {
    const rng = createSeededRng("seed");
    for (let i = 0; i < 10; i += 1) {
      expect(rng.nextInt(5, 5)).toBe(5);
    }
  });

  test("nextInt with min > max throws", () => {
    const rng = createSeededRng("seed");
    expect(() => rng.nextInt(10, 0)).toThrow(/min/);
  });
});

describe("createSeededRng — choose", () => {
  test("choose([]) throws", () => {
    const rng = createSeededRng("seed");
    expect(() => rng.choose([])).toThrow();
  });

  test("choose(['a']) always returns 'a'", () => {
    const rng = createSeededRng("seed");
    for (let i = 0; i < 10; i += 1) {
      expect(rng.choose(["a"])).toBe("a");
    }
  });

  test("choose over a multi-element array picks only from that array", () => {
    const rng = createSeededRng("seed");
    const options = ["a", "b", "c"] as const;
    for (let i = 0; i < 100; i += 1) {
      expect(options).toContain(rng.choose(options));
    }
  });
});
