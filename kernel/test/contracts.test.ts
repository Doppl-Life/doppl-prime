import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateInheritanceWeights, assertKernelRun } from '../src/contracts.ts';

test('inheritance weights preserve a 2:1 parent fitness ratio', () => {
  assert.deepEqual(calculateInheritanceWeights(80, 40), { parentA: 0.667, parentB: 0.333 });
});

test('kernel run assertion rejects missing problem recovery', () => {
  assert.throws(() => assertKernelRun({ id: 'run_bad' }), /problemRecovery/);
});
