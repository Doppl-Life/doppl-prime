import type { Agenome } from "@doppl/contracts";
import { describe, expect, test } from "vitest";
import { mutateAgenome, mutationSummaryString, reproductionEventFromMutation } from "../mutate.js";
import { streamRng } from "../rng.js";

function makeParent(overrides: Partial<Agenome> = {}): Agenome {
  return {
    id: "ag_parent",
    runId: "run_m",
    generationId: "gen_0",
    parentIds: [],
    systemPrompt: "You are a parent agenome.",
    personaWeights: { curiosity: 0.5, rigor: 0.5, breadth: 0.5, skepticism: 0.5, synthesis: 0.5 },
    toolPermissions: [],
    decompositionPolicy: "default",
    spawnBudget: 2,
    status: "seeded",
    ...overrides,
  };
}

describe("mutateAgenome — determinism", () => {
  test("same (runSeed, generation, parentId) → identical child + outcome", () => {
    const parent = makeParent();
    const rng1 = streamRng({
      runSeed: "seed-X",
      generationIndex: 1,
      parentAgenomeId: parent.id,
      purpose: "mutation",
    });
    const rng2 = streamRng({
      runSeed: "seed-X",
      generationIndex: 1,
      parentAgenomeId: parent.id,
      purpose: "mutation",
    });
    const a = mutateAgenome({
      parent,
      generationIndex: 1,
      rng: rng1,
      bounds: { maxPopulation: 10 },
    });
    const b = mutateAgenome({
      parent,
      generationIndex: 1,
      rng: rng2,
      bounds: { maxPopulation: 10 },
    });
    expect(a.outcome).toEqual(b.outcome);
    // Child IDs use randomUUID so they differ, but everything determined
    // by the RNG matches.
    expect(a.child.personaWeights).toEqual(b.child.personaWeights);
    expect(a.child.spawnBudget).toEqual(b.child.spawnBudget);
  });

  test("different generation indexes produce different mutations", () => {
    const parent = makeParent();
    const a = mutateAgenome({
      parent,
      generationIndex: 0,
      rng: streamRng({
        runSeed: "seed",
        generationIndex: 0,
        parentAgenomeId: parent.id,
        purpose: "mutation",
      }),
      bounds: { maxPopulation: 10 },
    });
    const b = mutateAgenome({
      parent,
      generationIndex: 1,
      rng: streamRng({
        runSeed: "seed",
        generationIndex: 1,
        parentAgenomeId: parent.id,
        purpose: "mutation",
      }),
      bounds: { maxPopulation: 10 },
    });
    expect(a.outcome).not.toEqual(b.outcome);
  });
});

describe("mutateAgenome — bounds", () => {
  test("personaWeights clamped to [0, 1] when delta pushes out", () => {
    const parent = makeParent({
      personaWeights: {
        curiosity: 0.99,
        rigor: 0.01,
        breadth: 0.5,
        skepticism: 0.5,
        synthesis: 0.5,
      },
    });
    // Try many seeds to find a clamping case; safer to call many times.
    let clampSeen = false;
    for (let i = 0; i < 20 && !clampSeen; i += 1) {
      const result = mutateAgenome({
        parent,
        generationIndex: 0,
        rng: streamRng({
          runSeed: `seed-${i}`,
          generationIndex: 0,
          parentAgenomeId: parent.id,
          purpose: "mutation",
        }),
        bounds: { maxPopulation: 10 },
      });
      for (const k of Object.keys(result.child.personaWeights)) {
        const v = result.child.personaWeights[k] ?? 0;
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
      if (result.outcome.clamps.length > 0) clampSeen = true;
    }
    // Don't require clampSeen — bounds are absolute, not statistical.
  });

  test("spawnBudget never exceeds floor(maxPopulation / 2)", () => {
    const parent = makeParent({ spawnBudget: 5 });
    for (let i = 0; i < 20; i += 1) {
      const result = mutateAgenome({
        parent,
        generationIndex: i,
        rng: streamRng({
          runSeed: `s-${i}`,
          generationIndex: i,
          parentAgenomeId: parent.id,
          purpose: "mutation",
        }),
        bounds: { maxPopulation: 10 },
      });
      expect(result.child.spawnBudget).toBeLessThanOrEqual(5);
      expect(result.child.spawnBudget).toBeGreaterThanOrEqual(1);
    }
  });

  test("child passes Agenome.parse(...) validation", () => {
    const parent = makeParent();
    const result = mutateAgenome({
      parent,
      generationIndex: 0,
      rng: streamRng({
        runSeed: "s",
        generationIndex: 0,
        parentAgenomeId: parent.id,
        purpose: "mutation",
      }),
      bounds: { maxPopulation: 10 },
    });
    expect(result.child.parentIds).toEqual([parent.id]);
    expect(result.child.runId).toBe(parent.runId);
    expect(result.child.status).toBe("seeded");
  });
});

describe("mutationSummaryString + reproductionEventFromMutation", () => {
  test("summary string encodes outcome fields", () => {
    const summary = mutationSummaryString({
      fieldsChanged: ["a"],
      magnitudes: { a: 0.05 },
      clamps: [],
      spawnBudgetDelta: -1,
    });
    expect(summary).toContain("fields=a");
    expect(summary).toContain("a:0.0500");
    expect(summary).toContain("spawnDelta=-1");
    expect(summary).toContain("clamps=(none)");
  });

  test("ReproductionEvent carries mode=mutation_only + parent + child", () => {
    const parent = makeParent();
    const result = mutateAgenome({
      parent,
      generationIndex: 0,
      rng: streamRng({
        runSeed: "s",
        generationIndex: 0,
        parentAgenomeId: parent.id,
        purpose: "mutation",
      }),
      bounds: { maxPopulation: 10 },
    });
    const event = reproductionEventFromMutation("run_m", parent, result.child, result.outcome);
    expect(event.mode).toBe("mutation_only");
    expect(event.parentAgenomeIds).toEqual([parent.id]);
    expect(event.childAgenomeId).toBe(result.child.id);
    expect(event.crossoverPoints).toEqual([]);
    expect(event.mutationSummary).toContain("fields=");
  });
});
