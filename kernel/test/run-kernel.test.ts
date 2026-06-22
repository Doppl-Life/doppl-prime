import test from 'node:test';
import assert from 'node:assert/strict';
import { runKernel } from '../src/run-kernel.ts';
import { createModelGenerationProviders } from '../src/generation-providers.ts';
import { createReplayModelClient, type ModelCallRecord } from '../src/model-gateway.ts';

test('runs deterministic kernel loop end to end', async () => {
  const run = await runKernel({
    runId: 'run_test',
    casePath: 'case-studies/fsd-ownership-unwind/problem-statement.md',
    fixturePath: 'kernel/fixtures/fsd-ownership-unwind/run-fixture.json',
    knowledgePacketPath: 'kernel/fixtures/fsd-ownership-unwind/knowledge-packet.json',
    memoryMode: 'auto',
  });
  assert.equal(run.problemRecovery.caseId, 'fsd-ownership-unwind');
  assert.equal(run.candidates.length, 3);
  assert.equal(run.selectedParents.length, 2);
  assert.equal(run.fusion?.inheritanceWeights.parentA, 0.667);
  assert.ok(run.events.some((event) => event.type === 'knowledge.packet_selected'));
});

test('runs through injected generation providers', async () => {
  const run = await runKernel({
    runId: 'run_injected',
    casePath: 'case-studies/fsd-ownership-unwind/problem-statement.md',
    fixturePath: 'kernel/fixtures/fsd-ownership-unwind/run-fixture.json',
    knowledgePacketPath: 'kernel/fixtures/fsd-ownership-unwind/knowledge-packet.json',
    memoryMode: 'auto',
    generationProviders: {
      problemRecovery: {
        async recover({ caseStudy, knowledgePacket }) {
          return {
            id: `injected_recovery_${caseStudy.id}`,
            caseId: caseStudy.id,
            title: 'Injected Recovery',
            recoveredProblem: 'Provider recovered problem.',
            hiddenConstraint: 'The kernel must call injected providers.',
            falsifier: 'Fixture recovery appears in the run.',
            citedKnowledge: knowledgePacket.items.map((item) => item.citeHandle),
          };
        },
      },
      candidateGenerator: {
        async generate({ caseStudy, generation }) {
          return [
            {
              id: 'injected_a',
              caseId: caseStudy.id,
              agenomeId: 'ag_injected',
              generation,
              title: 'Injected A',
              summary: 'summary',
              mechanism: 'mechanism',
              claimedDelta: 'delta',
              citedKnowledge: [],
            },
            {
              id: 'injected_b',
              caseId: caseStudy.id,
              agenomeId: 'ag_injected',
              generation,
              title: 'Injected B',
              summary: 'summary',
              mechanism: 'mechanism',
              claimedDelta: 'delta',
              citedKnowledge: [],
            },
          ];
        },
      },
      criticCouncil: {
        async judge({ candidates }) {
          return [
            {
              candidateId: candidates[0]!.id,
              criticId: 'grounding',
              score: 90,
              pressure: 'strong',
              revisionMandate: 'keep',
            },
            {
              candidateId: candidates[1]!.id,
              criticId: 'grounding',
              score: 30,
              pressure: 'weak',
              revisionMandate: 'revise',
            },
          ];
        },
      },
    },
  });

  assert.equal(run.problemRecovery.title, 'Injected Recovery');
  assert.deepEqual(
    run.candidates.map((candidate) => candidate.id),
    ['injected_a', 'injected_b'],
  );
  assert.equal(run.criticVerdicts.length, 2);
  assert.equal(run.fusion?.parentCandidateIds[0], 'injected_a');
});

test('runs through replayed model generation providers', async () => {
  const prompts = {
    recovery: 'recover for run model',
    candidates: 'generate for run model',
    critics: 'judge for run model',
  };
  const records: ModelCallRecord[] = [
    {
      id: 'call_recovery',
      runId: 'run_model_generation',
      purpose: 'problem_recovery',
      provider: 'replay',
      model: 'fixture-model',
      prompt: prompts.recovery,
      outputText: JSON.stringify({
        title: 'Replay Model Recovery',
        recoveredProblem: 'Recovered through the model gateway.',
        hiddenConstraint: 'Model outputs must become contracts.',
        falsifier: 'The loop ignores the model provider.',
      }),
      metadata: {},
    },
    {
      id: 'call_candidates',
      runId: 'run_model_generation',
      purpose: 'candidate_generation',
      provider: 'replay',
      model: 'fixture-model',
      prompt: prompts.candidates,
      outputText: JSON.stringify({
        candidates: [
          {
            id: 'gateway_a',
            agenomeId: 'ag_gateway',
            title: 'Gateway A',
            summary: 'summary',
            mechanism: 'mechanism',
            claimedDelta: 'delta',
            citedKnowledge: ['K1'],
          },
          {
            id: 'gateway_b',
            agenomeId: 'ag_gateway',
            title: 'Gateway B',
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
      runId: 'run_model_generation',
      purpose: 'critic_judgment',
      provider: 'replay',
      model: 'fixture-model',
      prompt: prompts.critics,
      outputText: JSON.stringify({
        verdicts: [
          {
            candidateId: 'gateway_a',
            criticId: 'grounding',
            score: 80,
            pressure: 'strong',
            revisionMandate: 'keep',
          },
          {
            candidateId: 'gateway_b',
            criticId: 'grounding',
            score: 40,
            pressure: 'weaker',
            revisionMandate: 'revise',
          },
        ],
      }),
      metadata: {},
    },
  ];

  const run = await runKernel({
    runId: 'run_model_generation',
    casePath: 'case-studies/fsd-ownership-unwind/problem-statement.md',
    fixturePath: 'kernel/fixtures/fsd-ownership-unwind/run-fixture.json',
    knowledgePacketPath: 'kernel/fixtures/fsd-ownership-unwind/knowledge-packet.json',
    memoryMode: 'auto',
    generationProviders: createModelGenerationProviders({
      client: createReplayModelClient(records),
      model: 'fixture-model',
      prompts: {
        problemRecovery: () => prompts.recovery,
        candidateGeneration: () => prompts.candidates,
        criticJudgment: () => prompts.critics,
      },
    }),
  });

  assert.equal(run.problemRecovery.title, 'Replay Model Recovery');
  assert.deepEqual(
    run.candidates.map((candidate) => candidate.id),
    ['gateway_a', 'gateway_b'],
  );
  assert.equal(run.fusion?.inheritanceWeights.parentA, 0.667);
  assert.equal(run.modelCallRecords?.length, 3);
  assert.deepEqual(
    run.modelCallRecords?.map((record) => record.purpose),
    ['problem_recovery', 'candidate_generation', 'critic_judgment'],
  );
});
