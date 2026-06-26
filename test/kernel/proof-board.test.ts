import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { runKernel } from '../../src/kernel/run-kernel.ts';
import { renderProofBoard, writeProofBoard } from '../../src/kernel/proof-board.ts';

async function fixtureRun() {
  return runKernel({
    runId: 'run_board',
    casePath: 'test/fixtures/fsd-seed.json',
    fixturePath: 'test/fixtures/kernel/fsd-ownership-unwind/run-fixture.json',
    knowledgePacketPath: 'test/fixtures/kernel/fsd-ownership-unwind/knowledge-packet.json',
    memoryMode: 'auto',
    allowTestFixtureProviders: true,
  });
}

test('renders proof board with recovery, parents, fitness, and fused child', async () => {
  const html = renderProofBoard(await fixtureRun());
  assert.match(html, /Recover The Ownership Premise/);
  assert.match(html, /cand_liability_clock/);
  assert.match(html, /parent A inheritance/);
  assert.match(html, /child_cand_liability_clock_cand_recovery_market/);
  assert.match(html, /knowledge\.packet_selected/);
});

test('renders evolution budget and generation lineage', async () => {
  const html = renderProofBoard(await fixtureRun());

  assert.match(html, /Evolution/);
  assert.match(html, /budget used/);
  assert.match(html, /budget remaining/);
  assert.match(html, /Generation 0/);
  assert.match(html, /cand_liability_clock/);
  assert.match(html, /child_cand_liability_clock_cand_recovery_market/);
});

test('renders model output health when lifecycle events are present', async () => {
  const run = await fixtureRun();
  run.events.push(
    {
      index: run.events.length,
      type: 'model.output_accepted',
      payload: { callId: 'call_1', purpose: 'problem_recovery', status: 'accepted' },
    },
    {
      index: run.events.length + 1,
      type: 'model.output_repaired',
      payload: { callId: 'call_2', purpose: 'candidate_generation.repair', status: 'repaired' },
    },
    {
      index: run.events.length + 2,
      type: 'model.output_rejected',
      payload: { callId: 'call_3', purpose: 'critic_judgment.repair', status: 'rejected' },
    },
  );

  const html = renderProofBoard(run);

  assert.match(html, /Model Output Health/);
  assert.match(html, /accepted/);
  assert.match(html, /repaired/);
  assert.match(html, /rejected/);
  assert.match(html, /candidate_generation\.repair/);
});

test('writes proof board html to disk', async () => {
  const outDir = await mkdtemp(path.join(tmpdir(), 'doppl-board-'));
  const filePath = await writeProofBoard(await fixtureRun(), outDir);
  assert.equal(path.basename(filePath), 'index.html');
  assert.match(await readFile(filePath, 'utf8'), /Doppl Kernel Proof Board/);
});
