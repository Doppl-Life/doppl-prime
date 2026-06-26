import test from 'node:test';
import assert from 'node:assert/strict';
import { runChain } from '../../../src/kernel/engine/run-kernel.ts';
import { compileChainNodes } from '../../../src/kernel/compile/node-compiler.ts';

async function fixtureChain() {
  return runChain({
    runId: 'run_node_compiler',
    casePath: 'test/fixtures/fsd-seed.json',
    vault: '../agarden',
    fixturePath: 'test/fixtures/kernel/fsd-ownership-unwind/run-fixture.json',
    knowledgePacketPath: 'test/fixtures/kernel/fsd-ownership-unwind/knowledge-packet.json',
    memoryMode: 'auto',
    allowTestFixtureProviders: true,
  });
}

test('compiles a chain into case_study, problem_recovery, and doppl nodes', async () => {
  const { problemRecovery, doppl } = await fixtureChain();
  const nodes = compileChainNodes(problemRecovery, doppl, { kernel: 'prime' });

  assert.deepEqual(nodes.map((node) => node.stage), ['case_study', 'problem_recovery', 'doppl']);
  assert.deepEqual(nodes.map((node) => node.path), [
    'proposal-nodes/case-study.md',
    'proposal-nodes/problem-recovery.md',
    'proposal-nodes/doppl.md',
  ]);
  assert.match(nodes[0]!.markdown, /stage: "case_study"/);
  assert.match(nodes[1]!.markdown, /## Trace/);
  assert.match(nodes[1]!.markdown, /## Discovery/);
  assert.match(nodes[1]!.markdown, /## Growth — Problem recovery/);
  assert.match(nodes[1]!.markdown, /### Skin in the Game/);
  assert.match(nodes[1]!.markdown, /### Evaluation/);
  assert.match(nodes[1]!.markdown, /scores: \{ judge:/);
  assert.match(nodes[2]!.markdown, /## Growth — Doppl/);
  assert.match(nodes[2]!.markdown, /### Claim/);
  assert.match(nodes[2]!.markdown, /### Implications/);
  assert.match(nodes[2]!.markdown, /### Opportunities/);
  assert.match(nodes[2]!.markdown, /## Path\n\nnull/);
});
