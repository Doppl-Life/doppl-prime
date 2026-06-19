import type { Agenome } from "@doppl/contracts";
import { describe, expect, test } from "vitest";
import { createSeededRng } from "../../../runtime/rng.js";
import { crossoverAgenomes } from "../crossover.js";

function makeParent(overrides: Partial<Agenome>): Agenome {
  return {
    id: "ag",
    runId: "run",
    generationId: "gen_0",
    parentIds: [],
    systemPrompt: "default prompt",
    personaWeights: { curiosity: 0.5, rigor: 0.5 },
    toolPermissions: ["tool_a"],
    decompositionPolicy: "default",
    spawnBudget: 1,
    status: "seeded",
    ...overrides,
  };
}

describe("crossoverAgenomes", () => {
  test("deterministic under same seed", () => {
    const a = makeParent({ id: "A" });
    const b = makeParent({ id: "B" });
    const x = crossoverAgenomes({ parentA: a, parentB: b, rng: createSeededRng("s") });
    const y = crossoverAgenomes({ parentA: a, parentB: b, rng: createSeededRng("s") });
    expect(x).toEqual(y);
  });

  test("systemPrompt + decompositionPolicy come from parentA (higher fitness)", () => {
    const a = makeParent({
      id: "A",
      systemPrompt: "from A",
      decompositionPolicy: "policyA",
    });
    const b = makeParent({
      id: "B",
      systemPrompt: "from B",
      decompositionPolicy: "policyB",
    });
    const out = crossoverAgenomes({ parentA: a, parentB: b, rng: createSeededRng("s") });
    expect(out.systemPrompt).toBe("from A");
    expect(out.decompositionPolicy).toBe("policyA");
  });

  test("personaWeights union covers all keys from both parents", () => {
    const a = makeParent({ id: "A", personaWeights: { curiosity: 0.1, breadth: 0.2 } });
    const b = makeParent({ id: "B", personaWeights: { rigor: 0.7, breadth: 0.9 } });
    const out = crossoverAgenomes({ parentA: a, parentB: b, rng: createSeededRng("s") });
    expect(Object.keys(out.personaWeights).sort()).toEqual(["breadth", "curiosity", "rigor"]);
  });

  test("crossoverPoints records which fields came from parentB", () => {
    const a = makeParent({ id: "A" });
    const b = makeParent({ id: "B", personaWeights: { curiosity: 0.99, rigor: 0.99 } });
    const out = crossoverAgenomes({ parentA: a, parentB: b, rng: createSeededRng("seedX") });
    for (const p of out.crossoverPoints) {
      expect(p).toMatch(/^(personaWeights|toolPermissions)\./);
    }
  });

  test("toolPermissions in common to both parents are inherited (both)", () => {
    const a = makeParent({ id: "A", toolPermissions: ["tool_a", "tool_b"] });
    const b = makeParent({ id: "B", toolPermissions: ["tool_a", "tool_c"] });
    const out = crossoverAgenomes({ parentA: a, parentB: b, rng: createSeededRng("s") });
    expect(out.toolPermissions).toContain("tool_a");
  });
});
