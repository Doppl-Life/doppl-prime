import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCaseStudy } from '../src/case-loader.ts';
import { createJsonKnowledgeGateway } from '../src/knowledge-gateway.ts';
import {
  createFixtureGenerationProviders,
  createModelGenerationProviders,
  type CandidateGenerator,
  type CriticCouncil,
  type ProblemRecoveryProvider,
} from '../src/generation-providers.ts';
import { createReplayModelClient, type ModelCallRecord } from '../src/model-gateway.ts';

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

test('model generation providers parse replayed structured outputs', async () => {
  const caseStudy = await loadCaseStudy('case-studies/fsd-ownership-unwind/problem-statement.md');
  const gateway = await createJsonKnowledgeGateway(
    'kernel/fixtures/fsd-ownership-unwind/knowledge-packet.json',
  );
  const knowledgePacket = await gateway.selectPacket({
    runId: 'run_model_provider',
    targetCase: caseStudy.id,
    maxItems: 2,
  });
  const prompts = {
    recovery: 'recover prompt',
    candidates: 'candidate prompt',
    critics: 'critic prompt',
  };
  const records: ModelCallRecord[] = [
    {
      id: 'call_recovery',
      runId: 'run_model_provider',
      purpose: 'problem_recovery',
      provider: 'replay',
      model: 'fixture-model',
      prompt: prompts.recovery,
      outputText: JSON.stringify({
        title: 'Model Recovery',
        recoveredProblem: 'Recovered from model output.',
        hiddenConstraint: 'Structured recovery must validate.',
        falsifier: 'Bad JSON fails the contract.',
      }),
      metadata: {},
    },
    {
      id: 'call_candidates',
      runId: 'run_model_provider',
      purpose: 'candidate_generation',
      provider: 'replay',
      model: 'fixture-model',
      prompt: prompts.candidates,
      outputText: JSON.stringify({
        candidates: [
          {
            id: 'model_a',
            agenomeId: 'ag_model',
            title: 'Model A',
            summary: 'summary',
            mechanism: 'mechanism',
            claimedDelta: 'delta',
            citedKnowledge: ['K1'],
          },
          {
            id: 'model_b',
            agenomeId: 'ag_model',
            title: 'Model B',
            summary: 'summary',
            mechanism: 'mechanism',
            claimedDelta: 'delta',
            citedKnowledge: ['K2'],
          },
        ],
      }),
      metadata: {},
    },
    {
      id: 'call_critics',
      runId: 'run_model_provider',
      purpose: 'critic_judgment',
      provider: 'replay',
      model: 'fixture-model',
      prompt: prompts.critics,
      outputText: JSON.stringify({
        verdicts: [
          {
            candidateId: 'model_a',
            criticId: 'grounding',
            score: 88,
            pressure: 'strong',
            revisionMandate: 'keep',
          },
          {
            candidateId: 'model_b',
            criticId: 'grounding',
            score: 44,
            pressure: 'weak',
            revisionMandate: 'revise',
          },
        ],
      }),
      metadata: {},
    },
  ];
  const providers = createModelGenerationProviders({
    client: createReplayModelClient(records),
    model: 'fixture-model',
    prompts: {
      problemRecovery: () => prompts.recovery,
      candidateGeneration: () => prompts.candidates,
      criticJudgment: () => prompts.critics,
    },
  });

  const recovery = await providers.problemRecovery.recover({
    runId: 'run_model_provider',
    caseStudy,
    knowledgePacket,
  });
  const candidates = await providers.candidateGenerator.generate({
    runId: 'run_model_provider',
    caseStudy,
    problemRecovery: recovery,
    knowledgePacket,
    generation: 0,
  });
  const verdicts = await providers.criticCouncil.judge({
    runId: 'run_model_provider',
    caseStudy,
    problemRecovery: recovery,
    candidates,
    knowledgePacket,
  });

  assert.equal(recovery.id, 'recovery_fsd-ownership-unwind');
  assert.equal(recovery.title, 'Model Recovery');
  assert.deepEqual(
    candidates.map((candidate) => candidate.id),
    ['model_a', 'model_b'],
  );
  assert.equal(candidates[0]?.caseId, caseStudy.id);
  assert.equal(verdicts.length, 2);
  assert.equal(verdicts[0]?.score, 88);
});
