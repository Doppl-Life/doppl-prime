import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { handleKernelHttpRequest } from '../src/server.ts';

test('kernel HTTP server reports health', async () => {
  const response = await handleKernelHttpRequest({ method: 'GET', url: '/health' });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { ok: true, service: 'doppl-kernel' });
});

test('kernel HTTP server runs a fixture kernel request', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'doppl-http-kernel-'));
  const response = await handleKernelHttpRequest({
    method: 'POST',
    url: '/kernel/runs',
    body: JSON.stringify({
      runId: 'run_http_fixture',
      generations: 1,
      budget: 1,
      outDir: path.join(root, 'vault'),
      proofBoardDir: path.join(root, 'proof-board'),
    }),
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.runId, 'run_http_fixture');
  assert.equal(response.body.caseId, 'fsd-ownership-unwind');
  assert.equal(response.body.generations, 1);
  assert.equal(response.body.budget.usedUnits, 1);
  assert.match(response.body.proofBoard, /proof-board\/index\.html$/);
  assert.ok(response.body.files.some((file: string) => file.endsWith('run-index.json')));
});
