import test from 'node:test';
import assert from 'node:assert/strict';
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
