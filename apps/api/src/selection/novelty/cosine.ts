/**
 * Pure cosine + novelty math for the selection track (P5.2, ARCHITECTURE.md §8).
 *
 * No gateway, no IO, no `Math.random`/`Date` — deterministic over its inputs. This is what makes the
 * KEY SAFETY RULE #7 replay pin STRUCTURAL: on replay the novelty score is re-derived by reading the
 * PERSISTED vector (and the persisted comparison vectors) back through these functions — never by
 * re-embedding.
 */

/**
 * cosineSimilarity — the cosine of the angle between two equal-length vectors. Identical → 1,
 * orthogonal → 0. A zero-norm vector yields a DEFINED `0` (never `NaN`), so a degenerate embedding
 * can't poison the score. Unequal lengths THROW — one run shares one embedding model, hence one
 * dimension; a mismatch is a programming error, not a runtime-tolerable input.
 */
export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) {
    throw new Error(`cosineSimilarity: dimension mismatch (${a.length} vs ${b.length})`);
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const [i, ai] of a.entries()) {
    const bi = b[i] ?? 0; // i < a.length === b.length, so the default never triggers (satisfies noUncheckedIndexedAccess).
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * noveltyFromSimilarities — novelty = 1 − max(similarities): the nearest-neighbour distance (§8
 * anti-collapse). An empty set → `1.0`: the first candidate has no prior neighbour and is maximally
 * novel (no fabricated neighbour). Order-independent — `max` is symmetric over the set.
 */
export function noveltyFromSimilarities(similarities: readonly number[]): number {
  if (similarities.length === 0) {
    return 1;
  }
  const maxSimilarity = similarities.reduce((max, s) => (s > max ? s : max), -Infinity);
  return 1 - maxSimilarity;
}

/**
 * noveltyScoreOf — the replay-faithful entry: novelty of `vector` against a set of comparison
 * vectors. A pure composition of `cosineSimilarity` + `noveltyFromSimilarities`, so the recompute
 * path on replay invokes NO provider (rule #7).
 */
export function noveltyScoreOf(
  vector: readonly number[],
  comparisonVectors: readonly (readonly number[])[],
): number {
  return noveltyFromSimilarities(comparisonVectors.map((c) => cosineSimilarity(vector, c)));
}
