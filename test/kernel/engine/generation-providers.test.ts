import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCaseStudy } from '../../../src/kernel/discovery/case-loader.ts';
import { createJsonKnowledgeGateway } from '../../../src/kernel/discovery/knowledge-gateway.ts';
import type { CriticVerdict } from '../../../src/kernel/boundary.ts';
import {
  createFixtureGenerationProviders,
  createDefaultModelGenerationPrompts,
  createModelGenerationProviders,
  regimeMutagens,
  type CandidateGenerator,
  type CriticCouncil,
} from '../../../src/kernel/engine/generation-providers.ts';
import { createReplayModelClient, type ModelCallRecord } from '../../../src/kernel/model/model-gateway.ts';
import { initialAgenomePool } from '../../../src/kernel/engine/agenomes.ts';

test('the tide adapts: a converged population reaches for divergence, a scattered one consolidates', () => {
  const verdict = (score: number): CriticVerdict => ({
    candidateId: 'c',
    criticId: 'k',
    score,
    pressure: '',
    revisionMandate: '',
  });
  assert.ok(regimeMutagens([verdict(9), verdict(10)]).includes('polymath'));
  assert.ok(regimeMutagens([verdict(2), verdict(10)]).includes('breakthrough'));
  const balanced = regimeMutagens([verdict(6), verdict(10)]);
  assert.ok(balanced.includes('blindside') && !balanced.includes('polymath'));
});

test('the problem_recovery arrow breeds problem-frames from the seed', async () => {
  const caseStudy = await loadCaseStudy('test/fixtures/fsd-seed.json');
  const gateway = await createJsonKnowledgeGateway(
    'test/fixtures/kernel/fsd-ownership-unwind/knowledge-packet.json',
  );
  const knowledgePacket = await gateway.selectPacket({ runId: 'run_frames', targetCase: caseStudy.id, maxItems: 3 });
  const providers = await createFixtureGenerationProviders(
    'test/fixtures/kernel/fsd-ownership-unwind/run-fixture.json',
  );

  const frames = await providers.candidateGenerator.generate({
    runId: 'run_frames',
    caseStudy,
    stage: 'problem_recovery',
    knowledgePacket,
    generation: 0,
  });
  assert.ok(frames.length >= 2, 'a real pass needs a population to select from');
  assert.ok(frames.every((frame) => frame.id.startsWith('frame_')));
});

test('fixture generation providers expose candidate and critic boundaries', async () => {
  const caseStudy = await loadCaseStudy('test/fixtures/fsd-seed.json');
  const gateway = await createJsonKnowledgeGateway(
    'test/fixtures/kernel/fsd-ownership-unwind/knowledge-packet.json',
  );
  const knowledgePacket = await gateway.selectPacket({ runId: 'run_provider', targetCase: caseStudy.id, maxItems: 3 });
  const providers = await createFixtureGenerationProviders(
    'test/fixtures/kernel/fsd-ownership-unwind/run-fixture.json',
  );

  const candidates = await providers.candidateGenerator.generate({
    runId: 'run_provider',
    caseStudy,
    stage: 'doppl',
    knowledgePacket,
    generation: 0,
    agenomePool: initialAgenomePool(),
  });
  const secondGenerationCandidates = await providers.candidateGenerator.generate({
    runId: 'run_provider',
    caseStudy,
    stage: 'doppl',
    knowledgePacket,
    generation: 1,
    previousChild: {
      id: 'child_cand_liability_clock_cand_recovery_market',
      caseId: caseStudy.id,
      agenomeId: 'fused_ag_blindside_ag_first_principles',
      generation: 1,
      title: 'Liability Clock / Recovery Market fusion',
      summary: 'Prior survivor summary.',
      mechanism: 'Prior survivor mechanism.',
      claimedDelta: 'Prior survivor delta.',
      citedKnowledge: ['K1', 'K2'],
    },
    previousCriticVerdicts: [],
  });
  const verdicts = await providers.criticCouncil.judge({
    runId: 'run_provider',
    caseStudy,
    stage: 'doppl',
    candidates,
    knowledgePacket,
  });

  assert.equal(candidates.length, 3);
  assert.equal(candidates[0]?.generation, 0);
  assert.match(candidates[0]?.summary || '', /Agenome/);
  assert.match(candidates[0]?.mechanism || '', /Agenome policy/);
  assert.equal(secondGenerationCandidates.length, 3);
  assert.equal(secondGenerationCandidates[0]?.generation, 1);
  assert.notDeepEqual(
    secondGenerationCandidates.map((candidate) => candidate.id),
    candidates.map((candidate) => candidate.id),
  );
  assert.ok(secondGenerationCandidates.every((candidate) => candidate.id.includes('_g1')));
  assert.equal(verdicts.length, 9);
});

test('fixture generation can narrow candidates from the supplied Agenome pool', async () => {
  const caseStudy = await loadCaseStudy('test/fixtures/fsd-seed.json');
  const gateway = await createJsonKnowledgeGateway(
    'test/fixtures/kernel/fsd-ownership-unwind/knowledge-packet.json',
  );
  const knowledgePacket = await gateway.selectPacket({ runId: 'run_provider_pool', targetCase: caseStudy.id, maxItems: 3 });
  const providers = await createFixtureGenerationProviders(
    'test/fixtures/kernel/fsd-ownership-unwind/run-fixture.json',
  );
  const candidates = await providers.candidateGenerator.generate({
    runId: 'run_provider_pool',
    caseStudy,
    stage: 'doppl',
    knowledgePacket,
    generation: 0,
    agenomePool: initialAgenomePool(['ag_blindside', 'ag_first_principles']),
  });

  assert.deepEqual(
    candidates.map((candidate) => candidate.agenomeId).sort(),
    ['ag_blindside', 'ag_first_principles'],
  );
});

test('provider interfaces can be implemented without fixture files', async () => {
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
      return candidates.map((candidate, index) => ({
        candidateId: candidate.id,
        criticId: 'grounding',
        score: index === 0 ? 90 : 50,
        pressure: 'pressure',
        revisionMandate: 'revise',
      }));
    },
  };

  assert.equal(typeof candidateGenerator.generate, 'function');
  assert.equal(typeof criticCouncil.judge, 'function');
});

test('model generation providers parse replayed structured outputs', async () => {
  const caseStudy = await loadCaseStudy('test/fixtures/fsd-seed.json');
  const gateway = await createJsonKnowledgeGateway(
    'test/fixtures/kernel/fsd-ownership-unwind/knowledge-packet.json',
  );
  const knowledgePacket = await gateway.selectPacket({ runId: 'run_model_provider', targetCase: caseStudy.id, maxItems: 2 });
  const prompts = { candidates: 'candidate prompt', critics: 'critic prompt' };
  const records: ModelCallRecord[] = [
    {
      id: 'call_candidates',
      runId: 'run_model_provider',
      purpose: 'candidate_generation',
      provider: 'replay',
      model: 'fixture-model',
      prompt: prompts.candidates,
      outputText: JSON.stringify({
        candidates: [
          { id: 'model_a', agenomeId: 'ag_model', title: 'Model A', summary: 'summary', mechanism: 'mechanism', claimedDelta: 'delta', citedKnowledge: ['K1'] },
          { id: 'model_b', agenomeId: 'ag_model', title: 'Model B', summary: 'summary', mechanism: 'mechanism', claimedDelta: 'delta', citedKnowledge: ['K2'] },
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
          { candidateId: 'model_a', criticId: 'grounding', score: 88, pressure: 'strong', revisionMandate: 'keep' },
          { candidateId: 'model_b', criticId: 'grounding', score: 44, pressure: 'weak', revisionMandate: 'revise' },
        ],
      }),
      metadata: {},
    },
  ];
  const providers = createModelGenerationProviders({
    client: createReplayModelClient(records),
    model: 'fixture-model',
    prompts: { candidateGeneration: () => prompts.candidates, criticJudgment: () => prompts.critics },
  });

  const candidates = await providers.candidateGenerator.generate({
    runId: 'run_model_provider',
    caseStudy,
    stage: 'doppl',
    knowledgePacket,
    generation: 0,
  });
  const verdicts = await providers.criticCouncil.judge({
    runId: 'run_model_provider',
    caseStudy,
    stage: 'doppl',
    candidates,
    knowledgePacket,
  });

  assert.deepEqual(candidates.map((candidate) => candidate.id), ['model_a', 'model_b']);
  assert.equal(candidates[0]?.caseId, caseStudy.id);
  assert.equal(verdicts.length, 2);
  assert.equal(verdicts[0]?.score, 88);
});

test('model generation providers parse replayed clean baseline outputs', async () => {
  const caseStudy = await loadCaseStudy('test/fixtures/fsd-seed.json');
  const gateway = await createJsonKnowledgeGateway(
    'test/fixtures/kernel/fsd-ownership-unwind/knowledge-packet.json',
  );
  const knowledgePacket = await gateway.selectPacket({ runId: 'run_model_clean_baseline', targetCase: caseStudy.id, maxItems: 2 });
  const records: ModelCallRecord[] = [
    {
      id: 'call_clean_baseline',
      runId: 'run_model_clean_baseline',
      purpose: 'control_baseline_generation',
      provider: 'replay',
      model: 'fixture-model',
      prompt: 'clean baseline prompt',
      outputText: JSON.stringify({
        candidate: {
          id: 'clean_model_baseline',
          agenomeId: 'ag_clean_control',
          title: 'Clean Model Baseline',
          summary: 'Single-pass model control answer.',
          mechanism: 'Solve directly before Doppl selection applies pressure.',
          claimedDelta: 'Provides a baseline against the evolved survivor.',
          citedKnowledge: ['K1'],
        },
      }),
      metadata: {},
    },
  ];
  const providers = createModelGenerationProviders({
    client: createReplayModelClient(records),
    model: 'fixture-model',
    prompts: { cleanBaseline: () => 'clean baseline prompt' },
  });

  const baseline = await providers.cleanBaseline!.generate({
    runId: 'run_model_clean_baseline',
    caseStudy,
    stage: 'doppl',
    knowledgePacket,
    generation: 0,
  });

  assert.equal(baseline.id, 'clean_model_baseline');
  assert.equal(baseline.caseId, caseStudy.id);
  assert.equal(baseline.generation, 0);
  assert.equal(baseline.agenomeId, 'ag_clean_control');
  assert.deepEqual(providers.modelCallRecords.map((record) => record.purpose), ['control_baseline_generation']);
});

test('model generation providers expose default prompts and captured call records', async () => {
  const caseStudy = await loadCaseStudy('test/fixtures/fsd-seed.json');
  const gateway = await createJsonKnowledgeGateway(
    'test/fixtures/kernel/fsd-ownership-unwind/knowledge-packet.json',
  );
  const knowledgePacket = await gateway.selectPacket({ runId: 'run_model_defaults', targetCase: caseStudy.id, maxItems: 1 });
  const prompts = createDefaultModelGenerationPrompts();
  const candidatePrompt = prompts.candidateGeneration({ runId: 'run_model_defaults', caseStudy, stage: 'doppl', knowledgePacket, generation: 0 });
  const records: ModelCallRecord[] = [
    {
      id: 'call_candidates',
      runId: 'run_model_defaults',
      purpose: 'candidate_generation',
      provider: 'replay',
      model: 'fixture-model',
      prompt: candidatePrompt,
      outputText: JSON.stringify({
        candidates: [
          { id: 'default_a', agenomeId: 'ag_model', title: 'Default A', summary: 's', mechanism: 'm', claimedDelta: 'd', citedKnowledge: ['K1'] },
          { id: 'default_b', agenomeId: 'ag_model', title: 'Default B', summary: 's', mechanism: 'm', claimedDelta: 'd', citedKnowledge: ['K1'] },
        ],
      }),
      metadata: {},
    },
  ];
  const providers = createModelGenerationProviders({ client: createReplayModelClient(records), model: 'fixture-model', prompts });

  await providers.candidateGenerator.generate({ runId: 'run_model_defaults', caseStudy, stage: 'doppl', knowledgePacket, generation: 0 });

  assert.match(providers.modelCallRecords[0]?.prompt || '', /Return JSON only/);
  assert.match(providers.modelCallRecords[0]?.prompt || '', /FSD|ownership|unwind/i);
});

test('default candidate prompt includes Agenome traits for live generation', async () => {
  const caseStudy = await loadCaseStudy('test/fixtures/fsd-seed.json');
  const gateway = await createJsonKnowledgeGateway(
    'test/fixtures/kernel/fsd-ownership-unwind/knowledge-packet.json',
  );
  const knowledgePacket = await gateway.selectPacket({ runId: 'run_model_agenomes', targetCase: caseStudy.id, maxItems: 1 });
  const prompts = createDefaultModelGenerationPrompts();
  const prompt = prompts.candidateGeneration({
    runId: 'run_model_agenomes',
    caseStudy,
    stage: 'doppl',
    knowledgePacket,
    generation: 0,
    agenomePool: initialAgenomePool(['ag_blindside']),
  });

  assert.match(prompt, /Agenome pool/);
  assert.match(prompt, /ag_blindside/);
  assert.match(prompt, /Adversarial market scout/);
  assert.match(prompt, /weights=novelty/);
  assert.match(prompt, /Choose agenomeId from the supplied Agenome pool/);
});

test('model generation providers request schemas for structured outputs', async () => {
  const caseStudy = await loadCaseStudy('test/fixtures/fsd-seed.json');
  const gateway = await createJsonKnowledgeGateway(
    'test/fixtures/kernel/fsd-ownership-unwind/knowledge-packet.json',
  );
  const knowledgePacket = await gateway.selectPacket({ runId: 'run_model_schemas', targetCase: caseStudy.id, maxItems: 1 });
  const requestedSchemas: Array<string | undefined> = [];
  const providers = createModelGenerationProviders({
    model: 'fixture-model',
    client: {
      async complete(request) {
        requestedSchemas.push(request.responseSchema?.name);
        if (request.purpose === 'candidate_generation') {
          return {
            id: 'call_candidates',
            runId: request.runId,
            purpose: request.purpose,
            provider: 'stub',
            model: request.model,
            prompt: request.prompt,
            outputText: JSON.stringify({
              candidates: [
                { id: 'schema_a', agenomeId: 'ag_blindside', title: 'Schema Candidate A', summary: 'First schema candidate.', mechanism: 'Uses structured candidate output.', claimedDelta: 'Stable parsing.', citedKnowledge: ['K1'] },
                { id: 'schema_b', agenomeId: 'ag_first_principles', title: 'Schema Candidate B', summary: 'Second schema candidate.', mechanism: 'Uses structured candidate output.', claimedDelta: 'Stable parsing.', citedKnowledge: ['K1'] },
              ],
            }),
            metadata: {},
          };
        }
        return {
          id: 'call_critics',
          runId: request.runId,
          purpose: request.purpose,
          provider: 'stub',
          model: request.model,
          prompt: request.prompt,
          outputText: JSON.stringify({
            verdicts: [
              { candidateId: 'schema_a', criticId: 'grounding', score: 88, pressure: 'Grounded.', revisionMandate: 'Keep it specific.' },
              { candidateId: 'schema_b', criticId: 'grounding', score: 77, pressure: 'Mostly grounded.', revisionMandate: 'Tighten mechanism.' },
            ],
          }),
          metadata: {},
        };
      },
    },
  });

  const candidates = await providers.candidateGenerator.generate({ runId: 'run_model_schemas', caseStudy, stage: 'doppl', knowledgePacket, generation: 0 });
  await providers.criticCouncil.judge({ runId: 'run_model_schemas', caseStudy, stage: 'doppl', candidates, knowledgePacket });

  assert.deepEqual(requestedSchemas, ['candidate_generation', 'critic_judgment']);
});

test('model generation providers repair invalid structured outputs once', async () => {
  const caseStudy = await loadCaseStudy('test/fixtures/fsd-seed.json');
  const gateway = await createJsonKnowledgeGateway(
    'test/fixtures/kernel/fsd-ownership-unwind/knowledge-packet.json',
  );
  const knowledgePacket = await gateway.selectPacket({ runId: 'run_model_repair', targetCase: caseStudy.id, maxItems: 1 });
  const calls: string[] = [];
  const providers = createModelGenerationProviders({
    model: 'fixture-model',
    client: {
      async complete(request) {
        calls.push(request.purpose);
        if (calls.length === 1) {
          return { id: 'call_bad', runId: request.runId, purpose: request.purpose, provider: 'stub', model: request.model, prompt: request.prompt, outputText: '{"candidates":', metadata: {} };
        }
        return {
          id: 'call_repaired',
          runId: request.runId,
          purpose: request.purpose,
          provider: 'stub',
          model: request.model,
          prompt: request.prompt,
          outputText: JSON.stringify({
            candidates: [
              { id: 'repaired_a', agenomeId: 'ag_model', title: 'Repaired A', summary: 's', mechanism: 'm', claimedDelta: 'd', citedKnowledge: ['K1'] },
              { id: 'repaired_b', agenomeId: 'ag_model', title: 'Repaired B', summary: 's', mechanism: 'm', claimedDelta: 'd', citedKnowledge: ['K1'] },
            ],
          }),
          metadata: {},
        };
      },
    },
  });

  const candidates = await providers.candidateGenerator.generate({ runId: 'run_model_repair', caseStudy, stage: 'doppl', knowledgePacket, generation: 0 });

  assert.deepEqual(candidates.map((candidate) => candidate.id), ['repaired_a', 'repaired_b']);
  assert.deepEqual(calls, ['candidate_generation', 'candidate_generation.repair']);
  assert.equal(providers.modelCallRecords.length, 2);
  assert.equal(providers.modelCallRecords[0]?.metadata.status, 'repair_requested');
  assert.equal(providers.modelCallRecords[1]?.metadata.status, 'repaired');
});

test('model generation providers reject output after one failed repair', async () => {
  const caseStudy = await loadCaseStudy('test/fixtures/fsd-seed.json');
  const gateway = await createJsonKnowledgeGateway(
    'test/fixtures/kernel/fsd-ownership-unwind/knowledge-packet.json',
  );
  const knowledgePacket = await gateway.selectPacket({ runId: 'run_model_reject', targetCase: caseStudy.id, maxItems: 1 });
  const providers = createModelGenerationProviders({
    model: 'fixture-model',
    client: {
      async complete(request) {
        return { id: `call_${request.purpose}`, runId: request.runId, purpose: request.purpose, provider: 'stub', model: request.model, prompt: request.prompt, outputText: '{"still":', metadata: {} };
      },
    },
  });

  await assert.rejects(
    () => providers.candidateGenerator.generate({ runId: 'run_model_reject', caseStudy, stage: 'doppl', knowledgePacket, generation: 0 }),
    /model output rejected after repair/,
  );
  assert.equal(providers.modelCallRecords.length, 2);
  assert.equal(providers.modelCallRecords[1]?.metadata.status, 'rejected');
});
