import {
  calculateInheritanceWeights,
  type CandidateSolution,
  type FusionResult,
  type PairCompatibility,
} from './contracts.ts';

export function fuseCandidates(input: {
  caseId: string;
  parentA: CandidateSolution;
  parentB: CandidateSolution;
  parentAScore: number;
  parentBScore: number;
  compatibility: PairCompatibility;
}): FusionResult {
  const inheritanceWeights = calculateInheritanceWeights(input.parentAScore, input.parentBScore);
  const child: CandidateSolution = {
    id: `child_${input.parentA.id}_${input.parentB.id}`,
    caseId: input.caseId,
    agenomeId: `fused_${input.parentA.agenomeId}_${input.parentB.agenomeId}`,
    generation: Math.max(input.parentA.generation, input.parentB.generation) + 1,
    title: `${input.parentA.title} / ${input.parentB.title} fusion`,
    summary: `${input.parentA.summary} The child imports the secondary constraint from ${input.parentB.title}.`,
    mechanism: `${input.parentA.mechanism} It is tempered by ${input.parentB.mechanism}`,
    claimedDelta: `${input.parentA.claimedDelta} + ${input.parentB.claimedDelta}`,
    citedKnowledge: [...new Set([...input.parentA.citedKnowledge, ...input.parentB.citedKnowledge])],
  };
  return {
    child,
    parentCandidateIds: [input.parentA.id, input.parentB.id],
    compatibility: input.compatibility,
    inheritanceWeights,
    inheritedTraits: [
      `${input.parentA.id}: primary mechanism at ${inheritanceWeights.parentA}`,
      `${input.parentB.id}: constraint and failure-mode pressure at ${inheritanceWeights.parentB}`,
    ],
    mutationNotes: ['Combined mechanisms only after separate parent scoring and compatibility check.'],
  };
}
