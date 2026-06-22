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
import { parseJsonObjectResponse, type ModelCallRecord, type ModelClient } from './model-gateway.ts';

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
  prompts?: ModelGenerationPromptRenderers;
};

export type ModelGenerationProviders = GenerationProviders & {
  modelCallRecords: ModelCallRecord[];
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

function knowledgeSummary(packet: KnowledgePacket): string {
  return packet.items.map((item) => `${item.citeHandle}: ${item.text}`).join('\n');
}

export function createDefaultModelGenerationPrompts(): ModelGenerationPromptRenderers {
  return {
    problemRecovery({ caseStudy, knowledgePacket }) {
      return [
        'Return JSON only for a ProblemRecovery without id, caseId, or citedKnowledge.',
        `Case: ${caseStudy.title}`,
        `Stated problem: ${caseStudy.statedProblem}`,
        'Knowledge:',
        knowledgeSummary(knowledgePacket),
      ].join('\n');
    },
    candidateGeneration({ caseStudy, problemRecovery, knowledgePacket, generation }) {
      return [
        'Return JSON only with a candidates array.',
        `Case: ${caseStudy.title}`,
        `Generation: ${generation}`,
        `Recovered problem: ${problemRecovery.recoveredProblem}`,
        'Each candidate omits caseId and generation; include id, agenomeId, title, summary, mechanism, claimedDelta, citedKnowledge.',
        'Knowledge:',
        knowledgeSummary(knowledgePacket),
      ].join('\n');
    },
    criticJudgment({ caseStudy, problemRecovery, candidates }) {
      return [
        'Return JSON only with a verdicts array.',
        `Case: ${caseStudy.title}`,
        `Recovered problem: ${problemRecovery.recoveredProblem}`,
        `Candidates: ${candidates.map((candidate) => candidate.id).join(', ')}`,
        'Each verdict must include candidateId, criticId, score, pressure, revisionMandate.',
      ].join('\n');
    },
  };
}

export function createModelGenerationProviders(input: ModelGenerationProviderInput): ModelGenerationProviders {
  const prompts = input.prompts || createDefaultModelGenerationPrompts();
  const modelCallRecords: ModelCallRecord[] = [];

  async function complete(request: Parameters<ModelClient['complete']>[0]): Promise<ModelCallRecord> {
    const response = await input.client.complete(request);
    modelCallRecords.push(response);
    return response;
  }

  async function parseWithRepair<T>(
    request: Parameters<ModelClient['complete']>[0],
    validate: (parsed: Record<string, unknown>) => T,
  ): Promise<T> {
    const response = await complete(request);
    try {
      return validate(parseJsonObjectResponse(response.outputText));
    } catch (error) {
      response.metadata = {
        ...response.metadata,
        status: 'repair_requested',
        error: error instanceof Error ? error.message : String(error),
      };
    }

    const repairResponse = await complete({
      ...request,
      purpose: `${request.purpose}.repair`,
      prompt: [
        request.prompt,
        '',
        'Repair the previous output into valid JSON only.',
        'Previous output:',
        response.outputText,
      ].join('\n'),
    });
    try {
      const repaired = validate(parseJsonObjectResponse(repairResponse.outputText));
      repairResponse.metadata = { ...repairResponse.metadata, status: 'repaired' };
      return repaired;
    } catch (error) {
      repairResponse.metadata = {
        ...repairResponse.metadata,
        status: 'rejected',
        error: error instanceof Error ? error.message : String(error),
      };
      throw new Error(`model output rejected after repair: ${repairResponse.metadata.error}`);
    }
  }

  return {
    modelCallRecords,
    problemRecovery: {
      async recover(providerInput) {
        return parseWithRepair(
          {
            runId: providerInput.runId,
            purpose: 'problem_recovery',
            prompt: prompts.problemRecovery(providerInput),
            model: input.model,
            responseFormat: 'json_object',
          },
          (parsed) =>
            assertProblemRecovery({
              id: `recovery_${providerInput.caseStudy.id}`,
              caseId: providerInput.caseStudy.id,
              ...parsed,
              citedKnowledge: providerInput.knowledgePacket.items.map((item) => item.citeHandle),
            }),
        );
      },
    },
    candidateGenerator: {
      async generate(providerInput) {
        return parseWithRepair(
          {
            runId: providerInput.runId,
            purpose: 'candidate_generation',
            prompt: prompts.candidateGeneration(providerInput),
            model: input.model,
            responseFormat: 'json_object',
          },
          (parsed) =>
            arrayField(parsed, 'candidates').map((candidate) =>
              assertCandidateSolution({
                ...(candidate as Record<string, unknown>),
                caseId: providerInput.caseStudy.id,
                generation: providerInput.generation,
              }),
            ),
        );
      },
    },
    criticCouncil: {
      async judge(providerInput) {
        return parseWithRepair(
          {
            runId: providerInput.runId,
            purpose: 'critic_judgment',
            prompt: prompts.criticJudgment(providerInput),
            model: input.model,
            responseFormat: 'json_object',
          },
          (parsed) => arrayField(parsed, 'verdicts').map(assertCriticVerdict),
        );
      },
    },
  };
}
