import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreCandidates, selectParents, checkPairCompatibility } from '../src/scoring.ts';

test('scores candidates and selects parents individually before compatibility', () => {
  const records = scoreCandidates([
    {
      candidateId: 'a',
      criticId: 'critic',
      score: 80,
      pressure: 'good',
      revisionMandate: 'tighten',
    },
    {
      candidateId: 'b',
      criticId: 'critic',
      score: 40,
      pressure: 'thin',
      revisionMandate: 'ground',
    },
    {
      candidateId: 'c',
      criticId: 'critic',
      score: 20,
      pressure: 'weak',
      revisionMandate: 'rewrite',
    },
  ]);
  assert.equal(records[0]?.candidateId, 'a');
  assert.equal(records[1]?.candidateId, 'b');
  assert.deepEqual(selectParents(records), ['a', 'b']);
});

test('compatibility is separate from fitness', () => {
  const compatibility = checkPairCompatibility('a', 'b');
  assert.equal(compatibility.parentA, 'a');
  assert.equal(compatibility.parentB, 'b');
  assert.ok(compatibility.score > 0);
});
