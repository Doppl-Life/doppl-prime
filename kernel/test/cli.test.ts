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

test('CLI args reject invalid numeric values', () => {
  assert.throws(() => parseKernelCliArgs(['--generations', '0']), /--generations must be an integer >= 1/);
  assert.throws(() => parseKernelCliArgs(['--budget', '-1']), /--budget must be an integer >= 0/);
});
