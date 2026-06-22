import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultKernelArgs, parseKernelCliArgs } from '../src/cli.ts';

test('default CLI args point at the FSD fixture', () => {
  assert.equal(defaultKernelArgs.casePath, 'case-studies/fsd-ownership-unwind/problem-statement.md');
  assert.equal(defaultKernelArgs.memoryMode, 'auto');
  assert.equal(defaultKernelArgs.proofBoardDir, 'kernel/out/proof-board');
  assert.equal(defaultKernelArgs.publishDir, 'published/kernel');
});

test('CLI args can configure generations and evolution budget', () => {
  const args = parseKernelCliArgs([
    '--run-id',
    'run_cli_generation',
    '--generations',
    '3',
    '--budget',
    '2',
    '--out-dir',
    'tmp/vault',
    '--proof-board-dir',
    'tmp/proof',
  ]);

  assert.equal(args.runId, 'run_cli_generation');
  assert.equal(args.generations, 3);
  assert.deepEqual(args.evolutionBudget, { maxUnits: 2 });
  assert.equal(args.outDir, 'tmp/vault');
  assert.equal(args.proofBoardDir, 'tmp/proof');
  assert.equal(args.publishDir, defaultKernelArgs.publishDir);
});

test('CLI args can configure replayed model calls', () => {
  const args = parseKernelCliArgs([
    '--replay-model-calls',
    'kernel/fixtures/model-calls.jsonl',
    '--model',
    'fixture-model',
  ]);

  assert.equal(args.replayModelCallsPath, 'kernel/fixtures/model-calls.jsonl');
  assert.equal(args.model, 'fixture-model');
});

test('CLI args can configure live server-side model calls', () => {
  const args = parseKernelCliArgs(['--live-model', '--model', 'openrouter/test-model']);

  assert.equal(args.liveModel, true);
  assert.equal(args.model, 'openrouter/test-model');
});

test('CLI args reject invalid numeric values', () => {
  assert.throws(() => parseKernelCliArgs(['--generations', '0']), /--generations must be an integer >= 1/);
  assert.throws(() => parseKernelCliArgs(['--budget', '-1']), /--budget must be an integer >= 0/);
});

test('CLI args require a model when replaying model calls', () => {
  assert.throws(
    () => parseKernelCliArgs(['--replay-model-calls', 'kernel/fixtures/model-calls.jsonl']),
    /--model is required when --replay-model-calls is set/,
  );
});

test('CLI args require a model when live model calls are enabled', () => {
  assert.throws(() => parseKernelCliArgs(['--live-model']), /--model is required when --live-model is set/);
});
