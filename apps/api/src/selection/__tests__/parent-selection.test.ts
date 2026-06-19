import type { FitnessScore } from "@doppl/contracts";
import { describe, expect, test } from "vitest";
import { createSeededRng } from "../../runtime/rng.js";
import { type RankableCandidate, selectParents } from "../parent-selection.js";

function makeFit(total: number, id = "f"): FitnessScore {
  return {
    id,
    candidateId: id,
    total,
    components: {},
    policyVersion: "v1",
    explanation: "",
  };
}

function makeRankable(
  candidateId: string,
  agenomeId: string,
  fitness: number,
  novelty: number,
  energy: number,
): RankableCandidate {
  return {
    candidateId,
    agenomeId,
    fitness: makeFit(fitness, candidateId),
    noveltyScore: novelty,
    energyEfficiency: energy,
  };
}

describe("selectParents", () => {
  test("k=0 → empty result", () => {
    const rng = createSeededRng("s");
    const out = selectParents({
      candidates: [makeRankable("c1", "a1", 1, 1, 1)],
      k: 0,
      rng,
    });
    expect(out).toEqual([]);
  });

  test("empty candidates → empty result", () => {
    const rng = createSeededRng("s");
    const out = selectParents({ candidates: [], k: 3, rng });
    expect(out).toEqual([]);
  });

  test("k=2 picks top by fitness × novelty × energy", () => {
    const rng = createSeededRng("s");
    const out = selectParents({
      candidates: [
        makeRankable("low", "a1", 1.0, 0, 1.0),
        makeRankable("mid", "a2", 1.5, 2.0, 0.5),
        makeRankable("high", "a3", 2.0, 2.0, 1.0),
      ],
      k: 2,
      rng,
    });
    expect(out[0]?.candidateId).toBe("high");
    expect(out[1]?.candidateId).toBe("mid");
  });

  test("ties beyond lexicographic chain resolved by rng.choose deterministically", () => {
    const cands: RankableCandidate[] = [
      makeRankable("a", "ag1", 1, 2, 1),
      makeRankable("b", "ag2", 1, 2, 1),
      makeRankable("c", "ag3", 1, 2, 1),
      makeRankable("d", "ag4", 1, 2, 1),
    ];
    const firstRun = selectParents({ candidates: cands, k: 2, rng: createSeededRng("seedA") });
    const secondRun = selectParents({ candidates: cands, k: 2, rng: createSeededRng("seedA") });
    expect(firstRun.map((c) => c.candidateId)).toEqual(secondRun.map((c) => c.candidateId));
  });

  test("different seeds may select different ties", () => {
    const cands: RankableCandidate[] = [
      makeRankable("a", "ag1", 1, 2, 1),
      makeRankable("b", "ag2", 1, 2, 1),
      makeRankable("c", "ag3", 1, 2, 1),
      makeRankable("d", "ag4", 1, 2, 1),
    ];
    const runA = selectParents({ candidates: cands, k: 2, rng: createSeededRng("X") });
    const runB = selectParents({ candidates: cands, k: 2, rng: createSeededRng("Y") });
    // Possible they coincide; just assert determinism within a seed
    expect(runA.length).toBe(2);
    expect(runB.length).toBe(2);
  });

  test("k larger than population → returns the whole population", () => {
    const rng = createSeededRng("s");
    const out = selectParents({
      candidates: [makeRankable("a", "ag1", 1, 2, 1), makeRankable("b", "ag2", 2, 2, 1)],
      k: 5,
      rng,
    });
    expect(out).toHaveLength(2);
  });

  test("novelty score of 0 zeros out the ranking weight", () => {
    const rng = createSeededRng("s");
    const out = selectParents({
      candidates: [makeRankable("a", "ag1", 10, 0, 1), makeRankable("b", "ag2", 1, 2, 1)],
      k: 1,
      rng,
    });
    expect(out[0]?.candidateId).toBe("b");
  });
});
