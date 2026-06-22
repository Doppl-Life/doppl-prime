import {
  assertCandidateSolution,
  assertCriticVerdict,
  assertProblemRecovery,
  type CandidateSolution,
  type CaseStudy,
  type CriticVerdict,
  type KnowledgePacket,
  type ProblemRecovery,
} from './contracts.ts';
import { loadKernelFixture } from './fixtures.ts';
import { parseJsonObjectResponse, type ModelClient } from './model-gateway.ts';

export type ProblemRecoveryInput = {
  runId: string;
  caseStudy: CaseStudy;
  knowledgePacket: KnowledgePacket;
};

export type CandidateGenerationInput = {
  runId: string;
  caseStudy: CaseStudy;
  problemRecovery: ProblemRecovery;
  knowledgePacket: KnowledgePacket;
  generation: number;
};

export type CriticJudgmentInput = {
  runId: string;
  caseStudy: CaseStudy;
  problemRecovery: ProblemRecovery;
  candidates: CandidateSolution[];
  knowledgePacket: KnowledgePacket;
};

export type ProblemRecoveryProvider = {
  recover(input: ProblemRecoveryInput): Promise<ProblemRecovery>;
};

export type CandidateGenerator = {
  generate(input: CandidateGenerationInput): Promise<CandidateSolution[]>;
};

export type CriticCouncil = {
  judge(input: CriticJudgmentInput): Promise<CriticVerdict[]>;
};

export type GenerationProviders = {
  problemRecovery: ProblemRecoveryProvider;
  candidateGenerator: CandidateGenerator;
  criticCouncil: CriticCouncil;
};

export type ModelGenerationPromptRenderers = {
  problemRecovery(input: ProblemRecoveryInput): string;
  candidateGeneration(input: CandidateGenerationInput): string;
  criticJudgment(input: CriticJudgmentInput): string;
};

export type ModelGenerationProviderInput = {
  client: ModelClient;
  model: string;
  prompts: ModelGenerationPromptRenderers;
};

export async function createFixtureGenerationProviders(
  fixturePath: string,
): Promise<GenerationProviders & { caseId: string }> {
  const fixture = await loadKernelFixture(fixturePath);

  return {
    caseId: fixture.caseId,
    problemRecovery: {
      async recover({ caseStudy, knowledgePacket }) {
        if (fixture.caseId !== caseStudy.id) {
          throw new Error(`fixture case ${fixture.caseId} does not match loaded case ${caseStudy.id}`);
        }
        return assertProblemRecovery({
          id: `recovery_${caseStudy.id}`,
          caseId: caseStudy.id,
          ...fixture.problemRecovery,
          citedKnowledge: knowledgePacket.items.map((item) => item.citeHandle),
        });
      },
    },
    candidateGenerator: {
      async generate({ caseStudy, generation }) {
        if (fixture.caseId !== caseStudy.id) {
          throw new Error(`fixture case ${fixture.caseId} does not match loaded case ${caseStudy.id}`);
        }
        return fixture.candidates.map((candidate) =>
          assertCandidateSolution({
            ...candidate,
            caseId: caseStudy.id,
            generation,
          }),
        );
      },
    },
    criticCouncil: {
      async judge({ caseStudy }) {
        if (fixture.caseId !== caseStudy.id) {
          throw new Error(`fixture case ${fixture.caseId} does not match loaded case ${caseStudy.id}`);
        }
        return fixture.critics.map(assertCriticVerdict);
      },
    },
  };
}

function arrayField(value: Record<string, unknown>, field: string): unknown[] {
  const array = value[field];
  if (!Array.isArray(array)) throw new Error(`model response.${field} must be an array`);
  return array;
}

export function createModelGenerationProviders(input: ModelGenerationProviderInput): GenerationProviders {
  return {
    problemRecovery: {
      async recover(providerInput) {
        const response = await input.client.complete({
          runId: providerInput.runId,
          purpose: 'problem_recovery',
          prompt: input.prompts.problemRecovery(providerInput),
          model: input.model,
          responseFormat: 'json_object',
        });
        const parsed = parseJsonObjectResponse(response.outputText);
        return assertProblemRecovery({
          id: `recovery_${providerInput.caseStudy.id}`,
          caseId: providerInput.caseStudy.id,
          ...parsed,
          citedKnowledge: providerInput.knowledgePacket.items.map((item) => item.citeHandle),
        });
      },
    },
    candidateGenerator: {
      async generate(providerInput) {
        const response = await input.client.complete({
          runId: providerInput.runId,
          purpose: 'candidate_generation',
          prompt: input.prompts.candidateGeneration(providerInput),
          model: input.model,
          responseFormat: 'json_object',
        });
        const parsed = parseJsonObjectResponse(response.outputText);
        return arrayField(parsed, 'candidates').map((candidate) =>
          assertCandidateSolution({
            ...(candidate as Record<string, unknown>),
            caseId: providerInput.caseStudy.id,
            generation: providerInput.generation,
          }),
        );
      },
    },
    criticCouncil: {
      async judge(providerInput) {
        const response = await input.client.complete({
          runId: providerInput.runId,
          purpose: 'critic_judgment',
          prompt: input.prompts.criticJudgment(providerInput),
          model: input.model,
          responseFormat: 'json_object',
        });
        const parsed = parseJsonObjectResponse(response.outputText);
        return arrayField(parsed, 'verdicts').map(assertCriticVerdict);
      },
    },
  };
}
