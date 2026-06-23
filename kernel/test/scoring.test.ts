import test from 'node:test';
import assert from 'node:assert/strict';
import {
  scoreCandidates,
  selectParents,
  checkPairCompatibility,
  scheduleForGeneration,
} from '../src/scoring.ts';

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

test('keeps novelty and grounding as separate axes before scheduled selection', () => {
  const verdicts = [
    {
      candidateId: 'wild',
      criticId: 'novelty',
      score: 95,
      pressure: 'new terrain',
      revisionMandate: 'ground it',
    },
    {
      candidateId: 'wild',
      criticId: 'grounding',
      score: 35,
      pressure: 'thin evidence',
      revisionMandate: 'cite proof',
    },
    {
      candidateId: 'solid',
      criticId: 'novelty',
      score: 60,
      pressure: 'less surprising',
      revisionMandate: 'find edge',
    },
    {
      candidateId: 'solid',
      criticId: 'grounding',
      score: 80,
      pressure: 'well supported',
      revisionMandate: 'keep mechanism',
    },
  ];

  const divergeRecords = scoreCandidates(verdicts, { generation: 0 });
  const convergeRecords = scoreCandidates(verdicts, { generation: 4 });

  assert.equal(scheduleForGeneration(0).dial, 'diverge');
  assert.equal(scheduleForGeneration(4).dial, 'converge');
  assert.equal(divergeRecords[0]?.candidateId, 'wild');
  assert.equal(convergeRecords[0]?.candidateId, 'solid');
  assert.equal(divergeRecords[0]?.selection?.axes.novelty, 0.95);
  assert.equal(divergeRecords[0]?.selection?.axes.grounding, 0.35);
  assert.equal(divergeRecords[0]?.selection?.proposalRating.scale, '-5_to_5');
});

test('compatibility is separate from fitness', () => {
  const compatibility = checkPairCompatibility('a', 'b');
  assert.equal(compatibility.parentA, 'a');
  assert.equal(compatibility.parentB, 'b');
  assert.ok(compatibility.score > 0);
});
