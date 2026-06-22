/**
 * Effective max of SCORING_POLICY_V1 against the live pipeline.
 *
 * The on-paper max from apps/api/src/selection/fitness/policy.ts is
 * 4.1 (critic 1 + subtype_check 1 + novelty 1 + judge_acceptance 1 +
 * energy_efficiency 0.1). But the judge-acceptance runner isn't
 * wired into live-process-run today, so every fitness.scored payload
 * leaves `judge_acceptance: null` and the realistic ceiling is 3.1.
 * Dividing by 4.1 made the dashboard's "Score 1.24 / 1" normalize to
 * a deflated 0.30 — penalizing every candidate by an entire 1.0
 * weight that nothing was ever contributing to.
 *
 * When the judge runner ships, bump this back to 4.1 (or, better,
 * compute the denominator dynamically from the fitness payload's
 * `components` map so future policy changes don't need a web edit).
 *
 * The fitness payload's `policyVersion` field is the right key for
 * a future lookup if multiple policies start coexisting.
 */
export const MAX_FITNESS_V1 = 3.1;

export function normalizeFitness(total: number): number {
  if (!Number.isFinite(total)) return 0;
  return Math.min(1, Math.max(0, total / MAX_FITNESS_V1));
}
