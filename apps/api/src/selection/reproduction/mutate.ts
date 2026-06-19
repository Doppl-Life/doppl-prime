import { randomUUID } from "node:crypto";
import { Agenome, type ReproductionEvent } from "@doppl/contracts";
import type { SeededRng } from "../../runtime/rng.js";

/**
 * Bounded mutation (P5.8). Produces a child Agenome from one parent
 * with `personaWeights` and `spawnBudget` perturbed within bounds.
 * Concrete RNG outcomes are persisted in `mutationSummary` so replay
 * reconstructs the child without re-sampling.
 *
 * Bounds (no trait can raise a cap):
 *  - personaWeights[*] ∈ [0, 1], magnitude per draw ∈ [-0.1, +0.1]
 *  - spawnBudget delta ∈ {-1, 0, +1}, clamped to [1, floor(maxPopulation/2)]
 *
 * Up to 2 personaWeights fields perturbed per child (RNG picks which).
 * The systemPrompt, toolPermissions, and decompositionPolicy are NOT
 * mutated in MVP — those are bigger steps that fusion handles instead.
 */

const PERSONA_WEIGHT_MAX_MAGNITUDE = 0.1;
const SPAWN_BUDGET_DELTA_MAX = 1;

export interface MutationBounds {
  /** spawnBudget cannot exceed `floor(maxPopulation / 2)`. */
  maxPopulation: number;
}

export interface MutateAgenomeInput {
  parent: Agenome;
  generationIndex: number;
  rng: SeededRng;
  bounds: MutationBounds;
}

export interface MutationOutcome {
  fieldsChanged: string[];
  magnitudes: Record<string, number>;
  clamps: string[];
  spawnBudgetDelta: number;
}

export interface MutateAgenomeOutput {
  child: Agenome;
  outcome: MutationOutcome;
}

function clamp(v: number, lo: number, hi: number): { value: number; clamped: boolean } {
  if (v < lo) return { value: lo, clamped: true };
  if (v > hi) return { value: hi, clamped: true };
  return { value: v, clamped: false };
}

export function mutateAgenome(input: MutateAgenomeInput): MutateAgenomeOutput {
  const { parent, rng, bounds } = input;

  const personaKeys = Object.keys(parent.personaWeights).sort();
  // Pick 1 or 2 fields to perturb.
  const nFields = personaKeys.length === 0 ? 0 : rng.nextInt(1, Math.min(2, personaKeys.length));
  const picked: string[] = [];
  const pool = [...personaKeys];
  for (let i = 0; i < nFields && pool.length > 0; i += 1) {
    const choice = rng.choose(pool);
    picked.push(choice);
    pool.splice(pool.indexOf(choice), 1);
  }

  const childPersonaWeights = { ...parent.personaWeights };
  const magnitudes: Record<string, number> = {};
  const clamps: string[] = [];

  for (const field of picked) {
    // Magnitude in [-0.1, +0.1] from a uniform [0, 1) draw.
    const m = (rng.next() - 0.5) * 2 * PERSONA_WEIGHT_MAX_MAGNITUDE;
    magnitudes[field] = m;
    const proposed = (parent.personaWeights[field] ?? 0) + m;
    const { value, clamped } = clamp(proposed, 0, 1);
    childPersonaWeights[field] = value;
    if (clamped) clamps.push(field);
  }

  // spawnBudget delta in {-1, 0, +1} from a uniform [0, 1) draw.
  const r = rng.next();
  let spawnDelta: number;
  if (r < 1 / 3) spawnDelta = -SPAWN_BUDGET_DELTA_MAX;
  else if (r < 2 / 3) spawnDelta = 0;
  else spawnDelta = SPAWN_BUDGET_DELTA_MAX;
  const spawnUpper = Math.max(1, Math.floor(bounds.maxPopulation / 2));
  const { value: newSpawn, clamped: spawnClamped } = clamp(
    parent.spawnBudget + spawnDelta,
    1,
    spawnUpper,
  );
  if (spawnClamped) clamps.push("spawnBudget");

  const outcome: MutationOutcome = {
    fieldsChanged: picked,
    magnitudes,
    clamps,
    spawnBudgetDelta: spawnDelta,
  };

  const childId = `ag_${randomUUID()}`;
  const child = Agenome.parse({
    id: childId,
    runId: parent.runId,
    generationId: `gen_${input.generationIndex}`,
    parentIds: [parent.id],
    systemPrompt: parent.systemPrompt,
    personaWeights: childPersonaWeights,
    toolPermissions: parent.toolPermissions,
    decompositionPolicy: parent.decompositionPolicy,
    spawnBudget: newSpawn,
    mutationMeta: { source: "mutate", ...outcome },
    status: "seeded",
  });

  return { child, outcome };
}

export function mutationSummaryString(outcome: MutationOutcome): string {
  return [
    `fields=${outcome.fieldsChanged.join(",") || "(none)"}`,
    `magnitudes=${
      Object.entries(outcome.magnitudes)
        .map(([k, v]) => `${k}:${v.toFixed(4)}`)
        .join(",") || "(none)"
    }`,
    `spawnDelta=${outcome.spawnBudgetDelta}`,
    `clamps=${outcome.clamps.join(",") || "(none)"}`,
  ].join("; ");
}

export function reproductionEventFromMutation(
  runId: string,
  parent: Agenome,
  child: Agenome,
  outcome: MutationOutcome,
): ReproductionEvent {
  return {
    id: `rep_${randomUUID()}`,
    runId,
    parentAgenomeIds: [parent.id],
    childAgenomeId: child.id,
    mode: "mutation_only",
    crossoverPoints: [],
    mutationSummary: mutationSummaryString(outcome),
  };
}
