import test from 'node:test';
import assert from 'node:assert/strict';

test('kernel test harness is wired', () => {
  assert.equal('doppl-kernel'.includes('kernel'), true);
});
