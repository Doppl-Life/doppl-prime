import { createRng } from './rng';

/**
 * EXPERIMENT — the pure seeded r/K decision for ONE offspring slot: is it a single-parent MUTATION (r) or
 * a two-parent FUSION (K)? Deterministic over the slot seed (replay reads the recorded
 * `ReproductionEvent.mode`, so this is live-only). `fraction <= 0` → never mutate (fusion_only / a
 * controller that pulled the fraction to 0); `fraction >= 1` → always mutate; a single-parent pool always
 * mutates (no partner to fuse with). Lives in `selection` (uses the selection rng); the strategy params +
 * lens live in `runtime/loop/mutagenStrategy` (rng-free, importable downward).
 */
export function isMutationSlot(
  fraction: number,
  slotSeed: number,
  distinctParents: number,
): boolean {
  if (distinctParents < 2) return true;
  if (fraction <= 0) return false;
  if (fraction >= 1) return true;
  return createRng(slotSeed >>> 0).nextFloat() < fraction;
}
