import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validRunConfig } from '@doppl/contracts';
import { createSeededRng, readRngSeed } from '../../../../src/runtime/rng/seededRng';

/**
 * P3.6 seeded RNG (ARCHITECTURE.md §4/§5, KEY SAFETY RULE #7). The kernel's SINGLE deterministic PRNG
 * derived from the per-run `RunConfig.rngSeed` (persisted in `run.configured`). Pure-JS, no ambient
 * nondeterminism; same seed → identical draw sequence (the cross-machine replay byte-stability §4 rests on).
 */

const SEEDED_RNG_SRC = fileURLToPath(
  new URL('../../../../src/runtime/rng/seededRng.ts', import.meta.url),
);

function firstN(seed: number, n: number): number[] {
  const rng = createSeededRng(seed);
  return Array.from({ length: n }, () => rng.nextUint32());
}

describe('createSeededRng (P3.6)', () => {
  test('same_seed_yields_identical_sequence', () => {
    // spec(§4): two independent instances, same seed → byte-identical sampling sequence (replay determinism).
    expect(firstN(42, 16)).toEqual(firstN(42, 16));
  });

  test('different_seed_diverges', () => {
    // sanity: the seed actually drives state — not a constant/ignored-seed generator.
    expect(firstN(42, 16)).not.toEqual(firstN(43, 16));
  });

  test('seed_normalized_deterministically', () => {
    // spec(§4): rngSeed is z.int().nonnegative() (unbounded above); a seed outside the PRNG's native
    // domain maps to a STABLE, repeatable internal state (same big seed → same sequence every construction).
    const big = 2 ** 32 + 7;
    expect(firstN(big, 16)).toEqual(firstN(big, 16));
  });

  test('readRngSeed_extracts_from_run_config', () => {
    // spec(§4) spec(§5): the kernel derives sampling from the numeric rngSeed persisted in run.configured —
    // NOT RunConfig.seed (the problem-scenario STRING). Round-trips the canonical run.configured-shaped config.
    expect(readRngSeed(validRunConfig)).toBe(validRunConfig.rngSeed);
    expect(typeof readRngSeed(validRunConfig)).toBe('number');
    // the extracted seed drives the deterministic stream (it IS the PRNG seed, end-to-end).
    expect(firstN(readRngSeed(validRunConfig), 4)).toEqual(firstN(validRunConfig.rngSeed, 4));
  });

  test('prng_uses_no_ambient_nondeterminism', () => {
    // rule #7 + "single seeded source": the module uses no Math.random/crypto/Date/provider seam — so
    // determinism holds by construction (verified by reading the import/usage surface, like lesson §30).
    const src = readFileSync(SEEDED_RNG_SRC, 'utf8');
    expect(src).not.toMatch(/Math\.random/);
    expect(src).not.toMatch(/\bcrypto\b/);
    expect(src).not.toMatch(/\bDate\b/);
    expect(src).not.toMatch(/from ['"][^'"]*(openai|@anthropic-ai|openrouter|gateway|provider)/);
  });
});
