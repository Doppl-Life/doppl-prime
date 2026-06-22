import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadCaseStudy } from '../src/case-loader.ts';
import { loadKernelFixture } from '../src/fixtures.ts';

test('loads a markdown case study with a stable id and title', async () => {
  const caseStudy = await loadCaseStudy('case-studies/fsd-ownership-unwind/problem-statement.md');
  assert.equal(caseStudy.id, 'fsd-ownership-unwind');
  assert.match(caseStudy.title, /FSD|ownership|unwind/i);
  assert.match(caseStudy.statedProblem, /./);
});

test('loads deterministic run fixture data', async () => {
  const fixture = await loadKernelFixture('kernel/fixtures/fsd-ownership-unwind/run-fixture.json');
  assert.equal(fixture.caseId, 'fsd-ownership-unwind');
  assert.equal(fixture.candidates.length, 3);
  assert.equal(fixture.critics.length, 9);
});

test('rejects fixture candidates with invalid contract fields', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'doppl-fixture-'));
  const fixturePath = path.join(dir, 'bad-fixture.json');
  await writeFile(
    fixturePath,
    JSON.stringify({
      caseId: 'case_a',
      problemRecovery: {
        title: 'Recover A',
        recoveredProblem: 'problem',
        hiddenConstraint: 'constraint',
        falsifier: 'falsifier',
        citedKnowledge: [],
      },
      candidates: [
        {
          id: 'cand_a',
          agenomeId: 'ag_a',
          title: 'Candidate A',
          summary: 'summary',
          mechanism: 'mechanism',
          claimedDelta: 'delta',
          citedKnowledge: [],
        },
        {
          id: 'cand_b',
          agenomeId: 'ag_b',
          title: 'Candidate B',
          summary: 'summary',
          mechanism: 'mechanism',
          claimedDelta: 12,
          citedKnowledge: [],
        },
      ],
      critics: [
        {
          candidateId: 'cand_a',
          criticId: 'novelty',
          score: 50,
          pressure: 'pressure',
          revisionMandate: 'revise',
        },
      ],
    }),
    'utf8',
  );

  await assert.rejects(() => loadKernelFixture(fixturePath), /CandidateSolution.claimedDelta/);
});
