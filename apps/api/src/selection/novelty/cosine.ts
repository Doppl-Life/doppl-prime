/**
 * Pure cosine math used by Phase 5 novelty scoring (P5.2). Deterministic
 * floating-point ops; the iteration order of consumers is the only
 * source of non-determinism, so callers persist their `comparisonSet`
 * order into `NoveltyScore.comparisonSet` (Phase 5 D7 invariant).
 */

export class CosineMathError extends Error {
  constructor(reason: string) {
    super(`cosine: ${reason}`);
    this.name = "CosineMathError";
  }
}

function dot(a: readonly number[], b: readonly number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i += 1) {
    s += (a[i] ?? 0) * (b[i] ?? 0);
  }
  return s;
}

function magnitude(v: readonly number[]): number {
  let s = 0;
  for (let i = 0; i < v.length; i += 1) {
    const x = v[i] ?? 0;
    s += x * x;
  }
  return Math.sqrt(s);
}

export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) {
    throw new CosineMathError(`dimension mismatch: ${a.length} vs ${b.length}`);
  }
  const ma = magnitude(a);
  const mb = magnitude(b);
  if (ma === 0 || mb === 0) {
    throw new CosineMathError("zero-magnitude vector");
  }
  return dot(a, b) / (ma * mb);
}

export function cosineDistance(a: readonly number[], b: readonly number[]): number {
  return 1 - cosineSimilarity(a, b);
}
