/**
 * Deterministic seeded PRNG for reproduction (P5.8, ARCHITECTURE.md §4/§8).
 *
 * mulberry32 — a pure, fast 32-bit generator: same seed → identical sequence, so the live mutation
 * sampling stream is reproducible. Replay never re-runs it (it reads the persisted `mutationSummary` —
 * KEY SAFETY RULE #7); determinism keeps the live path itself byte-reproducible (no `Math.random` /
 * `Date.now`, LESSONS §24).
 */
export interface Rng {
  /** Next float in [0, 1). */
  nextFloat(): number;
  /** Next integer in [0, maxExclusive). */
  nextInt(maxExclusive: number): number;
  /** A uniformly-picked member of a NON-EMPTY array. */
  pick<T>(items: readonly T[]): T;
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;

  const nextFloat = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const nextInt = (maxExclusive: number): number => Math.floor(nextFloat() * maxExclusive);

  const pick = <T>(items: readonly T[]): T => items[nextInt(items.length)] as T;

  return { nextFloat, nextInt, pick };
}
