import { z } from 'zod';
import { Agenome } from '@doppl/contracts';

/**
 * P3.9 — the authored gen-0 seed templates (ARCHITECTURE.md §3/§7, REQ-F-017).
 *
 * `SeedAgenomeTemplate` carries the five TRAIT fields ONLY, single-sourced from the frozen `Agenome`
 * (lesson §5 — a trait-field change in the contract follows here automatically). `z.strictObject` makes
 * the spawn-assigned identity/lineage/status fields (id/runId/generationId/parentIds/status/mutationMeta)
 * unrepresentable — `materializeGen0` assigns those at materialization. Boot-validated via `loadConfig`.
 */
export const SeedAgenomeTemplate = z.strictObject({
  systemPrompt: Agenome.shape.systemPrompt,
  personaWeights: Agenome.shape.personaWeights,
  toolPermissions: Agenome.shape.toolPermissions,
  decompositionPolicy: Agenome.shape.decompositionPolicy,
  spawnBudget: Agenome.shape.spawnBudget,
});
export type SeedAgenomeTemplate = z.infer<typeof SeedAgenomeTemplate>;

/** The authored gen-0 baseline — at least one template; the run materializes `min(length, maxPopulation)`. */
export const SeedAgenomeSet = z.array(SeedAgenomeTemplate).min(1);
export type SeedAgenomeSet = z.infer<typeof SeedAgenomeSet>;

/**
 * `DEFAULT_SEED_SET` — the MVP authored baseline (REQ-F-017 / OQ-013: the roster CONTENT is tunable
 * post-spike; the SHAPE + the boot loader are the pinned surface). Distinct personas so gen-0 carries
 * diversity into the breeding loop.
 */
// EXPERIMENT (mutagen-dynamics) — each seed also carries a `lens.<operator>` MUTAGEN LENS in its
// personaWeights: a dominant lens (≥0.5 → active under the mutate_lens/adaptive strategies) plus a
// sub-threshold secondary that mutation drift can later promote (an emergent lens shift). Distinct lenses
// across the seeds carry diversity into the breeding loop. Inert under fusion_only/mutate_static (those
// ideate under the run-level operators); mutation drifts these weights, fusion crossover inherits them.
export const DEFAULT_SEED_SET: SeedAgenomeSet = [
  {
    systemPrompt:
      'You are a cross-domain analogist: map a mechanism from a distant field onto the target problem.',
    personaWeights: { explorer: 0.7, rigor: 0.3, 'lens.polymath': 0.9, 'lens.breakout': 0.4 },
    toolPermissions: ['retrieval'],
    decompositionPolicy: 'breadth-first',
    spawnBudget: 2,
  },
  {
    systemPrompt:
      'You are a first-principles skeptic: decompose the target to fundamentals and rebuild minimally.',
    personaWeights: {
      rigor: 0.8,
      explorer: 0.2,
      'lens.first_principles': 0.9,
      'lens.subtraction': 0.4,
    },
    toolPermissions: ['retrieval'],
    decompositionPolicy: 'depth-first',
    spawnBudget: 2,
  },
  {
    systemPrompt:
      'You are a zeitgeist synthesist: connect emerging signals into a falsifiable near-term thesis.',
    personaWeights: {
      novelty: 0.6,
      feasibility: 0.4,
      'lens.blindside': 0.9,
      'lens.breakthrough': 0.4,
    },
    toolPermissions: ['retrieval', 'web_search'],
    decompositionPolicy: 'breadth-first',
    spawnBudget: 3,
  },
  {
    systemPrompt:
      'You are a pragmatic builder: prefer the simplest mechanism with a clear executable check.',
    personaWeights: {
      feasibility: 0.7,
      novelty: 0.3,
      'lens.constraint': 0.9,
      'lens.subtraction': 0.4,
    },
    toolPermissions: [],
    decompositionPolicy: 'depth-first',
    spawnBudget: 1,
  },
];

/**
 * `WEAK_SEED_SET` — the "give the climb room" baseline (coevolution-climb-plan §3.4 / HG1). The demo problem
 * is ceiling-bound: with `DEFAULT_SEED_SET`, gen 0 already produces ~0.69-tier answers against a ~0.74 judge
 * cap, so there is almost no headroom for evolution to *visibly* climb. These personas are deliberately WEAK
 * — hurried, conventional, low-novelty, low-rigor — so gen 0 scores low (~0.4) and the run shows a real
 * 0.4 → 0.7+ trajectory that exercises the Phase-A dynamics (honest gate + judge-keyed elitism + ratchet)
 * AND the eventual coupling. The weakness is in CONTENT QUALITY only — every persona still produces a valid
 * candidate (the climb comes from fusion synthesizing better system prompts + directed-repair toward the
 * judge's weak axes + mutation drift). Distinct weak ANGLES so fusion has diverse material to combine. No
 * `lens.*` weights → under the `adaptive`/`mutate_lens` strategies these fall back to the run-level operators
 * (they don't ideate through a strong heritable lens, which would defeat the point). Selected at boot via
 * `DOPPL_SEED_PROFILE=weak`; `fileSources.seedSet` still overrides (explicit wins). Shape-identical to
 * `DEFAULT_SEED_SET` (boot-validated by the same `SeedAgenomeSet`).
 */
export const WEAK_SEED_SET: SeedAgenomeSet = [
  {
    systemPrompt:
      'You are a hurried generalist. Give the first obvious, conventional answer that comes to mind and ' +
      'keep it short and surface-level. Do not dig into mechanisms, cite evidence, or reach for novelty.',
    personaWeights: { rigor: 0.2, novelty: 0.1 },
    toolPermissions: [],
    decompositionPolicy: 'breadth-first',
    spawnBudget: 2,
  },
  {
    systemPrompt:
      'You are a buzzword optimist. Propose a trendy-sounding solution using fashionable terms, without a ' +
      'concrete mechanism or any falsifiable prediction. Confidence over substance.',
    personaWeights: { novelty: 0.3, feasibility: 0.1 },
    toolPermissions: [],
    decompositionPolicy: 'breadth-first',
    spawnBudget: 2,
  },
  {
    systemPrompt:
      'You are a cautious incrementalist. Suggest a small, safe, unoriginal tweak to the status quo. Avoid ' +
      'bold, cross-domain, or speculative ideas; prefer the most expected option.',
    personaWeights: { feasibility: 0.3, novelty: 0.1 },
    toolPermissions: [],
    decompositionPolicy: 'depth-first',
    spawnBudget: 1,
  },
  {
    systemPrompt:
      'You are a vague summarizer. Restate the problem and gesture at a generic direction without a ' +
      'specific, testable proposal or a clear executable check.',
    personaWeights: { rigor: 0.15, feasibility: 0.2 },
    toolPermissions: [],
    decompositionPolicy: 'depth-first',
    spawnBudget: 1,
  },
];

/**
 * The boot seed-profile registry — the closed set of authored gen-0 baselines, selectable via
 * `DOPPL_SEED_PROFILE`. `default` is the production roster; `weak` is the headroom/demo baseline (HG1).
 */
export const SEED_PROFILES = {
  default: DEFAULT_SEED_SET,
  weak: WEAK_SEED_SET,
} as const;
export type SeedProfile = keyof typeof SEED_PROFILES;

/**
 * Select the boot seed set by `DOPPL_SEED_PROFILE` (own-property lookup over the closed registry — an
 * unknown/absent/garbage profile → `DEFAULT_SEED_SET`, the production baseline = HEAD-identical). The boot
 * `fileSources.seedSet` (if present) still overrides this in `loadConfig` (explicit file wins). Pure.
 */
export function selectSeedSet(profile: string | undefined): SeedAgenomeSet {
  if (profile !== undefined && Object.prototype.hasOwnProperty.call(SEED_PROFILES, profile)) {
    return SEED_PROFILES[profile as SeedProfile];
  }
  return DEFAULT_SEED_SET;
}
