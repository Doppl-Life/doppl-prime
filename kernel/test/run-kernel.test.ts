import test from 'node:test';
import assert from 'node:assert/strict';
import { runKernel } from '../src/run-kernel.ts';

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
