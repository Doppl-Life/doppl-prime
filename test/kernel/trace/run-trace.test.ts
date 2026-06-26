import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRunTraces } from '../../../src/kernel/trace/run-trace.ts';
import { compileNode } from '../../../src/kernel/compile/node-compiler.ts';
import { loadCapturedRun } from '../captured-run.ts';

test('projects a KernelRun into the canonical RunTrace specimen', async () => {
  const run = loadCapturedRun();
  const traces = buildRunTraces(run);

  assert.equal(traces.length, 1);
  const trace = traces[0]!;

  assert.equal(trace.identity.run_id, run.id);
  assert.equal(trace.identity.stage, 'doppl');
  assert.equal(trace.identity.kernel, 'prime');

  assert.deepEqual(
    trace.inputs.parent_nodes,
    run.parentNode ? [run.caseStudy.id, run.parentNode.id] : [run.caseStudy.id],
  );
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
  const run = loadCapturedRun();
  const trace = buildRunTraces(run)[0]!;
  const doppl = compileNode(run);

  assert.equal(trace.judge.candidate_id, run.fusion!.child.id);
  assert.equal(trace.judge.result.axes.length, 5);
  assert.equal(trace.lens.threshold, 0.55);
  assert.equal(trace.compile.output.node_id, doppl!.id);
});
