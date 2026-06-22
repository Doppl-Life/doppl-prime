import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertCandidateSolution,
  assertCriticVerdict,
  assertFitnessRecord,
  assertFusionResult,
  assertKernelRun,
  assertKnowledgePacket,
  assertProblemRecovery,
  calculateInheritanceWeights,
} from '../src/contracts.ts';

test('inheritance weights preserve a 2:1 parent fitness ratio', () => {
  assert.deepEqual(calculateInheritanceWeights(80, 40), { parentA: 0.667, parentB: 0.333 });
});

test('kernel run assertion rejects missing problem recovery', () => {
  assert.throws(() => assertKernelRun({ id: 'run_bad' }), /problemRecovery/);
});

test('knowledge packet assertion rejects malformed items', () => {
  assert.throws(
    () =>
      assertKnowledgePacket({
        id: 'packet_bad',
        targetCase: 'case_a',
        items: [{ citeHandle: 'K1' }],
        excluded: [],
      }),
    /KnowledgePacket.items\[0\].recordId/,
  );
});

test('problem recovery assertion requires cited knowledge references', () => {
  assert.throws(
    () =>
      assertProblemRecovery({
        id: 'recovery_a',
        caseId: 'case_a',
        title: 'Recover A',
        recoveredProblem: 'problem',
        hiddenConstraint: 'constraint',
        falsifier: 'falsifier',
      }),
    /ProblemRecovery.citedKnowledge/,
  );
});

test('candidate assertion rejects invalid generation metadata', () => {
  assert.throws(
    () =>
      assertCandidateSolution({
        id: 'cand_a',
        caseId: 'case_a',
        agenomeId: 'ag_a',
        generation: -1,
        title: 'Candidate A',
        summary: 'summary',
        mechanism: 'mechanism',
        claimedDelta: 'delta',
        citedKnowledge: [],
      }),
    /CandidateSolution.generation/,
  );
});

test('critic assertion rejects scores outside the bounded range', () => {
  assert.throws(
    () =>
      assertCriticVerdict({
        candidateId: 'cand_a',
        criticId: 'novelty',
        score: 101,
        pressure: 'too high',
        revisionMandate: 'revise',
      }),
    /CriticVerdict.score/,
  );
});

test('fitness assertion validates component totals', () => {
  assert.throws(
    () =>
      assertFitnessRecord({
        candidateId: 'cand_a',
        total: 80,
        components: {
          novelty: 80,
          grounding: 80,
          mechanismClarity: 80,
          mechanismCost: 80,
          criticPressure: 80,
          evidenceQuality: Number.NaN,
        },
        rationale: 'rationale',
      }),
    /FitnessRecord.components.evidenceQuality/,
  );
});

test('fusion assertion validates parent tuple shape', () => {
  assert.throws(
    () =>
      assertFusionResult({
        child: {
          id: 'child_a_b',
          caseId: 'case_a',
          agenomeId: 'ag_child',
          generation: 1,
          title: 'Child',
          summary: 'summary',
          mechanism: 'mechanism',
          claimedDelta: 'delta',
          citedKnowledge: [],
        },
        parentCandidateIds: ['cand_a'],
        compatibility: { parentA: 'cand_a', parentB: 'cand_b', score: 70, rationale: 'compatible' },
        inheritanceWeights: { parentA: 0.5, parentB: 0.5 },
        inheritedTraits: [],
        mutationNotes: [],
      }),
    /FusionResult.parentCandidateIds/,
  );
});
