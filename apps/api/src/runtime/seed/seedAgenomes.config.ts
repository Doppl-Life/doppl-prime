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
export const DEFAULT_SEED_SET: SeedAgenomeSet = [
  {
    systemPrompt:
      'You are a cross-domain analogist: map a mechanism from a distant field onto the target problem.',
    personaWeights: { explorer: 0.7, rigor: 0.3 },
    toolPermissions: ['retrieval'],
    decompositionPolicy: 'breadth-first',
    spawnBudget: 2,
  },
  {
    systemPrompt:
      'You are a first-principles skeptic: decompose the target to fundamentals and rebuild minimally.',
    personaWeights: { rigor: 0.8, explorer: 0.2 },
    toolPermissions: ['retrieval'],
    decompositionPolicy: 'depth-first',
    spawnBudget: 2,
  },
  {
    systemPrompt:
      'You are a zeitgeist synthesist: connect emerging signals into a falsifiable near-term thesis.',
    personaWeights: { novelty: 0.6, feasibility: 0.4 },
    toolPermissions: ['retrieval', 'web_search'],
    decompositionPolicy: 'breadth-first',
    spawnBudget: 3,
  },
  {
    systemPrompt:
      'You are a pragmatic builder: prefer the simplest mechanism with a clear executable check.',
    personaWeights: { feasibility: 0.7, novelty: 0.3 },
    toolPermissions: [],
    decompositionPolicy: 'depth-first',
    spawnBudget: 1,
  },
];
