import test from 'node:test';
import assert from 'node:assert/strict';
import {
  scoreCandidates,
  selectParents,
  checkPairCompatibility,
  scheduleForGeneration,
  scheduleForMode,
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

test('schedule mode can force divergent or convergent pressure', () => {
  const verdicts = [
    {
      candidateId: 'wild',
      criticId: 'novelty',
      score: 98,
      pressure: 'very novel',
      revisionMandate: 'ground it',
    },
    {
      candidateId: 'wild',
      criticId: 'grounding',
      score: 20,
      pressure: 'thin',
      revisionMandate: 'cite proof',
    },
    {
      candidateId: 'grounded',
      criticId: 'novelty',
      score: 45,
      pressure: 'familiar',
      revisionMandate: 'find edge',
    },
    {
      candidateId: 'grounded',
      criticId: 'grounding',
      score: 90,
      pressure: 'strong proof',
      revisionMandate: 'keep it testable',
    },
  ];

  const divergeRecords = scoreCandidates(verdicts, { generation: 0, schedule: 'diverge' });
  const convergeRecords = scoreCandidates(verdicts, { generation: 0, schedule: 'converge' });

  assert.equal(scheduleForMode('balanced', 7).dial, 'balanced');
  assert.equal(divergeRecords[0]?.candidateId, 'wild');
  assert.equal(divergeRecords[0]?.selection?.dial, 'diverge');
  assert.equal(divergeRecords[0]?.selection?.weights.novelty, 0.72);
  assert.equal(convergeRecords[0]?.candidateId, 'grounded');
  assert.equal(convergeRecords[0]?.selection?.dial, 'converge');
  assert.equal(convergeRecords[0]?.selection?.weights.grounding, 0.72);
});

test('marks Pareto frontier candidates and selects from the frontier before dominated totals', () => {
  const records = scoreCandidates(
    [
      {
        candidateId: 'balanced',
        criticId: 'novelty',
        score: 70,
        pressure: 'solid novelty',
        revisionMandate: 'keep it distinct',
      },
      {
        candidateId: 'balanced',
        criticId: 'grounding',
        score: 70,
        pressure: 'solid grounding',
        revisionMandate: 'keep it grounded',
      },
      {
        candidateId: 'wild',
        criticId: 'novelty',
        score: 99,
        pressure: 'breaks new terrain',
        revisionMandate: 'prove it',
      },
      {
        candidateId: 'wild',
        criticId: 'grounding',
        score: 20,
        pressure: 'thin grounding',
        revisionMandate: 'find evidence',
      },
      {
        candidateId: 'dominated',
        criticId: 'novelty',
        score: 65,
        pressure: 'nearby',
        revisionMandate: 'sharpen',
      },
      {
        candidateId: 'dominated',
        criticId: 'grounding',
        score: 65,
        pressure: 'nearby',
        revisionMandate: 'sharpen',
      },
    ],
    { generation: 0 },
  );

  const byId = new Map(records.map((record) => [record.candidateId, record]));
  assert.equal(byId.get('balanced')?.selection?.frontier.pareto, true);
  assert.equal(byId.get('wild')?.selection?.frontier.pareto, true);
  assert.equal(byId.get('dominated')?.selection?.frontier.pareto, false);
  assert.deepEqual(byId.get('dominated')?.selection?.frontier.dominatedBy, ['balanced']);
  assert.deepEqual(selectParents(records), ['wild', 'balanced']);
});

test('applies operator lenses after axis scoring without changing axes', () => {
  const verdicts = [
    {
      candidateId: 'grounded',
      criticId: 'novelty',
      score: 50,
      pressure: 'familiar',
      revisionMandate: 'find the edge',
    },
    {
      candidateId: 'grounded',
      criticId: 'grounding',
      score: 90,
      pressure: 'well evidenced',
      revisionMandate: 'keep it testable',
    },
    {
      candidateId: 'loose',
      criticId: 'novelty',
      score: 50,
      pressure: 'same novelty',
      revisionMandate: 'prove it',
    },
    {
      candidateId: 'loose',
      criticId: 'grounding',
      score: 40,
      pressure: 'weak evidence',
      revisionMandate: 'cite proof',
    },
  ];

  const noLens = scoreCandidates(verdicts, { generation: 0 });
  const feasibility = scoreCandidates(verdicts, { generation: 0, lens: 'feasibility' });
  const groundedNoLens = noLens.find((record) => record.candidateId === 'grounded')!;
  const groundedLens = feasibility.find((record) => record.candidateId === 'grounded')!;
  const looseLens = feasibility.find((record) => record.candidateId === 'loose')!;

  assert.equal(groundedLens.selection?.lens.name, 'feasibility');
  assert.equal(groundedLens.selection?.axes.grounding, groundedNoLens.selection?.axes.grounding);
  assert.ok(groundedLens.selection!.lens.multiplier > looseLens.selection!.lens.multiplier);
  assert.ok(groundedLens.total < groundedNoLens.total);
});

test('compatibility is separate from fitness', () => {
  const compatibility = checkPairCompatibility('a', 'b');
  assert.equal(compatibility.parentA, 'a');
  assert.equal(compatibility.parentB, 'b');
  assert.ok(compatibility.score > 0);
});
