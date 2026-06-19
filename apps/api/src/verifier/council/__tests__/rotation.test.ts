import { CriticMandateValues } from "@doppl/contracts";
import { describe, expect, test } from "vitest";
import { RotationConfigError, assignCriticsForGeneration } from "../rotation.js";

const FIVE_CRITICS = ["crit_ag_A", "crit_ag_B", "crit_ag_C", "crit_ag_D", "crit_ag_E"];

describe("assignCriticsForGeneration — determinism", () => {
  test("same (runSeed, generationIndex, criticAgenomeIds, N) → identical assignment + rotationGeneration", () => {
    const a = assignCriticsForGeneration({
      generationIndex: 4,
      runSeed: "seed-X",
      criticAgenomeIds: FIVE_CRITICS,
      everyNGenerations: 2,
    });
    const b = assignCriticsForGeneration({
      generationIndex: 4,
      runSeed: "seed-X",
      criticAgenomeIds: FIVE_CRITICS,
      everyNGenerations: 2,
    });
    expect(a).toEqual(b);
  });

  test("N=1 rotates every generation (gen 0 ≠ gen 1 at most one differing mandate is enough)", () => {
    const a = assignCriticsForGeneration({
      generationIndex: 0,
      runSeed: "seed-Y",
      criticAgenomeIds: FIVE_CRITICS,
      everyNGenerations: 1,
    });
    const b = assignCriticsForGeneration({
      generationIndex: 1,
      runSeed: "seed-Y",
      criticAgenomeIds: FIVE_CRITICS,
      everyNGenerations: 1,
    });
    expect(a.rotationGeneration).toBe(0);
    expect(b.rotationGeneration).toBe(1);
    // Different rotation buckets → seed differs → at least one mandate
    // changes with high probability for 5 critics. Sanity-check overall
    // assignment differs.
    expect(a.assignment).not.toEqual(b.assignment);
  });

  test("N=2 keeps assignment stable across gen 0 and gen 1, rotates at gen 2", () => {
    const g0 = assignCriticsForGeneration({
      generationIndex: 0,
      runSeed: "seed-Z",
      criticAgenomeIds: FIVE_CRITICS,
      everyNGenerations: 2,
    });
    const g1 = assignCriticsForGeneration({
      generationIndex: 1,
      runSeed: "seed-Z",
      criticAgenomeIds: FIVE_CRITICS,
      everyNGenerations: 2,
    });
    const g2 = assignCriticsForGeneration({
      generationIndex: 2,
      runSeed: "seed-Z",
      criticAgenomeIds: FIVE_CRITICS,
      everyNGenerations: 2,
    });
    expect(g0).toEqual(g1);
    expect(g0).not.toEqual(g2);
    expect(g2.rotationGeneration).toBe(1);
  });

  test("different runSeeds at gen=0 produce different assignments", () => {
    const a = assignCriticsForGeneration({
      generationIndex: 0,
      runSeed: "seed-A",
      criticAgenomeIds: FIVE_CRITICS,
      everyNGenerations: 1,
    });
    const b = assignCriticsForGeneration({
      generationIndex: 0,
      runSeed: "seed-B",
      criticAgenomeIds: FIVE_CRITICS,
      everyNGenerations: 1,
    });
    expect(a).not.toEqual(b);
  });
});

describe("assignCriticsForGeneration — shape", () => {
  test("assignment carries exactly the 5 CriticMandate keys", () => {
    const { assignment } = assignCriticsForGeneration({
      generationIndex: 0,
      runSeed: "seed",
      criticAgenomeIds: FIVE_CRITICS,
      everyNGenerations: 1,
    });
    expect(Object.keys(assignment).sort()).toEqual([...CriticMandateValues].sort());
  });

  test("every assignment value is one of the provided criticAgenomeIds", () => {
    const { assignment } = assignCriticsForGeneration({
      generationIndex: 3,
      runSeed: "seed",
      criticAgenomeIds: FIVE_CRITICS,
      everyNGenerations: 2,
    });
    for (const value of Object.values(assignment)) {
      expect(FIVE_CRITICS).toContain(value);
    }
  });

  test("criticAgenomeIds.length < 5 produces duplicates without throwing", () => {
    const { assignment } = assignCriticsForGeneration({
      generationIndex: 0,
      runSeed: "seed",
      criticAgenomeIds: ["only_one"],
      everyNGenerations: 1,
    });
    for (const value of Object.values(assignment)) {
      expect(value).toBe("only_one");
    }
  });
});

describe("assignCriticsForGeneration — errors", () => {
  test("empty criticAgenomeIds throws RotationConfigError", () => {
    expect(() =>
      assignCriticsForGeneration({
        generationIndex: 0,
        runSeed: "seed",
        criticAgenomeIds: [],
        everyNGenerations: 1,
      }),
    ).toThrow(RotationConfigError);
  });

  test("N=0 throws", () => {
    expect(() =>
      assignCriticsForGeneration({
        generationIndex: 0,
        runSeed: "seed",
        criticAgenomeIds: FIVE_CRITICS,
        everyNGenerations: 0,
      }),
    ).toThrow(/everyNGenerations/);
  });

  test("N=9 throws (above max)", () => {
    expect(() =>
      assignCriticsForGeneration({
        generationIndex: 0,
        runSeed: "seed",
        criticAgenomeIds: FIVE_CRITICS,
        everyNGenerations: 9,
      }),
    ).toThrow(/everyNGenerations/);
  });

  test("negative generationIndex throws", () => {
    expect(() =>
      assignCriticsForGeneration({
        generationIndex: -1,
        runSeed: "seed",
        criticAgenomeIds: FIVE_CRITICS,
        everyNGenerations: 1,
      }),
    ).toThrow(/generationIndex/);
  });

  test("non-integer N throws", () => {
    expect(() =>
      assignCriticsForGeneration({
        generationIndex: 0,
        runSeed: "seed",
        criticAgenomeIds: FIVE_CRITICS,
        everyNGenerations: 1.5,
      }),
    ).toThrow(/everyNGenerations/);
  });
});

describe("assignCriticsForGeneration — boundary stability for N>1", () => {
  test("N=3: gens 0,1,2 share rotation; gen 3 rotates", () => {
    const g0 = assignCriticsForGeneration({
      generationIndex: 0,
      runSeed: "s",
      criticAgenomeIds: FIVE_CRITICS,
      everyNGenerations: 3,
    });
    const g1 = assignCriticsForGeneration({
      generationIndex: 1,
      runSeed: "s",
      criticAgenomeIds: FIVE_CRITICS,
      everyNGenerations: 3,
    });
    const g2 = assignCriticsForGeneration({
      generationIndex: 2,
      runSeed: "s",
      criticAgenomeIds: FIVE_CRITICS,
      everyNGenerations: 3,
    });
    const g3 = assignCriticsForGeneration({
      generationIndex: 3,
      runSeed: "s",
      criticAgenomeIds: FIVE_CRITICS,
      everyNGenerations: 3,
    });
    expect(g0).toEqual(g1);
    expect(g1).toEqual(g2);
    expect(g2).not.toEqual(g3);
    expect(g3.rotationGeneration).toBe(1);
  });
});
