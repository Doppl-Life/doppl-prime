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
