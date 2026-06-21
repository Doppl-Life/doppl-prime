import { Agenome } from '@doppl/contracts';
import type { Rng } from './rng';

/**
 * Bounded mutation primitive for reproduction (P5.8, ARCHITECTURE.md §8/§4).
 *
 * `mutate(parent, rng, bounds, {newId})` perturbs an agenome's traits WITHIN bounds using the injected
 * deterministic RNG and captures the concrete outcomes in a `mutationSummary`. `applyMutation(parent,
 * mutationSummary, {newId})` is the REPLAY path — it reconstructs the identical child from the persisted
 * outcomes using NO rng (KEY SAFETY RULE #7). Both share one `reconstructChild`, so the live child and
 * the replayed child are structurally identical by construction.
 *
 * Mutation is bounded + finite (no unbounded trait drift) and never raises a cap — `spawnBudget` stays a
 * nonneg-int HINT the kernel clamps (KEY SAFETY RULE #1). It is pure over its inputs: the parent agenome
 * (and its nested `personaWeights` / `toolPermissions`) is never mutated in place.
 */

export interface MutationBounds {
  /** Max absolute delta applied to each persona weight. */
  personaWeightDelta: number;
  /** Max absolute integer delta applied to spawnBudget. */
  spawnBudgetDelta: number;
  /** Tool permissions may be added/removed only within this allowlist (no privilege invention). */
  toolPermissionAllowlist: readonly string[];
}

/** Persisted RNG outcomes — `ReproductionEvent.mutationSummary` shape (record<string,string|number|boolean>). */
export type MutationSummary = Record<string, string | number | boolean>;

export interface MutateDeps {
  /** Injected id factory for the child (no uuid/`Math.random` inside mutate, LESSONS §24). */
  newId: () => string;
  /** The successor generation the child belongs to (P5.11); defaults to the parent's generation. */
  targetGenerationId?: string;
}

const PERSONA_PREFIX = 'personaWeights.';
const SPAWN_BUDGET_KEY = 'spawnBudget';
const TOOL_ADD_PREFIX = 'toolPermissions.+';
const TOOL_REMOVE_PREFIX = 'toolPermissions.-';
const MUTATION_MODE = 'mutation';
const TOGGLE_PROBABILITY = 0.5;

/**
 * computeSummary — the ONLY rng-consuming step: draws the concrete bounded outcomes for every mutated
 * trait. Persona keys are iterated in sorted order for a stable rng-consumption sequence.
 */
function computeSummary(parent: Agenome, rng: Rng, bounds: MutationBounds): MutationSummary {
  const summary: MutationSummary = {};

  // personaWeights — a bounded delta in [-d, d] for every key.
  for (const key of Object.keys(parent.personaWeights).sort()) {
    summary[`${PERSONA_PREFIX}${key}`] = (rng.nextFloat() * 2 - 1) * bounds.personaWeightDelta;
  }

  // spawnBudget — a bounded integer delta in [-d, d].
  summary[SPAWN_BUDGET_KEY] =
    rng.nextInt(2 * bounds.spawnBudgetDelta + 1) - bounds.spawnBudgetDelta;

  // toolPermissions — toggle each allowlist item (add if absent / remove if present).
  const parentTools = new Set(parent.toolPermissions);
  for (const perm of bounds.toolPermissionAllowlist) {
    if (rng.nextFloat() < TOGGLE_PROBABILITY) {
      const prefix = parentTools.has(perm) ? TOOL_REMOVE_PREFIX : TOOL_ADD_PREFIX;
      summary[`${prefix}${perm}`] = true;
    }
  }

  return summary;
}

/**
 * reconstructChild — applies the persisted outcomes to the parent (NO rng) and returns a schema-valid
 * child. Shared by the live and replay paths so they are identical by construction.
 */
function reconstructChild(
  parent: Agenome,
  summary: MutationSummary,
  newId: () => string,
  targetGenerationId: string | undefined,
): Agenome {
  // personaWeights — parent weight + the persisted per-key delta (missing/non-number → unchanged).
  const personaWeights: Record<string, number> = {};
  for (const [key, weight] of Object.entries(parent.personaWeights)) {
    const delta = summary[`${PERSONA_PREFIX}${key}`];
    personaWeights[key] = weight + (typeof delta === 'number' ? delta : 0);
  }

  // spawnBudget — parent + persisted int delta, clamped nonneg (stays a hint; rule #1).
  const spawnDelta = summary[SPAWN_BUDGET_KEY];
  const spawnBudget = Math.max(
    0,
    parent.spawnBudget + (typeof spawnDelta === 'number' ? spawnDelta : 0),
  );

  // toolPermissions — apply the persisted +add / -remove toggles; kept-in-parent order preserved,
  // additions appended in sorted order (deterministic for the replay deep-equal).
  const removed = new Set<string>();
  const added: string[] = [];
  for (const summaryKey of Object.keys(summary)) {
    if (summaryKey.startsWith(TOOL_REMOVE_PREFIX)) {
      removed.add(summaryKey.slice(TOOL_REMOVE_PREFIX.length));
    } else if (summaryKey.startsWith(TOOL_ADD_PREFIX)) {
      added.push(summaryKey.slice(TOOL_ADD_PREFIX.length));
    }
  }
  const toolPermissions = [
    ...parent.toolPermissions.filter((perm) => !removed.has(perm)),
    ...added.sort(),
  ];

  return Agenome.parse({
    id: newId(),
    runId: parent.runId,
    generationId: targetGenerationId ?? parent.generationId,
    parentIds: [parent.id],
    systemPrompt: parent.systemPrompt,
    personaWeights,
    toolPermissions,
    decompositionPolicy: parent.decompositionPolicy,
    spawnBudget,
    mutationMeta: {
      mode: MUTATION_MODE,
      mutatedFields: Object.keys(summary),
      summary: JSON.stringify(summary),
    },
    status: 'seeded',
  });
}

export function mutate(
  parent: Agenome,
  rng: Rng,
  bounds: MutationBounds,
  deps: MutateDeps,
): { child: Agenome; mutationSummary: MutationSummary } {
  const mutationSummary = computeSummary(parent, rng, bounds);
  const child = reconstructChild(parent, mutationSummary, deps.newId, deps.targetGenerationId);
  return { child, mutationSummary };
}

export interface ApplyMutationDeps {
  /** The child id — at replay this is the persisted `childAgenomeId` (opaque bytes, not re-derivable). */
  newId: () => string;
  targetGenerationId?: string;
}

export function applyMutation(
  parent: Agenome,
  mutationSummary: MutationSummary,
  deps: ApplyMutationDeps,
): Agenome {
  return reconstructChild(parent, mutationSummary, deps.newId, deps.targetGenerationId);
}
