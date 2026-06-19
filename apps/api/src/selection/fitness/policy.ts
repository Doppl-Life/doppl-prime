import type { ScoringPolicy } from "@doppl/contracts";

/**
 * Scoring policy v1 (P5.6, D3). Equal weights for the four primary
 * signals + a small energy-efficiency tiebreak. Phase 7 dashboard
 * surfaces `policyVersion`; bumping the values flips the version so
 * scores under different policies stay comparable across generations.
 *
 * Component normalization (D4):
 *  - critic               ∈ [0, 1]
 *  - subtype_check        ∈ [0, 1]
 *  - novelty              ∈ [0, 1]   (mapped from cosine distance [0,2] via /2)
 *  - judge_acceptance     ∈ [0, 1]   (judge total / 25; null when absent)
 *  - energy_efficiency    ∈ (0, 1]   (1 / (1 + spend))
 *
 * Total range: `[0, 4.1]` when all components present; lower when judge
 * is absent (its slot drops to 0 contribution).
 */

export const SCORING_POLICY_V1: ScoringPolicy = {
  version: "v1",
  weights: {
    critic: 1.0,
    subtype_check: 1.0,
    novelty: 1.0,
    judge_acceptance: 1.0,
    energy_efficiency: 0.1,
  },
};

/**
 * Component values keyed by name. Values must be `[0, 1]`. `null` skips
 * the component (treated as 0 in the total; the explanation flags it).
 */
export type FitnessComponents = Record<string, number | null>;

export interface AppliedPolicy {
  total: number;
  /** Per-name contribution (weight × raw value). Excludes nulls. */
  componentTotals: Record<string, number>;
  explanation: string;
}

export function applyPolicy(policy: ScoringPolicy, components: FitnessComponents): AppliedPolicy {
  let total = 0;
  const componentTotals: Record<string, number> = {};
  const lines: string[] = [];

  // Iterate over the policy's known weight keys so a component the
  // policy doesn't know about is silently ignored (the policyVersion is
  // the authority on which components count).
  for (const name of Object.keys(policy.weights).sort()) {
    const weight = policy.weights[name] ?? 0;
    const raw = components[name];
    if (raw === null || raw === undefined) {
      lines.push(`${name}: raw=null weight=${weight.toFixed(2)} contrib=0 (not present)`);
      continue;
    }
    const contrib = raw * weight;
    componentTotals[name] = contrib;
    total += contrib;
    lines.push(
      `${name}: raw=${raw.toFixed(3)} weight=${weight.toFixed(2)} contrib=${contrib.toFixed(3)}`,
    );
  }
  lines.push(`total=${total.toFixed(3)} policyVersion=${policy.version}`);

  return {
    total,
    componentTotals,
    explanation: lines.join("\n"),
  };
}
