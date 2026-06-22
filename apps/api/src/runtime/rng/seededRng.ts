import type { RunConfig } from '@doppl/contracts';

/**
 * P3.6 — the kernel's SINGLE seeded PRNG (ARCHITECTURE.md §4/§5, KEY SAFETY RULE #7).
 *
 * One deterministic, pure-JS generator derived from the per-run `RunConfig.rngSeed` (frozen P0.3,
 * persisted in `run.configured`). Every kernel non-deterministic decision (mutation field selection +
 * magnitudes, parent-selection tie-breaks, fusion crossover points, any sampling) draws from THIS source
 * so the run is reproducible: two runs with the same seed + same inputs produce identical sampling
 * sequences (§4). It reads only its own seeded integer state — no ambient OS randomness, no system
 * clock, no cryptographic or provider/model/web seam — so determinism holds by construction (ad-hoc
 * ambient randomness in lifecycle code is excluded from kernel decision-making).
 *
 * Algorithm: **mulberry32** — a 32-bit-state generator (pure integer ops via `Math.imul` + one
 * IEEE-754 double division for `nextFloat`), byte-stable across V8 platforms with zero deps. The seed is
 * normalized to the uint32 state via `seed >>> 0` (deterministic). `RunConfig.rngSeed` is a nonnegative
 * int unbounded above; a seed ≥ 2³² wraps to a STABLE, repeatable state — documented here, never a
 * silent runtime collision. The concrete algorithm + normalization are the cross-machine byte-stability
 * guarantee replay rests on; a future swap of the generator would invalidate older persisted replays.
 */

export interface SeededRng {
  /** Next raw 32-bit unsigned integer in `[0, 2³²)`. */
  nextUint32(): number;
  /** Next float in `[0, 1)` (uint32 / 2³²). */
  nextFloat(): number;
  /** Integer in `[loInclusive, hiExclusive)`. */
  nextInt(loInclusive: number, hiExclusive: number): number;
}

/**
 * Construct the deterministic seeded PRNG. Same `seed` → identical draw sequence across independent
 * instances. `seed >>> 0` maps any nonnegative int to the 32-bit state (deterministic, repeatable).
 */
export function createSeededRng(seed: number): SeededRng {
  let state = seed >>> 0;
  const nextUint32 = (): number => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  };
  const nextFloat = (): number => nextUint32() / 0x1_0000_0000;
  const nextInt = (loInclusive: number, hiExclusive: number): number =>
    loInclusive + Math.floor(nextFloat() * (hiExclusive - loInclusive));
  return { nextUint32, nextFloat, nextInt };
}

/**
 * Extract the numeric PRNG seed from the frozen `RunConfig` (the `run.configured` payload). Pins that the
 * kernel derives all sampling from the seed PERSISTED in `run.configured` — `rngSeed` — NOT the opaque
 * `RunConfig.seed` problem-scenario STRING, and never a fresh/ambient seed.
 */
export function readRngSeed(runConfig: RunConfig): number {
  return runConfig.rngSeed;
}
