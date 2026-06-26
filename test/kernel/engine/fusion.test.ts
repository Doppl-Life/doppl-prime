import test from 'node:test';
import assert from 'node:assert/strict';
import { fuseCandidates } from '../../../src/kernel/engine/fusion.ts';

test('fuses candidates with weighted inheritance metadata', () => {
  const fusion = fuseCandidates({
    caseId: 'case',
    parentA: {
      id: 'a',
      caseId: 'case',
      agenomeId: 'ag_a',
      generation: 0,
      title: 'A',
      summary: 'A summary',
      mechanism: 'A mechanism',
      claimedDelta: 'A delta',
      citedKnowledge: ['K1'],
    },
    parentB: {
      id: 'b',
      caseId: 'case',
      agenomeId: 'ag_b',
      generation: 0,
      title: 'B',
      summary: 'B summary',
      mechanism: 'B mechanism',
      claimedDelta: 'B delta',
      citedKnowledge: ['K2'],
    },
    parentAScore: 80,
    parentBScore: 40,
    compatibility: { parentA: 'a', parentB: 'b', score: 76, rationale: 'compatible' },
  });
  assert.equal(fusion.child.generation, 1);
  assert.deepEqual(fusion.inheritanceWeights, { parentA: 0.667, parentB: 0.333 });
  assert.deepEqual(fusion.parentCandidateIds, ['a', 'b']);
});
