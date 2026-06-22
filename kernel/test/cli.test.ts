import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultKernelArgs } from '../src/cli.ts';

test('default CLI args point at the FSD fixture', () => {
  assert.equal(defaultKernelArgs.casePath, 'case-studies/fsd-ownership-unwind/problem-statement.md');
  assert.equal(defaultKernelArgs.memoryMode, 'auto');
});
