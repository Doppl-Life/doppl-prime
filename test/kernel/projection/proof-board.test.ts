import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { renderProofBoard, writeProofBoard } from '../../../src/kernel/projection/proof-board.ts';
import { loadCapturedRun } from '../captured-run.ts';

test('renders proof board with recovery, parents, fitness, and fused child', async () => {
  const run = loadCapturedRun();
  const html = renderProofBoard(run);
  assert.match(html, /Problem Recovery/);
  assert.ok(html.includes(run.candidates[0]!.id), 'shows a real candidate id');
  assert.match(html, /parent A inheritance/);
  assert.ok(html.includes(run.fusion!.child.id), 'shows the real fused child id');
  assert.match(html, /knowledge\.packet_selected/);
});

test('renders evolution budget and generation lineage', async () => {
  const run = loadCapturedRun();
  const html = renderProofBoard(run);

  assert.match(html, /Evolution/);
  assert.match(html, /budget used/);
  assert.match(html, /budget remaining/);
  assert.match(html, /Generation 0/);
  assert.ok(html.includes(run.candidates[0]!.id), 'shows a real candidate id');
  assert.ok(html.includes(run.fusion!.child.id), 'shows the real fused child id');
});

test('renders model output health when lifecycle events are present', async () => {
  const run = loadCapturedRun();
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
  const filePath = await writeProofBoard(loadCapturedRun(), outDir);
  assert.equal(path.basename(filePath), 'index.html');
  assert.match(await readFile(filePath, 'utf8'), /Doppl Kernel Proof Board/);
});
