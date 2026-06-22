import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { runKernel } from '../src/run-kernel.ts';
import { exportRunToVault } from '../src/vault-export.ts';

test('exports problem recovery and child solution markdown separately', async () => {
  const run = await runKernel({
    runId: 'run_export',
    casePath: 'case-studies/fsd-ownership-unwind/problem-statement.md',
    fixturePath: 'kernel/fixtures/fsd-ownership-unwind/run-fixture.json',
    knowledgePacketPath: 'kernel/fixtures/fsd-ownership-unwind/knowledge-packet.json',
    memoryMode: 'auto',
  });
  const outDir = await mkdtemp(path.join(tmpdir(), 'doppl-vault-'));
  const manifest = await exportRunToVault(run, outDir);
  assert.ok(manifest.files.some((file) => file.endsWith('problem-recovery.md')));
  assert.ok(manifest.files.some((file) => file.includes('child_')));
  const recovery = await readFile(
    manifest.files.find((file) => file.endsWith('problem-recovery.md'))!,
    'utf8',
  );
  assert.match(recovery, /artifact_type: problem_recovery/);
});
