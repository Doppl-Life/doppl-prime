import type { Agenome } from "@doppl/contracts";
import type { SeededRng } from "../../runtime/rng.js";

/**
 * Agenome-level crossover (P5.9). Splices two parents' personaWeights
 * and toolPermissions at a deterministic crossover point picked by the
 * caller-supplied RNG. The systemPrompt and decompositionPolicy are
 * inherited from the higher-fitness parent (parentA) by default — the
 * U8 fuse orchestrator decides which parent is "A" by passing them in
 * fitness-descending order.
 *
 * Returns the child traits + the persisted crossoverPoints metadata so
 * `agenome.fused` carries enough state to reconstruct on replay.
 */

export interface CrossoverInput {
  parentA: Agenome;
  parentB: Agenome;
  rng: SeededRng;
}

export interface CrossoverOutput {
  personaWeights: Record<string, number>;
  toolPermissions: string[];
  systemPrompt: string;
  decompositionPolicy: string;
  crossoverPoints: string[];
}

function spliceMap(
  a: Record<string, number>,
  b: Record<string, number>,
  rng: SeededRng,
): { result: Record<string, number>; pointsFromB: string[] } {
  // Sorted union of keys for deterministic iteration order.
  const keys = Array.from(new Set([...Object.keys(a), ...Object.keys(b)])).sort();
  const result: Record<string, number> = {};
  const pointsFromB: string[] = [];
  for (const k of keys) {
    if (rng.next() < 0.5) {
      result[k] = a[k] ?? b[k] ?? 0;
    } else {
      result[k] = b[k] ?? a[k] ?? 0;
      pointsFromB.push(`personaWeights.${k}`);
    }
  }
  return { result, pointsFromB };
}

function spliceArray(
  a: string[],
  b: string[],
  rng: SeededRng,
): {
  result: string[];
  pointsFromB: string[];
} {
  const union = Array.from(new Set([...a, ...b])).sort();
  const result: string[] = [];
  const pointsFromB: string[] = [];
  for (const item of union) {
    const inA = a.includes(item);
    const inB = b.includes(item);
    if (inA && inB) {
      result.push(item);
    } else if (inA) {
      if (rng.next() < 0.5) result.push(item);
    } else if (inB) {
      if (rng.next() < 0.5) {
        result.push(item);
        pointsFromB.push(`toolPermissions.${item}`);
      }
    }
  }
  return { result, pointsFromB };
}

export function crossoverAgenomes(input: CrossoverInput): CrossoverOutput {
  const { parentA, parentB, rng } = input;
  const persona = spliceMap(parentA.personaWeights, parentB.personaWeights, rng);
  const tools = spliceArray(parentA.toolPermissions, parentB.toolPermissions, rng);
  return {
    personaWeights: persona.result,
    toolPermissions: tools.result,
    systemPrompt: parentA.systemPrompt,
    decompositionPolicy: parentA.decompositionPolicy,
    crossoverPoints: [...persona.pointsFromB, ...tools.pointsFromB],
  };
}
