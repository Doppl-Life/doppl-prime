import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { runKernel } from '../src/run-kernel.ts';
import { publishStaticKernelRun, writePublishedIndex } from '../src/publish.ts';

async function fixtureRun() {
  return runKernel({
    runId: 'run_publish',
    casePath: 'case-studies/fsd-ownership-unwind/problem-statement.md',
    fixturePath: 'kernel/fixtures/fsd-ownership-unwind/run-fixture.json',
    knowledgePacketPath: 'kernel/fixtures/fsd-ownership-unwind/knowledge-packet.json',
    memoryMode: 'auto',
  });
}

test('publishes proof board and vault artifacts into a static directory', async () => {
  const outDir = await mkdtemp(path.join(tmpdir(), 'doppl-published-'));
  const manifest = await publishStaticKernelRun(await fixtureRun(), outDir);
  assert.equal(manifest.indexHtml, path.join(outDir, 'index.html'));
  assert.ok(manifest.files.some((file) => file.endsWith('trace.json')));
  assert.ok(manifest.files.some((file) => file.endsWith('events.jsonl')));
  assert.ok(manifest.files.some((file) => file.endsWith('problem-recovery.md')));
  assert.ok(manifest.files.some((file) => file.includes('child_cand_liability_clock')));
  const html = await readFile(manifest.indexHtml, 'utf8');
  assert.match(html, /Doppl Kernel Proof Board/);
  assert.match(html, /published-vault/);
});

test('writes a top-level published index that links to the kernel preview', async () => {
  const outDir = await mkdtemp(path.join(tmpdir(), 'doppl-site-'));
  const indexPath = await writePublishedIndex(outDir, {
    kernelHref: 'kernel/',
    kernelTitle: 'Doppl Kernel Proof Board',
    runId: 'run_publish',
  });
  const html = await readFile(indexPath, 'utf8');
  assert.equal(indexPath, path.join(outDir, 'index.html'));
  assert.match(html, /href="kernel\/"/);
  assert.match(html, /Doppl Kernel Proof Board/);
  assert.match(html, /run_publish/);
});
