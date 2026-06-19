import { type CriticMandate, CriticMandateValues } from "@doppl/contracts";
import { createSeededRng } from "../../runtime/rng.js";
import type { CriticAssignment } from "./run-council.js";

/**
 * Critic-set rotation across generations (IMPLEMENTATION_PLAN.md P4.7).
 * Deterministic under `runSeed + floor(generationIndex / N)` so the
 * agenome→mandate assignment is reproducible from persisted events at
 * replay. Rotation never touches the held-out final-judge config or
 * rubric — the bedrock anchor stays fixed (U6).
 *
 * Configurable cadence `everyNGenerations` (decision D3) defaults to 2
 * via the `DOPPL_CRITIC_ROTATION_N` env var at the U9 wiring layer; this
 * function takes the resolved value as input.
 */

export const ROTATION_N_MIN = 1;
export const ROTATION_N_MAX = 8;

export class RotationConfigError extends Error {
  constructor(reason: string) {
    super(`CriticRotation: ${reason}`);
    this.name = "RotationConfigError";
  }
}

export interface AssignCriticsInput {
  generationIndex: number;
  runSeed: string;
  criticAgenomeIds: readonly string[];
  everyNGenerations: number;
}

export interface AssignCriticsResult {
  assignment: CriticAssignment;
  rotationGeneration: number;
}

export function assignCriticsForGeneration(input: AssignCriticsInput): AssignCriticsResult {
  if (input.criticAgenomeIds.length === 0) {
    throw new RotationConfigError("criticAgenomeIds must be non-empty");
  }
  if (
    !Number.isInteger(input.everyNGenerations) ||
    input.everyNGenerations < ROTATION_N_MIN ||
    input.everyNGenerations > ROTATION_N_MAX
  ) {
    throw new RotationConfigError(
      `everyNGenerations must be an integer in [${ROTATION_N_MIN}, ${ROTATION_N_MAX}], got ${input.everyNGenerations}`,
    );
  }
  if (!Number.isInteger(input.generationIndex) || input.generationIndex < 0) {
    throw new RotationConfigError(
      `generationIndex must be a non-negative integer, got ${input.generationIndex}`,
    );
  }

  const rotationGeneration = Math.floor(input.generationIndex / input.everyNGenerations);
  const rng = createSeededRng(`${input.runSeed}:rot:${rotationGeneration}`);

  // CriticMandateValues is the closed 5-member enum (factual_grounding,
  // novelty_prior_art, feasibility, falsification, subtype_specific).
  // Pick one criticAgenomeId per mandate from the same RNG so the order of
  // picks is itself part of the determinism contract.
  const assignment = {} as CriticAssignment;
  for (const mandate of CriticMandateValues) {
    assignment[mandate as CriticMandate] = rng.choose(input.criticAgenomeIds as string[]);
  }
  return { assignment, rotationGeneration };
}
