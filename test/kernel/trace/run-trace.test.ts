import test from 'node:test';
import assert from 'node:assert/strict';
import { runKernel } from '../../../src/kernel/engine/run-kernel.ts';
import { buildRunTraces } from '../../../src/kernel/trace/run-trace.ts';
import { compileNode } from '../../../src/kernel/compile/node-compiler.ts';

async function fixtureRun() {
  return runKernel({ stage: 'doppl',
    runId: 'run_trace',
    casePath: 'test/fixtures/fsd-seed.json',
    vault: '../agarden',
    fixturePath: 'test/fixtures/kernel/fsd-ownership-unwind/run-fixture.json',
    knowledgePacketPath: 'test/fixtures/kernel/fsd-ownership-unwind/knowledge-packet.json',
    memoryMode: 'auto',
    allowTestFixtureProviders: true,
  });
}

test('projects a KernelRun into the canonical RunTrace specimen', async () => {
  const run = await fixtureRun();
  const traces = buildRunTraces(run);

  assert.equal(traces.length, 1);
  const trace = traces[0]!;

  assert.equal(trace.identity.run_id, run.id);
  assert.equal(trace.identity.stage, 'doppl');
  assert.equal(trace.identity.kernel, 'prime');

  assert.deepEqual(trace.inputs.parent_nodes, [run.caseStudy.id]);
  assert.ok(trace.generations.length >= 1);

  for (const generation of trace.generations) {
    assert.equal(generation.selection.schedule.keep, 3);
    assert.ok(['diverge', 'converge'].includes(generation.selection.tide));
    assert.ok(generation.selection.retained_candidate_ids.length >= 1);
    // every retained candidate gets exactly one regret verdict
    assert.equal(
      generation.selection.regret_siblings.length,
      generation.selection.retained_candidate_ids.length,
    );
  }
});

test('judge and compile fields point at the compiled doppl', async () => {
  const run = await fixtureRun();
  const trace = buildRunTraces(run)[0]!;
  const doppl = compileNode(run);

  assert.equal(trace.judge.candidate_id, run.fusion!.child.id);
  assert.equal(trace.judge.result.axes.length, 5);
  assert.equal(trace.lens.threshold, 0.55);
  assert.equal(trace.compile.output.node_id, doppl!.id);
});
