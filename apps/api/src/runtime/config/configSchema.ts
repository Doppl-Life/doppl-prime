import { z } from 'zod';
import { RunCaps, ScoringPolicy } from '@doppl/contracts';
import type { RegistryConfig } from '../../model-gateway/config.schema';
import { DEFAULT_MODEL_REGISTRY } from '../../config/model-registry.config';
import type { SeedAgenomeSet } from '../seed/seedAgenomes.config';
import type { CostMapConfig } from '../energy/costMap';

/**
 * Boot-config schemas + built-in defaults (P3.1, ARCHITECTURE.md §5/§15).
 *
 * The composed, immutable `AppConfig` the kernel consumes. Reuses the frozen contracts (`RunCaps`,
 * `ScoringPolicy`, `RunConfig` via `validateRunConfig`) + the P2.2 `RegistryConfig`; adds Zod schemas
 * only for the not-yet-covered sources (problem sets). The `DEFAULT_*` constants are the built-in
 * `defaults` layer of the `defaults < file < env` merge — a valid baseline so an empty file/env set
 * still boots.
 */

/** A demo problem set (the prepared scenarios the kernel/demo seeds runs from). */
export const ProblemSet = z.strictObject({
  id: z.string().min(1),
  title: z.string().min(1),
  prompt: z.string().min(1),
});
export type ProblemSet = z.infer<typeof ProblemSet>;

export const ProblemSets = z.array(ProblemSet);
export type ProblemSets = z.infer<typeof ProblemSets>;

/** Default RunCaps — bounded, all 6 positive (validated against the frozen `RunCaps` at boot). */
export const DEFAULT_CAPS: RunCaps = {
  maxPopulation: 12,
  maxGenerations: 6,
  energyBudget: 1000,
  maxSpawnDepth: 4,
  maxToolCalls: 64,
  wallClockTimeoutMs: 600_000,
};

/** Default ScoringPolicy — structure frozen; weight VALUES are the deferred-open piece (§8). */
export const DEFAULT_SCORING_POLICY: ScoringPolicy = {
  version: 'mvp-1',
  weights: { grounding: 1, novelty: 1, feasibility: 1, falsification: 1, subtype_check: 1 },
};

/** Default per-run configuration (the `defaults` layer for `validateRunConfig`). */
export const DEFAULT_RUN_CONFIG: Record<string, unknown> = {
  seed: 'demo-scenario',
  enabledSubtypes: ['cross_domain_transfer', 'zeitgeist_synthesis'],
  caps: DEFAULT_CAPS,
  modelProfile: 'mvp',
  scoringPolicyVersion: 'mvp-1',
  rngSeed: 42,
};

/** Default demo problem set. */
export const DEFAULT_PROBLEM_SETS: ProblemSets = [
  {
    id: 'demo-1',
    title: 'Cross-domain transfer demo',
    prompt: 'Find a technique from one domain that solves a problem in another.',
  },
];

/** The default model registry (P2.2) — the `defaults` layer for `loadModelRegistry`. */
export const DEFAULT_REGISTRY = DEFAULT_MODEL_REGISTRY;

/**
 * The composed, immutable boot config the kernel consumes. Every field is `readonly` (compile-time) and
 * the object is deep-frozen at runtime (LESSON: defense-in-depth) — downstream code cannot mutate it.
 * Carries NO credential field (creds are env-only, rule #4).
 */
export interface AppConfig {
  readonly runConfig: import('@doppl/contracts').RunConfig;
  readonly registry: RegistryConfig;
  readonly scoringPolicy: ScoringPolicy;
  readonly caps: RunCaps;
  /** The `doppl_energy` cost map (the P3.10 loop reads it for energyForLlm/Tool/Spawn + reconcileEnergy).
   * Single source: `CostMapConfig`/`DEFAULT_COST_MAP` in `../energy/costMap` (kernel-027). */
  readonly costMap: CostMapConfig;
  readonly problemSets: ProblemSets;
  readonly seedSet: SeedAgenomeSet;
}
