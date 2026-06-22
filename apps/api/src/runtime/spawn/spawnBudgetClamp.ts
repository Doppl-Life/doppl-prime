/**
 * P3.9 — the spawnBudget clamp (ARCHITECTURE.md §5, KEY SAFETY RULE #1). A PURE decision: `spawnBudget`
 * is an allocation HINT, clamped to the remaining population headroom so it can NEVER raise the cap —
 * `effectiveSpawns = min(spawnBudget, max(0, remainingPopulation))`. The clamp reads ONLY the two scalar
 * inputs (the hint + the remaining population), so nothing else can widen the result by shape (rule #1).
 *
 * Decision only: when `clamped`, the spawn caller (the gen-0 seed spawn / reproduction dispatch, P3.10)
 * appends the clamp-decision event (§5 ownership split; lesson §33). Population headroom only — the
 * spawn-DEPTH ceiling is a separate gate via the P3.4 cap enforcer, not folded in here.
 */

export interface SpawnClampResult {
  /** The spawns actually permitted — `min(spawnBudget, max(0, remainingPopulation))`. */
  readonly effectiveSpawns: number;
  /** True when the hint was reduced below `spawnBudget` (the caller emits the clamp-decision event). */
  readonly clamped: boolean;
}

/**
 * Clamp a `spawnBudget` hint to the remaining population headroom. Pure: same inputs → same result.
 */
export function clampSpawnBudget(
  spawnBudget: number,
  remainingPopulation: number,
): SpawnClampResult {
  const headroom = Math.max(0, remainingPopulation);
  const effectiveSpawns = Math.min(spawnBudget, headroom);
  return { effectiveSpawns, clamped: effectiveSpawns < spawnBudget };
}
