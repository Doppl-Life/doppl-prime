import seedrandom from "seedrandom";

/**
 * Seeded RNG wrapping `seedrandom` 3.x (P3.6). Per ARCHITECTURE.md §4
 * RNG capture: the consumed values (mutations, crossover points, etc.)
 * are persisted as the payload of the event that consumed them, so
 * replay reads the stored outcome rather than reseeding mid-run. THIS
 * wrapper exists to make every initial draw deterministic given a fixed
 * `seed`.
 *
 * The package version (`seedrandom@3.0.5`) IS the replay contract —
 * any version bump needs a deliberate equivalence audit.
 */
export interface SeededRng {
  /** A float in [0, 1). */
  next(): number;
  /** An integer in [min, max] inclusive. */
  nextInt(min: number, max: number): number;
  /** Pick one element from a non-empty array. */
  choose<T>(arr: readonly T[]): T;
  /** The seed string this instance was constructed with. */
  readonly seed: string;
}

export function createSeededRng(seed: string): SeededRng {
  const rng = seedrandom(seed);
  return {
    next(): number {
      return rng();
    },
    nextInt(min: number, max: number): number {
      if (min > max) {
        throw new Error(`nextInt: min (${min}) > max (${max})`);
      }
      const range = max - min + 1;
      return Math.floor(rng() * range) + min;
    },
    choose<T>(arr: readonly T[]): T {
      if (arr.length === 0) {
        throw new Error("choose: cannot choose from an empty array");
      }
      const idx = Math.floor(rng() * arr.length);
      return arr[idx] as T;
    },
    seed,
  };
}
