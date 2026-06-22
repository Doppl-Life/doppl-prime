import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { runKernel } from '../src/run-kernel.ts';
import { exportRunToVault } from '../src/vault-export.ts';
import { readRunEvents, replayRunProjection } from '../src/event-store.ts';
import { readModelCallRecords } from '../src/model-gateway.ts';

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
  assert.ok(manifest.files.some((file) => file.endsWith('events.jsonl')));
  const recovery = await readFile(
    manifest.files.find((file) => file.endsWith('problem-recovery.md'))!,
    'utf8',
  );
  assert.match(recovery, /artifact_type: problem_recovery/);
  const eventLogPath = manifest.files.find((file) => file.endsWith('events.jsonl'))!;
  const projection = replayRunProjection(await readRunEvents(eventLogPath));
  assert.equal(projection.runId, 'run_export');
  assert.equal(projection.completed, true);
  assert.equal(projection.childId, run.fusion?.child.id);
});

test('exports a calibrator-facing run index', async () => {
  const run = await runKernel({
    runId: 'run_export_index',
    casePath: 'case-studies/fsd-ownership-unwind/problem-statement.md',
    fixturePath: 'kernel/fixtures/fsd-ownership-unwind/run-fixture.json',
    knowledgePacketPath: 'kernel/fixtures/fsd-ownership-unwind/knowledge-packet.json',
    memoryMode: 'auto',
  });
  const outDir = await mkdtemp(path.join(tmpdir(), 'doppl-vault-index-'));
  const manifest = await exportRunToVault(run, outDir);
  const indexPath = manifest.files.find((file) => file.endsWith('run-index.json'))!;
  const index = JSON.parse(await readFile(indexPath, 'utf8'));

  assert.equal(index.artifact_type, 'kernel_run_index');
  assert.equal(index.runId, 'run_export_index');
  assert.equal(index.problemRecovery.path, 'problem-recovery.md');
  assert.equal(index.candidates.length, run.candidates.length);
  assert.equal(index.child.id, run.fusion?.child.id);
  assert.deepEqual(index.child.parentCandidateIds, run.fusion?.parentCandidateIds);
  assert.equal(index.trace.path, 'trace.json');
  assert.equal(index.trace.eventsPath, 'events.jsonl');
  assert.equal(index.modelOutputs.accepted, 0);
  assert.deepEqual(index.evolution.map((generation: { generation: number }) => generation.generation), [0]);
});

test('exports model call evidence when present on the run', async () => {
  const run = await runKernel({
    runId: 'run_export_model_calls',
    casePath: 'case-studies/fsd-ownership-unwind/problem-statement.md',
    fixturePath: 'kernel/fixtures/fsd-ownership-unwind/run-fixture.json',
    knowledgePacketPath: 'kernel/fixtures/fsd-ownership-unwind/knowledge-packet.json',
    memoryMode: 'auto',
  });
  run.modelCallRecords = [
    {
      id: 'call_1',
      runId: run.id,
      purpose: 'problem_recovery',
      provider: 'replay',
      model: 'fixture-model',
      prompt: 'recover',
      outputText: '{"title":"Recovered"}',
      metadata: {},
    },
  ];

  const outDir = await mkdtemp(path.join(tmpdir(), 'doppl-vault-model-'));
  const manifest = await exportRunToVault(run, outDir);
  const modelCallsPath = manifest.files.find((file) => file.endsWith('model-calls.jsonl'))!;

  assert.ok(modelCallsPath);
  assert.equal((await readModelCallRecords(modelCallsPath))[0]?.prompt, 'recover');
});
