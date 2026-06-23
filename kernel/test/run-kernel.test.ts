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
  assert.ok((run.fusion?.inheritanceWeights.parentA || 0) > 0.5);
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

test('can evolve a child across multiple generations', async () => {
  const run = await runKernel({
    runId: 'run_evolution',
    casePath: 'case-studies/fsd-ownership-unwind/problem-statement.md',
    fixturePath: 'kernel/fixtures/fsd-ownership-unwind/run-fixture.json',
    knowledgePacketPath: 'kernel/fixtures/fsd-ownership-unwind/knowledge-packet.json',
    memoryMode: 'auto',
    generations: 2,
    generationProviders: {
      problemRecovery: {
        async recover({ caseStudy }) {
          return {
            id: `evolution_recovery_${caseStudy.id}`,
            caseId: caseStudy.id,
            title: 'Evolution Recovery',
            recoveredProblem: 'Recover once and let the population evolve.',
            hiddenConstraint: 'A child must be eligible in the next generation.',
            falsifier: 'Generation one only judges fresh candidates.',
            citedKnowledge: [],
          };
        },
      },
      candidateGenerator: {
        async generate({ caseStudy, generation }) {
          return [
            {
              id: `evo_${generation}_a`,
              caseId: caseStudy.id,
              agenomeId: `ag_evo_${generation}_a`,
              generation,
              title: `Evolution ${generation} A`,
              summary: 'summary',
              mechanism: 'mechanism',
              claimedDelta: 'delta',
              citedKnowledge: [],
            },
            {
              id: `evo_${generation}_b`,
              caseId: caseStudy.id,
              agenomeId: `ag_evo_${generation}_b`,
              generation,
              title: `Evolution ${generation} B`,
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
          return candidates.map((candidate, index) => ({
            candidateId: candidate.id,
            criticId: 'evolution',
            score: candidate.id.startsWith('child_') ? 95 : 80 - index,
            pressure: `${candidate.id} pressure`,
            revisionMandate: 'continue',
          }));
        },
      },
    },
  });

  assert.equal(run.evolution.length, 2);
  assert.deepEqual(run.evolution.map((generation) => generation.generation), [0, 1]);
  assert.equal(run.evolution[0]!.childId?.startsWith('child_'), true);
  assert.ok(run.evolution[1]!.candidateIds.includes(run.evolution[0]!.childId!));
  assert.equal(run.fusion?.parentCandidateIds[0], run.evolution[0]!.childId);
  assert.equal(run.fusion?.child.generation, 2);
});

test('stops evolution when the generation budget is exhausted', async () => {
  let generateCalls = 0;
  const run = await runKernel({
    runId: 'run_budgeted_evolution',
    casePath: 'case-studies/fsd-ownership-unwind/problem-statement.md',
    fixturePath: 'kernel/fixtures/fsd-ownership-unwind/run-fixture.json',
    knowledgePacketPath: 'kernel/fixtures/fsd-ownership-unwind/knowledge-packet.json',
    memoryMode: 'auto',
    generations: 3,
    evolutionBudget: { maxUnits: 1 },
    generationProviders: {
      problemRecovery: {
        async recover({ caseStudy }) {
          return {
            id: `budget_recovery_${caseStudy.id}`,
            caseId: caseStudy.id,
            title: 'Budget Recovery',
            recoveredProblem: 'Recover once inside a bounded evolution run.',
            hiddenConstraint: 'The budget must stop extra generations.',
            falsifier: 'More generations run than the budget allows.',
            citedKnowledge: [],
          };
        },
      },
      candidateGenerator: {
        async generate({ caseStudy, generation }) {
          generateCalls += 1;
          return [
            {
              id: `budget_${generation}_a`,
              caseId: caseStudy.id,
              agenomeId: `ag_budget_${generation}_a`,
              generation,
              title: `Budget ${generation} A`,
              summary: 'summary',
              mechanism: 'mechanism',
              claimedDelta: 'delta',
              citedKnowledge: [],
            },
            {
              id: `budget_${generation}_b`,
              caseId: caseStudy.id,
              agenomeId: `ag_budget_${generation}_b`,
              generation,
              title: `Budget ${generation} B`,
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
          return candidates.map((candidate, index) => ({
            candidateId: candidate.id,
            criticId: 'budget',
            score: 90 - index,
            pressure: 'bounded',
            revisionMandate: 'respect budget',
          }));
        },
      },
    },
  });

  assert.equal(generateCalls, 1);
  assert.equal(run.evolution.length, 1);
  assert.deepEqual(run.budget, {
    maxUnits: 1,
    usedUnits: 1,
    remainingUnits: 0,
    exhausted: true,
  });
  assert.ok(
    run.events.some(
      (event) => event.type === 'evolution.budget_exhausted' && event.payload.generation === 1,
    ),
  );
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
  assert.deepEqual(
    run.events
      .filter((event) => event.type.startsWith('model.output_'))
      .map((event) => [event.type, event.payload.purpose]),
    [
      ['model.output_accepted', 'problem_recovery'],
      ['model.output_accepted', 'candidate_generation'],
      ['model.output_accepted', 'critic_judgment'],
    ],
  );
});

test('emits model lifecycle trace events for repaired outputs', async () => {
  const prompts = {
    recovery: 'recover repair trace',
    candidates: 'generate repair trace',
    critics: 'judge repair trace',
  };
  const records: ModelCallRecord[] = [
    {
      id: 'call_bad_recovery',
      runId: 'run_model_repair_trace',
      purpose: 'problem_recovery',
      provider: 'replay',
      model: 'fixture-model',
      prompt: prompts.recovery,
      outputText: '{"title":',
      metadata: {},
    },
    {
      id: 'call_repaired_recovery',
      runId: 'run_model_repair_trace',
      purpose: 'problem_recovery.repair',
      provider: 'replay',
      model: 'fixture-model',
      prompt: [
        prompts.recovery,
        '',
        'Repair the previous output into valid JSON only.',
        'Previous output:',
        '{"title":',
      ].join('\n'),
      outputText: JSON.stringify({
        title: 'Repaired Recovery',
        recoveredProblem: 'Recovered through repair.',
        hiddenConstraint: 'Repair lifecycle should be visible.',
        falsifier: 'Repair events are absent.',
      }),
      metadata: {},
    },
    {
      id: 'call_candidates',
      runId: 'run_model_repair_trace',
      purpose: 'candidate_generation',
      provider: 'replay',
      model: 'fixture-model',
      prompt: prompts.candidates,
      outputText: JSON.stringify({
        candidates: [
          {
            id: 'repair_a',
            agenomeId: 'ag_gateway',
            title: 'Repair A',
            summary: 'summary',
            mechanism: 'mechanism',
            claimedDelta: 'delta',
            citedKnowledge: ['K1'],
          },
          {
            id: 'repair_b',
            agenomeId: 'ag_gateway',
            title: 'Repair B',
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
      runId: 'run_model_repair_trace',
      purpose: 'critic_judgment',
      provider: 'replay',
      model: 'fixture-model',
      prompt: prompts.critics,
      outputText: JSON.stringify({
        verdicts: [
          {
            candidateId: 'repair_a',
            criticId: 'grounding',
            score: 80,
            pressure: 'strong',
            revisionMandate: 'keep',
          },
          {
            candidateId: 'repair_b',
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
    runId: 'run_model_repair_trace',
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

  assert.deepEqual(
    run.events
      .filter((event) => event.type.startsWith('model.output_'))
      .map((event) => [event.type, event.payload.purpose]),
    [
      ['model.output_repair_requested', 'problem_recovery'],
      ['model.output_repaired', 'problem_recovery.repair'],
      ['model.output_accepted', 'candidate_generation'],
      ['model.output_accepted', 'critic_judgment'],
    ],
  );
});
