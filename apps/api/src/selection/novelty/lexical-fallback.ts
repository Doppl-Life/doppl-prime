/**
 * Lexical novelty fallback (P5.3, D2). Character 3-gram Jaccard.
 * Deterministic, replay-safe, no dep. Used when embedding fails after
 * the bounded retry. NoveltyScore.method records "lexical_char3gram_
 * jaccard" so the Phase 7 dashboard can flag the candidate as
 * estimated.
 */

const DEFAULT_N = 3;

export function charNGramSet(text: string, n: number = DEFAULT_N): Set<string> {
  if (!Number.isInteger(n) || n < 1) {
    throw new RangeError(`charNGramSet: n must be a positive integer (got ${n})`);
  }
  const folded = text.toLowerCase();
  if (folded.length < n) {
    // Single token containing the whole string — pads up to n with spaces
    // so that very short inputs still produce a Jaccard-comparable set.
    return new Set([folded.padEnd(n, " ")]);
  }
  const set = new Set<string>();
  for (let i = 0; i <= folded.length - n; i += 1) {
    set.add(folded.slice(i, i + n));
  }
  return set;
}

export function jaccardSimilarity(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const t of a) {
    if (b.has(t)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  if (union === 0) return 1;
  return intersection / union;
}

export function jaccardDistance(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  return 1 - jaccardSimilarity(a, b);
}
