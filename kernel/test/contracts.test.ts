import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertAgenome,
  assertAgenomeEnergyLedgerEntry,
  assertCandidateSolution,
  assertCriticVerdict,
  assertFitnessRecord,
  assertFusionResult,
  assertKernelRun,
  assertKnowledgePacket,
  assertProblemRecovery,
  calculateInheritanceWeights,
} from '../src/contracts.ts';
import { materializeAgenomes } from '../src/agenomes.ts';

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

test('agenome assertion validates durable hereditary fields', () => {
  assert.throws(
    () =>
      assertAgenome({
        id: 'ag_bad',
        label: 'Bad',
        prompt: 'prompt',
        persona: 'persona',
        valueWeights: {
          novelty: 1.2,
          grounding: 0.2,
          feasibility: 0.2,
          skepticism: 0.2,
        },
        toolPermissions: [],
        decompositionPolicy: 'policy',
        spawnBudget: { maxCandidates: 1, maxToolCalls: 0 },
        parentAgenomeIds: [],
        mutations: [],
        energy: { allocated: 1, spent: 0, remaining: 1 },
        candidateIds: [],
        generations: [],
      }),
    /Agenome.valueWeights.novelty/,
  );
});

test('agenome energy ledger assertion validates entry shape', () => {
  assert.throws(
    () =>
      assertAgenomeEnergyLedgerEntry({
        id: 'energy_bad',
        agenomeId: 'ag_bad',
        generation: 0,
        kind: 'burn',
        units: 1,
        reason: 'bad kind',
      }),
    /AgenomeEnergyLedgerEntry.kind/,
  );
});

test('materialized agenomes group candidates into durable runtime objects', () => {
  const agenomes = materializeAgenomes({
    candidates: [
      {
        id: 'cand_a',
        caseId: 'case_a',
        agenomeId: 'ag_blindside',
        generation: 0,
        title: 'A',
        summary: 'summary',
        mechanism: 'mechanism',
        claimedDelta: 'delta',
        citedKnowledge: [],
      },
      {
        id: 'cand_b',
        caseId: 'case_a',
        agenomeId: 'ag_blindside_mutation_g1',
        generation: 1,
        title: 'B',
        summary: 'summary',
        mechanism: 'mechanism',
        claimedDelta: 'delta',
        citedKnowledge: [],
      },
    ],
  });
  assert.equal(agenomes.length, 2);
  assert.equal(agenomes.find((agenome) => agenome.id === 'ag_blindside')?.label, 'Blindside');
  assert.deepEqual(
    agenomes.find((agenome) => agenome.id === 'ag_blindside_mutation_g1')?.parentAgenomeIds,
    ['ag_blindside'],
  );
  assert.equal(
    agenomes.find((agenome) => agenome.id === 'ag_blindside_mutation_g1')?.mutations[0],
    'mutation derived for generation 1',
  );
});

test('materialized fused agenomes inherit parent genetics by fusion weights', () => {
  const agenomes = materializeAgenomes({
    candidates: [
      {
        id: 'cand_a',
        caseId: 'case_a',
        agenomeId: 'ag_blindside',
        generation: 0,
        title: 'A',
        summary: 'summary',
        mechanism: 'mechanism',
        claimedDelta: 'delta',
        citedKnowledge: [],
      },
      {
        id: 'cand_b',
        caseId: 'case_a',
        agenomeId: 'ag_first_principles',
        generation: 0,
        title: 'B',
        summary: 'summary',
        mechanism: 'mechanism',
        claimedDelta: 'delta',
        citedKnowledge: [],
      },
    ],
    fusions: [
      {
        child: {
          id: 'child_a_b',
          caseId: 'case_a',
          agenomeId: 'fused_ag_blindside_ag_first_principles',
          generation: 1,
          title: 'Child',
          summary: 'summary',
          mechanism: 'mechanism',
          claimedDelta: 'delta',
          citedKnowledge: [],
        },
        parentCandidateIds: ['cand_a', 'cand_b'],
        compatibility: { parentA: 'cand_a', parentB: 'cand_b', score: 80, rationale: 'compatible' },
        inheritanceWeights: { parentA: 0.667, parentB: 0.333 },
        inheritedTraits: [],
        mutationNotes: [],
      },
    ],
  });
  const fused = agenomes.find((agenome) => agenome.id === 'fused_ag_blindside_ag_first_principles');
  assert.deepEqual(fused?.parentAgenomeIds, ['ag_blindside', 'ag_first_principles']);
  assert.equal(fused?.valueWeights.novelty, 0.3);
  assert.match(fused?.persona || '', /Adversarial market scout/);
  assert.match(fused?.mutations[0] || '', /fused from ag_blindside \+ ag_first_principles/);
});

test('materialized agenomes derive energy from ledger entries when present', () => {
  const agenomes = materializeAgenomes({
    candidates: [
      {
        id: 'cand_a',
        caseId: 'case_a',
        agenomeId: 'ag_blindside',
        generation: 0,
        title: 'A',
        summary: 'summary',
        mechanism: 'mechanism',
        claimedDelta: 'delta',
        citedKnowledge: [],
      },
    ],
    energyLedger: [
      {
        id: 'energy_0',
        agenomeId: 'ag_blindside',
        generation: 0,
        kind: 'allocation',
        units: 5,
        reason: 'spawn_budget_opened',
      },
      {
        id: 'energy_1',
        agenomeId: 'ag_blindside',
        generation: 0,
        kind: 'spend',
        units: 2,
        reason: 'candidate_generated',
        candidateId: 'cand_a',
      },
    ],
  });
  assert.deepEqual(agenomes[0]?.energy, { allocated: 5, spent: 2, remaining: 3 });
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
