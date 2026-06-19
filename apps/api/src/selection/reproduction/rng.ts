import { type SeededRng, createSeededRng } from "../../runtime/rng.js";

/**
 * Per-mutation seeded RNG derivation (P5.8). Mutation and fusion both
 * pull random outcomes from per-parent, per-generation streams. By
 * deriving the stream key from `runSeed + generationIndex + parentId +
 * purpose`, two effects fall out:
 *  - replay reproduces identical mutations from persisted seed alone
 *  - parallel mutation of two parents in the same generation can't
 *    collide (different parent IDs → different streams)
 */

export interface RngStreamKey {
  runSeed: string;
  generationIndex: number;
  parentAgenomeId: string;
  purpose: "mutation" | "fusion" | "crossover" | "output_synthesis";
}

export function streamRng(key: RngStreamKey): SeededRng {
  return createSeededRng(
    `${key.runSeed}:${key.purpose}:gen=${key.generationIndex}:parent=${key.parentAgenomeId}`,
  );
}
