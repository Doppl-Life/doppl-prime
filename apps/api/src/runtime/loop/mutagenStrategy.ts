import { GenerationOperator } from '@doppl/contracts';

/**
 * EXPERIMENT (mutagen-dynamics bake-off) — the parameterized mutation/mutagen strategy under test, gated
 * by `DOPPL_MUTATION_STRATEGY`. Lives in `runtime/` (not `selection/`) because both the boot config loader
 * (runtime) and the generation loop (runtime) read it, and `runtime` may not import `selection` (layering).
 * It carries NO rng — the rng-using per-slot r/K decision is `selection/reproduction/mutationSlot` (which
 * may import downward). The point is to test which dynamics breed the better surfaced node, not to
 * pre-decide the design:
 *
 *  - `fusion_only`   (control) — every offspring is a two-parent fusion; mutation never fires; the lens is
 *                                the run-level operator set. == current HEAD behavior.
 *  - `mutate_static` — a per-slot r/K split: a fraction of offspring are CHEAP single-parent mutations (r),
 *                       the rest two-parent fusions (K). Lens = run-level operators.
 *  - `mutate_lens`   — same r/K split, but each agenome ideates under its OWN heritable mutagen lens (its
 *                       `personaWeights` `lens.<operator>` entries — mutation drifts them, fusion blends them).
 *  - `adaptive`      — `mutate_lens` PLUS a convergence-driven controller that raises the mutation fraction
 *                       when the population converges and lowers it when it diverges (emergent, bidirectional).
 *
 * Rule #1/#6 untouched: mutation/fusion stay kernel-bounded and the held-out judge never sees a lens.
 */

export const MUTATION_STRATEGIES = [
  'fusion_only',
  'mutate_static',
  'mutate_lens',
  'adaptive',
] as const;
export type MutationStrategy = (typeof MUTATION_STRATEGIES)[number];

export const DEFAULT_MUTATION_STRATEGY: MutationStrategy = 'fusion_only';

export function parseMutationStrategy(raw: string | undefined): MutationStrategy {
  return MUTATION_STRATEGIES.includes(raw as MutationStrategy)
    ? (raw as MutationStrategy)
    : DEFAULT_MUTATION_STRATEGY;
}

export interface MutationStrategyParams {
  /** Whether single-parent mutation offspring are produced at all (false → all fusion, the control). */
  readonly usesMutation: boolean;
  /** Whether each agenome ideates under its OWN heritable lens (from personaWeights) vs the run-level set. */
  readonly usesPerAgenomeLens: boolean;
  /** Whether the mutation fraction is driven by the per-generation convergence measure (emergent). */
  readonly usesAdaptiveFraction: boolean;
  /** The baseline share of offspring slots produced by mutation (the r/K balance) when not adaptive. */
  readonly baseMutationFraction: number;
}

const BASE_FRACTION = 1 / 3;

export function strategyParams(strategy: MutationStrategy): MutationStrategyParams {
  switch (strategy) {
    case 'fusion_only':
      return {
        usesMutation: false,
        usesPerAgenomeLens: false,
        usesAdaptiveFraction: false,
        baseMutationFraction: 0,
      };
    case 'mutate_static':
      return {
        usesMutation: true,
        usesPerAgenomeLens: false,
        usesAdaptiveFraction: false,
        baseMutationFraction: BASE_FRACTION,
      };
    case 'mutate_lens':
      return {
        usesMutation: true,
        usesPerAgenomeLens: true,
        usesAdaptiveFraction: false,
        baseMutationFraction: BASE_FRACTION,
      };
    case 'adaptive':
      return {
        usesMutation: true,
        usesPerAgenomeLens: true,
        usesAdaptiveFraction: true,
        baseMutationFraction: BASE_FRACTION,
      };
  }
}

/** The personaWeights key prefix that marks a mutagen-lens weight (vs an ordinary persona weight). */
export const LENS_PREFIX = 'lens.';

/**
 * Extract an agenome's mutagen lens from its `personaWeights`: every `lens.<operator>` whose weight clears
 * `threshold`, in the GenerationOperator enum's canonical order (deterministic). An out-of-enum suffix is
 * ignored. Returns `[]` when the agenome carries no (clearing) lens → the caller falls back to the run-level
 * operators, byte-identical to the pre-experiment framing.
 */
export function agenomeLens(
  personaWeights: Readonly<Record<string, number>>,
  threshold = 0.5,
): GenerationOperator[] {
  const valid = new Set<string>(GenerationOperator.options);
  const selected = new Set<string>();
  for (const [key, weight] of Object.entries(personaWeights)) {
    if (!key.startsWith(LENS_PREFIX)) continue;
    const op = key.slice(LENS_PREFIX.length);
    if (valid.has(op) && weight >= threshold) selected.add(op);
  }
  return GenerationOperator.options.filter((op) => selected.has(op));
}
