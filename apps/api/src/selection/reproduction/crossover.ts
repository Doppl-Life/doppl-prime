import type { Agenome } from '@doppl/contracts';
import type { Rng } from './rng';

/**
 * crossover (P5.9, ARCHITECTURE.md §8) — deterministic agenome-level trait splice of two parents.
 *
 * Produces the child's STRUCTURED traits (personaWeights / toolPermissions / decompositionPolicy /
 * spawnBudget) by a seeded splice; the child's `systemPrompt` is NOT spliced here — it is the
 * output-synthesis result (or, on the synthesis-degrade path, a parent's, per `choices.systemPrompt_from`)
 * decided in `fuse.ts`. Every non-deterministic outcome is captured in `crossoverPoints` (the numeric
 * splice indices) + `choices` (the coin picks) so `reconstructCrossover` rebuilds the identical traits
 * with NO rng (KEY SAFETY RULE #7). Pure over the parents — never mutates them.
 */
export type Parent = 'A' | 'B';

export interface CrossoverChoices {
  decompositionPolicy_from: Parent;
  spawnBudget_from: Parent;
  /** Which parent's systemPrompt the child takes if output-synthesis is rejected (fuse's degrade path). */
  systemPrompt_from: Parent;
}

export interface ChildTraits {
  personaWeights: Record<string, number>;
  toolPermissions: string[];
  decompositionPolicy: string;
  spawnBudget: number;
}

export interface CrossoverResult {
  childTraits: ChildTraits;
  crossoverPoints: number[];
  choices: CrossoverChoices;
}

/** personaWeights: canonical-sorted union of keys; first `k` from A (fallback B), rest from B (fallback A). */
function splicePersonaWeights(a: Agenome, b: Agenome, k: number): Record<string, number> {
  const keys = [
    ...new Set([...Object.keys(a.personaWeights), ...Object.keys(b.personaWeights)]),
  ].sort();
  const out: Record<string, number> = {};
  for (const [i, key] of keys.entries()) {
    const fromA = i < k;
    const aVal = a.personaWeights[key];
    const bVal = b.personaWeights[key];
    out[key] = fromA ? (aVal ?? bVal ?? 0) : (bVal ?? aVal ?? 0);
  }
  return out;
}

/** toolPermissions: canonical-sorted union, taking the first `k` (k ≥ 1 keeps the child non-empty). */
function spliceToolPermissions(a: Agenome, b: Agenome, k: number): string[] {
  const union = [...new Set([...a.toolPermissions, ...b.toolPermissions])].sort();
  return union.slice(0, k);
}

function personaUnionSize(a: Agenome, b: Agenome): number {
  return new Set([...Object.keys(a.personaWeights), ...Object.keys(b.personaWeights)]).size;
}

function toolUnionSize(a: Agenome, b: Agenome): number {
  return new Set([...a.toolPermissions, ...b.toolPermissions]).size;
}

export function crossover(parentA: Agenome, parentB: Agenome, rng: Rng): CrossoverResult {
  const k1 = rng.nextInt(personaUnionSize(parentA, parentB) + 1); // [0, |union|]
  const k2 = rng.nextInt(Math.max(1, toolUnionSize(parentA, parentB))) + 1; // [1, |union|]
  const choices: CrossoverChoices = {
    decompositionPolicy_from: rng.nextFloat() < 0.5 ? 'A' : 'B',
    spawnBudget_from: rng.nextFloat() < 0.5 ? 'A' : 'B',
    systemPrompt_from: rng.nextFloat() < 0.5 ? 'A' : 'B',
  };
  const childTraits = applyTraits(parentA, parentB, [k1, k2], choices);
  return { childTraits, crossoverPoints: [k1, k2], choices };
}

/**
 * reconstructCrossover — the replay path: re-derives the identical child traits from the persisted
 * `crossoverPoints` + `choices`, using NO rng (rule #7).
 */
export function reconstructCrossover(
  parentA: Agenome,
  parentB: Agenome,
  crossoverPoints: readonly number[],
  choices: CrossoverChoices,
): ChildTraits {
  return applyTraits(parentA, parentB, crossoverPoints, choices);
}

function applyTraits(
  parentA: Agenome,
  parentB: Agenome,
  crossoverPoints: readonly number[],
  choices: CrossoverChoices,
): ChildTraits {
  const k1 = crossoverPoints[0] ?? 0;
  const k2 = crossoverPoints[1] ?? 1;
  return {
    personaWeights: splicePersonaWeights(parentA, parentB, k1),
    toolPermissions: spliceToolPermissions(parentA, parentB, k2),
    decompositionPolicy:
      choices.decompositionPolicy_from === 'A'
        ? parentA.decompositionPolicy
        : parentB.decompositionPolicy,
    spawnBudget: choices.spawnBudget_from === 'A' ? parentA.spawnBudget : parentB.spawnBudget,
  };
}
