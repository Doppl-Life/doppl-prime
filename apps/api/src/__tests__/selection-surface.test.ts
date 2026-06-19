import { describe, expect, test } from "vitest";
import * as api from "../index.js";

/**
 * Phase 5 §2.5 acceptance gate at the package boundary. Every export
 * Phase 6 (HTTP/SSE) and Phase 7 (dashboard) will import from
 * `@doppl/api` for the selection path is listed here.
 */
const REQUIRED_SELECTION_EXPORTS = [
  // Novelty
  "scoreCandidateNovelty",
  "cosineDistance",
  "cosineSimilarity",
  "CosineMathError",
  "embedCandidate",
  "EmbedError",
  "charNGramSet",
  "jaccardDistance",
  "jaccardSimilarity",
  // Components
  "energyEfficiencyForAgenome",
  "criticScoreForCandidate",
  "subtypeCheckScoreForCandidate",
  "judgeAcceptanceForCandidate",
  // Fitness
  "SCORING_POLICY_V1",
  "applyPolicy",
  "scoreFitness",
  // Cull + selection
  "cullWeakLineages",
  "selectParents",
  // Reproduction
  "mutateAgenome",
  "mutationSummaryString",
  "reproductionEventFromMutation",
  "streamRng",
  "crossoverAgenomes",
  "synthesizeFusedPrompt",
  "parentDistance",
  "fuseAgenomes",
  "reproduceMutationOnly",
  "reproduceWithFallback",
  // Allocation + successor
  "clampBudget",
  "normalizeWeights",
  "allocateSuccessorBudget",
  "assembleSuccessorPopulation",
  // Factories
  "makeScoreHook",
  "makeReproduceHook",
] as const;

describe("spec(§2.5) @doppl/api selection surface", () => {
  for (const name of REQUIRED_SELECTION_EXPORTS) {
    test(`exports ${name}`, () => {
      expect(api).toHaveProperty(name);
      expect((api as unknown as Record<string, unknown>)[name]).toBeDefined();
    });
  }

  test("no private helper leaks", () => {
    const exported = new Set(Object.keys(api));
    expect(exported.has("meanCosineDistance")).toBe(false);
    expect(exported.has("meanJaccardDistance")).toBe(false);
    expect(exported.has("findLatestNoveltyVector")).toBe(false);
    expect(exported.has("readFitnessForCandidates")).toBe(false);
    expect(exported.has("spliceMap")).toBe(false);
    expect(exported.has("spliceArray")).toBe(false);
  });

  test("SCORING_POLICY_V1 has version='v1' with the pinned weights (D3)", () => {
    const policy = (
      api as unknown as Record<string, { version: string; weights: Record<string, number> }>
    ).SCORING_POLICY_V1;
    expect(policy?.version).toBe("v1");
    expect(policy?.weights.critic).toBe(1);
    expect(policy?.weights.subtype_check).toBe(1);
    expect(policy?.weights.novelty).toBe(1);
    expect(policy?.weights.judge_acceptance).toBe(1);
    expect(policy?.weights.energy_efficiency).toBe(0.1);
  });
});
