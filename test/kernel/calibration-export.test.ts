import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { runKernel } from '../../src/kernel/run-kernel.ts';
import { exportRunToCalibrationVault } from '../../src/kernel/vault-export.ts';

test('exports a calibrator vault with unrated review fields', async () => {
  const run = await runKernel({
    runId: 'run_calibration_export',
    casePath: 'test/fixtures/fsd-seed.json',
    fixturePath: 'test/fixtures/kernel/fsd-ownership-unwind/run-fixture.json',
    knowledgePacketPath: 'test/fixtures/kernel/fsd-ownership-unwind/knowledge-packet.json',
    memoryMode: 'auto',
  });
  const outDir = await mkdtemp(path.join(tmpdir(), 'doppl-calibration-vault-'));
  const manifest = await exportRunToCalibrationVault(run, outDir);

  assert.equal(manifest.rootDir, path.join(outDir, run.caseStudy.id, run.id));
  assert.ok(manifest.files.some((file) => file.endsWith('calibration-manifest.json')));
  assert.ok(manifest.files.some((file) => file.endsWith('problem-recovery.md')));
  assert.ok(manifest.files.some((file) => file.includes(run.fusion!.child.id)));

  const recovery = await readFile(
    manifest.files.find((file) => file.endsWith('problem-recovery.md'))!,
    'utf8',
  );
  assert.match(recovery, /calibration_status: unrated/);
  assert.match(recovery, /rating_scale: -5_to_5/);

  const calibrationManifest = JSON.parse(
    await readFile(manifest.files.find((file) => file.endsWith('calibration-manifest.json'))!, 'utf8'),
  );
  assert.equal(calibrationManifest.artifact_type, 'calibration_run_manifest');
  assert.equal(calibrationManifest.problemRecovery.path, 'problem-recovery.md');
  assert.equal(calibrationManifest.child.path, `${run.fusion!.child.id}.md`);
  assert.equal(calibrationManifest.ratings.problemRecovery, null);
});
