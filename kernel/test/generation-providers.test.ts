import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCaseStudy } from '../src/case-loader.ts';
import { createJsonKnowledgeGateway } from '../src/knowledge-gateway.ts';
import {
  createFixtureGenerationProviders,
  type CandidateGenerator,
  type CriticCouncil,
  type ProblemRecoveryProvider,
} from '../src/generation-providers.ts';

test('fixture generation providers expose recovery, candidate, and critic boundaries', async () => {
  const caseStudy = await loadCaseStudy('case-studies/fsd-ownership-unwind/problem-statement.md');
  const gateway = await createJsonKnowledgeGateway(
    'kernel/fixtures/fsd-ownership-unwind/knowledge-packet.json',
  );
  const knowledgePacket = await gateway.selectPacket({
    runId: 'run_provider',
    targetCase: caseStudy.id,
    maxItems: 3,
  });
  const providers = await createFixtureGenerationProviders(
    'kernel/fixtures/fsd-ownership-unwind/run-fixture.json',
  );

  const recovery = await providers.problemRecovery.recover({
    runId: 'run_provider',
    caseStudy,
    knowledgePacket,
  });
  const candidates = await providers.candidateGenerator.generate({
    runId: 'run_provider',
    caseStudy,
    problemRecovery: recovery,
    knowledgePacket,
    generation: 0,
  });
  const verdicts = await providers.criticCouncil.judge({
    runId: 'run_provider',
    caseStudy,
    problemRecovery: recovery,
    candidates,
    knowledgePacket,
  });

  assert.equal(recovery.caseId, 'fsd-ownership-unwind');
  assert.equal(recovery.citedKnowledge.length, 3);
  assert.equal(candidates.length, 3);
  assert.equal(candidates[0]?.generation, 0);
  assert.equal(verdicts.length, 9);
});

test('provider interfaces can be implemented without fixture files', async () => {
  const problemRecovery: ProblemRecoveryProvider = {
    async recover({ caseStudy, knowledgePacket }) {
      return {
        id: `live_recovery_${caseStudy.id}`,
        caseId: caseStudy.id,
        title: 'Live Recovery',
        recoveredProblem: 'Recovered by a provider boundary.',
        hiddenConstraint: 'The generator must be swappable.',
        falsifier: 'If fixture files are required, this fails.',
        citedKnowledge: knowledgePacket.items.map((item) => item.citeHandle),
      };
    },
  };
  const candidateGenerator: CandidateGenerator = {
    async generate({ caseStudy, generation }) {
      return [
        {
          id: 'live_a',
          caseId: caseStudy.id,
          agenomeId: 'ag_live',
          generation,
          title: 'Live A',
          summary: 'summary',
          mechanism: 'mechanism',
          claimedDelta: 'delta',
          citedKnowledge: [],
        },
        {
          id: 'live_b',
          caseId: caseStudy.id,
          agenomeId: 'ag_live',
          generation,
          title: 'Live B',
          summary: 'summary',
          mechanism: 'mechanism',
          claimedDelta: 'delta',
          citedKnowledge: [],
        },
      ];
    },
  };
  const criticCouncil: CriticCouncil = {
    async judge({ candidates }) {
      return candidates.flatMap((candidate, index) => [
        {
          candidateId: candidate.id,
          criticId: 'grounding',
          score: index === 0 ? 90 : 50,
          pressure: 'pressure',
          revisionMandate: 'revise',
        },
      ]);
    },
  };

  assert.equal(typeof problemRecovery.recover, 'function');
  assert.equal(typeof candidateGenerator.generate, 'function');
  assert.equal(typeof criticCouncil.judge, 'function');
});
