import test from 'node:test';
import assert from 'node:assert/strict';
import { runKernel } from '../../src/kernel/run-kernel.ts';
import { compileProposalNodes } from '../../src/kernel/node-compiler.ts';

async function fixtureRun() {
  return runKernel({
    runId: 'proposal_node_compile',
    casePath: 'fixtures/fsd-seed.json',
    fixturePath: 'fixtures/kernel/fsd-ownership-unwind/run-fixture.json',
    knowledgePacketPath: 'fixtures/kernel/fsd-ownership-unwind/knowledge-packet.json',
    memoryMode: 'auto',
  });
}

test('compiles a kernel run into proposal stage nodes', async () => {
  const run = await fixtureRun();
  const ids = ['case-node', 'recovery-node', 'doppl-node'];
  const nodes = compileProposalNodes(run, { idFactory: () => ids.shift()!, kernel: 'prime' });

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
