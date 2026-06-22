/**
 * Sum of weights from SCORING_POLICY_V1 in
 * apps/api/src/selection/fitness/policy.ts. The api emits
 * fitness.scored.total in [0, MAX_FITNESS_V1] (4.1: critic 1 +
 * subtype_check 1 + novelty 1 + judge_acceptance 1 + energy_efficiency
 * 0.1). The dashboard normalizes to [0, 1] for display so users read
 * fitness as a 0–1 quality score instead of having to do the
 * "is 1.24 good?" math.
 *
 * If the api ever ships a policy v2 with different weights, the
 * fitness payload's policyVersion already tells the client which sum
 * to use — extend this into a lookup keyed by policyVersion at that
 * point.
 */
export const MAX_FITNESS_V1 = 4.1;

export function normalizeFitness(total: number): number {
  if (!Number.isFinite(total)) return 0;
  return Math.min(1, Math.max(0, total / MAX_FITNESS_V1));
}
