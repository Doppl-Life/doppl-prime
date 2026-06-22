import { noveltyFromSimilarities } from './cosine';

/**
 * Deterministic lexical novelty (P5.3, ARCHITECTURE.md §8/§5) — the secondary novelty method used
 * when embedding fails. Pure over summary TEXT (token-set Jaccard), so the degrade path is
 * replay-faithful (KEY SAFETY RULE #7): replay recomputes the identical estimate from persisted
 * summaries and never calls a provider.
 */

/** Lowercased word-token set — deterministic, punctuation-insensitive. */
function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 0),
  );
}

/**
 * jaccardSimilarity — |A ∩ B| / |A ∪ B| over token sets. Two empty sets → 1 (identical-empty);
 * otherwise the union is ≥ 1, so there is no divide-by-zero. Range [0, 1].
 */
export function jaccardSimilarity(a: string, b: string): number {
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 && setB.size === 0) {
    return 1;
  }
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) {
      intersection += 1;
    }
  }
  const union = setA.size + setB.size - intersection;
  return intersection / union;
}

/**
 * lexicalNoveltyScore — novelty = 1 − max Jaccard over the comparison summaries (mirrors the cosine
 * aggregation shape). Empty comparison → 1.0 (first-candidate boundary). Order-independent.
 */
export function lexicalNoveltyScore(
  summary: string,
  comparisonSummaries: readonly string[],
): number {
  return noveltyFromSimilarities(comparisonSummaries.map((c) => jaccardSimilarity(summary, c)));
}
