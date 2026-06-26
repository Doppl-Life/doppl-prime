import test from 'node:test';
import assert from 'node:assert/strict';
import { runKernel } from '../../src/kernel/run-kernel.ts';
import { createModelGenerationProviders } from '../../src/kernel/generation-providers.ts';
import { createReplayModelClient, type ModelCallRecord } from '../../src/kernel/model-gateway.ts';

test('runs deterministic kernel loop end to end', async () => {
  const run = await runKernel({
    runId: 'run_test',
    casePath: 'fixtures/fsd-seed.json',
    fixturePath: 'fixtures/kernel/fsd-ownership-unwind/run-fixture.json',
    knowledgePacketPath: 'fixtures/kernel/fsd-ownership-unwind/knowledge-packet.json',
    memoryMode: 'auto',
  });
  assert.equal(run.problemRecovery.caseId, 'fsd-ownership-unwind');
  assert.equal(run.candidates.length, 3);
  assert.equal(run.selectedParents.length, 2);
  assert.ok((run.fusion?.inheritanceWeights.parentA || 0) > 0.5);
  assert.ok(run.events.some((event) => event.type === 'knowledge.packet_selected'));
  assert.ok(run.agenomes.length >= 2);
  assert.ok(run.agenomes.some((agenome) => agenome.id === run.candidates[0]?.agenomeId));
  assert.ok(run.events.some((event) => event.type === 'agenome.materialized'));
  assert.ok(run.energyLedger.some((entry) => entry.kind === 'allocation'));
  assert.ok(run.energyLedger.some((entry) => entry.kind === 'spend'));
  assert.ok(run.events.some((event) => event.type === 'agenome.energy_allocated'));
  assert.ok(run.events.some((event) => event.type === 'agenome.energy_spent'));
  assert.equal(
    run.agenomes.find((agenome) => agenome.id === run.candidates[0]?.agenomeId)?.energy.spent,
    run.energyLedger
      .filter((entry) => entry.agenomeId === run.candidates[0]?.agenomeId && entry.kind === 'spend')
      .reduce((sum, entry) => sum + entry.units, 0),
  );
});

test('tags mutated candidates with their mutagen and accumulates the lineage', async () => {
  const run = await runKernel({
    runId: 'run_mutagen',
    casePath: 'fixtures/fsd-seed.json',
    fixturePath: 'fixtures/kernel/fsd-ownership-unwind/run-fixture.json',
    knowledgePacketPath: 'fixtures/kernel/fsd-ownership-unwind/knowledge-packet.json',
    memoryMode: 'auto',
    generations: 2,
  });

  // Generation-0 candidates are seeds (no mutagen). Generation >= 1 mutations are each
  // tagged with the mutagen that made them, and that mutagen is in their lineage.
  const mutated = run.candidates.filter((candidate) => candidate.mutagen !== undefined);
  assert.ok(mutated.length >= 3, 'expected mutated candidates from a second generation');
  for (const candidate of mutated) {
    assert.ok(
      candidate.mutagenLineage?.includes(candidate.mutagen),
      `lineage of ${candidate.id} should include its mutagen ${candidate.mutagen}`,
    );
  }
  // Under adaptive selection the exact mutagens depend on the regime; assert they are all known.
  const KNOWN_MUTAGENS = new Set([
    'breakthrough',
    'addition-by-subtraction',
    'breakout',
    'blindside',
    'first-principles',
    'constraint-injection',
    'polymath',
  ]);
  for (const used of mutated.map((candidate) => candidate.mutagen)) {
    assert.ok(KNOWN_MUTAGENS.has(used), `${used} should be a known mutagen`);
  }

  // The final survivor (a fused child) has no single mutagen, but its lineage accumulates
  // the moves that shaped it across generations — the witness into the process.
  assert.ok(run.fusion);
  assert.equal(run.fusion?.child.mutagen, undefined);
  assert.ok(
    (run.fusion?.child.mutagenLineage?.length ?? 0) > 0,
    'survivor lineage should accumulate mutagens through generations',
  );
});

test('runs through injected generation providers', async () => {
  const run = await runKernel({
    runId: 'run_injected',
    casePath: 'fixtures/fsd-seed.json',
    fixturePath: 'fixtures/kernel/fsd-ownership-unwind/run-fixture.json',
    knowledgePacketPath: 'fixtures/kernel/fsd-ownership-unwind/knowledge-packet.json',
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

test('runs a clean baseline outside evolutionary selection', async () => {
  const run = await runKernel({
    runId: 'run_clean_baseline',
    casePath: 'fixtures/fsd-seed.json',
    fixturePath: 'fixtures/kernel/fsd-ownership-unwind/run-fixture.json',
    knowledgePacketPath: 'fixtures/kernel/fsd-ownership-unwind/knowledge-packet.json',
    memoryMode: 'auto',
    generationProviders: {
      problemRecovery: {
        async recover({ caseStudy }) {
          return {
            id: `clean_recovery_${caseStudy.id}`,
            caseId: caseStudy.id,
            title: 'Clean Recovery',
            recoveredProblem: 'Recover once and compare to a clean agent baseline.',
            hiddenConstraint: 'The clean baseline must not enter parent selection.',
            falsifier: 'The clean baseline becomes a fused parent.',
            citedKnowledge: [],
          };
        },
      },
      cleanBaseline: {
        async generate({ caseStudy }) {
          return {
            id: 'clean_agent_baseline',
            caseId: caseStudy.id,
            agenomeId: 'ag_clean_control',
            generation: 0,
            title: 'Clean Agent Baseline',
            summary: 'A single-pass clean agent answer with no Doppl fusion.',
            mechanism: 'Solve directly from the recovered problem and knowledge packet.',
            claimedDelta: 'Provides a control lane for the Doppl survivor.',
            citedKnowledge: [],
          };
        },
      },
      candidateGenerator: {
        async generate({ caseStudy, generation }) {
          return [
            {
              id: `evolved_${generation}_a`,
              caseId: caseStudy.id,
              agenomeId: 'ag_evolved_a',
              generation,
              title: 'Evolved A',
              summary: 'summary',
              mechanism: 'mechanism',
              claimedDelta: 'delta',
              citedKnowledge: [],
            },
            {
              id: `evolved_${generation}_b`,
              caseId: caseStudy.id,
              agenomeId: 'ag_evolved_b',
              generation,
              title: 'Evolved B',
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
            criticId: 'clean-control',
            score: candidate.id === 'clean_agent_baseline' ? 70 : 90 - index,
            pressure: `${candidate.id} pressure`,
            revisionMandate: 'compare honestly',
          }));
        },
      },
    },
  });

  assert.equal(run.controlBaseline?.id, 'clean_agent_baseline');
  assert.equal(run.candidates.some((candidate) => candidate.id === 'clean_agent_baseline'), false);
  assert.deepEqual(run.fusion?.parentCandidateIds, ['evolved_0_a', 'evolved_0_b']);
  assert.ok(run.fitnessRecords.some((record) => record.candidateId === 'clean_agent_baseline'));
  assert.ok(run.events.some((event) => event.type === 'control_baseline.created'));
  assert.ok(run.events.some((event) => event.type === 'control_baseline.scored'));
});

test('can evolve a child across multiple generations', async () => {
  const seenAgenomePools: string[][] = [];
  const run = await runKernel({
    runId: 'run_evolution',
    casePath: 'fixtures/fsd-seed.json',
    fixturePath: 'fixtures/kernel/fsd-ownership-unwind/run-fixture.json',
    knowledgePacketPath: 'fixtures/kernel/fsd-ownership-unwind/knowledge-packet.json',
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
        async generate({ caseStudy, generation, agenomePool }) {
          seenAgenomePools.push((agenomePool || []).map((agenome) => agenome.id));
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
  assert.ok(seenAgenomePools[0]?.includes('ag_blindside'));
  assert.ok(seenAgenomePools[1]?.some((id) => id.startsWith('fused_')));
  assert.deepEqual(run.evolution.map((generation) => generation.generation), [0, 1]);
  assert.equal(run.evolution[0]!.childId?.startsWith('child_'), true);
  assert.ok(run.evolution[1]!.candidateIds.includes(run.evolution[0]!.childId!));
  assert.equal(run.fusion?.parentCandidateIds[0], run.evolution[0]!.childId);
  assert.equal(run.fusion?.child.generation, 2);
  assert.equal(run.fusionChildren.length, 2);
  assert.deepEqual(
    run.fusionChildren.map((fusion) => fusion.child.id),
    [run.evolution[0]!.childId, run.evolution[1]!.childId],
  );
  assert.ok(
    run.agenomes.some((agenome) => agenome.candidateIds.includes(run.evolution[0]!.childId!)),
  );
  assert.ok(
    run.agenomes
      .find((agenome) => agenome.id === run.fusion?.child.agenomeId)
      ?.parentAgenomeIds.includes(run.fusionChildren[0]!.child.agenomeId),
  );
});

test('stops evolution when the generation budget is exhausted', async () => {
  let generateCalls = 0;
  const run = await runKernel({
    runId: 'run_budgeted_evolution',
    casePath: 'fixtures/fsd-seed.json',
    fixturePath: 'fixtures/kernel/fsd-ownership-unwind/run-fixture.json',
    knowledgePacketPath: 'fixtures/kernel/fsd-ownership-unwind/knowledge-packet.json',
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
    cleanBaseline: 'clean baseline for run model',
    controlCritics: 'judge clean baseline for run model',
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
      id: 'call_clean_baseline',
      runId: 'run_model_generation',
      purpose: 'control_baseline_generation',
      provider: 'replay',
      model: 'fixture-model',
      prompt: prompts.cleanBaseline,
      outputText: JSON.stringify({
        candidate: {
          id: 'clean_gateway',
          agenomeId: 'ag_clean_control',
          title: 'Clean Gateway',
          summary: 'A direct clean-agent answer before Doppl selection.',
          mechanism: 'Solve directly from recovered problem and knowledge.',
          claimedDelta: 'Provides the control lane.',
          citedKnowledge: ['K1'],
        },
      }),
      metadata: {},
    },
    {
      id: 'call_control_critics',
      runId: 'run_model_generation',
      purpose: 'critic_judgment',
      provider: 'replay',
      model: 'fixture-model',
      prompt: prompts.controlCritics,
      outputText: JSON.stringify({
        verdicts: [
          {
            candidateId: 'clean_gateway',
            criticId: 'grounding',
            score: 55,
            pressure: 'Useful but less specific than the evolved population.',
            revisionMandate: 'Add sharper evidence.',
          },
        ],
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
    casePath: 'fixtures/fsd-seed.json',
    fixturePath: 'fixtures/kernel/fsd-ownership-unwind/run-fixture.json',
    knowledgePacketPath: 'fixtures/kernel/fsd-ownership-unwind/knowledge-packet.json',
    memoryMode: 'auto',
    generationProviders: createModelGenerationProviders({
      client: createReplayModelClient(records),
      model: 'fixture-model',
      prompts: {
        problemRecovery: () => prompts.recovery,
        cleanBaseline: () => prompts.cleanBaseline,
        candidateGeneration: () => prompts.candidates,
        criticJudgment: ({ candidates }) =>
          candidates.some((candidate) => candidate.id === 'clean_gateway')
            ? prompts.controlCritics
            : prompts.critics,
      },
    }),
  });

  assert.equal(run.problemRecovery.title, 'Replay Model Recovery');
  assert.deepEqual(
    run.candidates.map((candidate) => candidate.id),
    ['gateway_a', 'gateway_b'],
  );
  assert.equal(run.controlBaseline?.id, 'clean_gateway');
  assert.equal(run.candidates.some((candidate) => candidate.id === 'clean_gateway'), false);
  assert.equal(run.fusion?.inheritanceWeights.parentA, 0.667);
  assert.equal(run.modelCallRecords?.length, 5);
  assert.deepEqual(
    run.modelCallRecords?.map((record) => record.purpose),
    [
      'problem_recovery',
      'control_baseline_generation',
      'critic_judgment',
      'candidate_generation',
      'critic_judgment',
    ],
  );
  const startedEvents = run.events.filter((event) => event.type === 'model.operation_started');
  assert.deepEqual(
    startedEvents.map((event) => event.payload.purpose),
    [
      'problem_recovery',
      'control_baseline_generation',
      'control_baseline_judgment',
      'candidate_generation',
      'critic_judgment',
    ],
  );
  assert.ok(
    startedEvents.every(
      (event) =>
        event.actor === 'system' &&
        event.payload.provider === 'model_generation_provider' &&
        event.payload.model === 'fixture-model' &&
        !('prompt' in event.payload),
    ),
  );
  assert.ok(
    run.events.findIndex((event) => event.type === 'model.operation_started') <
      run.events.findIndex((event) => event.type === 'model.output_accepted'),
  );
  assert.deepEqual(
    run.events
      .filter((event) => event.type.startsWith('model.output_'))
      .map((event) => [event.type, event.payload.purpose]),
    [
      ['model.output_accepted', 'problem_recovery'],
      ['model.output_accepted', 'control_baseline_generation'],
      ['model.output_accepted', 'critic_judgment'],
      ['model.output_accepted', 'candidate_generation'],
      ['model.output_accepted', 'critic_judgment'],
    ],
  );
});

test('emits model lifecycle trace events for repaired outputs', async () => {
  const prompts = {
    recovery: 'recover repair trace',
    cleanBaseline: 'clean baseline repair trace',
    controlCritics: 'judge clean baseline repair trace',
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
      id: 'call_clean_baseline',
      runId: 'run_model_repair_trace',
      purpose: 'control_baseline_generation',
      provider: 'replay',
      model: 'fixture-model',
      prompt: prompts.cleanBaseline,
      outputText: JSON.stringify({
        candidate: {
          id: 'clean_repair',
          agenomeId: 'ag_clean_control',
          title: 'Clean Repair Baseline',
          summary: 'Clean answer for repair trace.',
          mechanism: 'Solve once before evolution.',
          claimedDelta: 'Provides control evidence.',
          citedKnowledge: ['K1'],
        },
      }),
      metadata: {},
    },
    {
      id: 'call_control_critics',
      runId: 'run_model_repair_trace',
      purpose: 'critic_judgment',
      provider: 'replay',
      model: 'fixture-model',
      prompt: prompts.controlCritics,
      outputText: JSON.stringify({
        verdicts: [
          {
            candidateId: 'clean_repair',
            criticId: 'grounding',
            score: 60,
            pressure: 'Clean answer is serviceable.',
            revisionMandate: 'Doppl should beat this with specificity.',
          },
        ],
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
    casePath: 'fixtures/fsd-seed.json',
    fixturePath: 'fixtures/kernel/fsd-ownership-unwind/run-fixture.json',
    knowledgePacketPath: 'fixtures/kernel/fsd-ownership-unwind/knowledge-packet.json',
    memoryMode: 'auto',
    generationProviders: createModelGenerationProviders({
      client: createReplayModelClient(records),
      model: 'fixture-model',
      prompts: {
        problemRecovery: () => prompts.recovery,
        cleanBaseline: () => prompts.cleanBaseline,
        candidateGeneration: () => prompts.candidates,
        criticJudgment: ({ candidates }) =>
          candidates.some((candidate) => candidate.id === 'clean_repair')
            ? prompts.controlCritics
            : prompts.critics,
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
      ['model.output_accepted', 'control_baseline_generation'],
      ['model.output_accepted', 'critic_judgment'],
      ['model.output_accepted', 'candidate_generation'],
      ['model.output_accepted', 'critic_judgment'],
    ],
  );
});
