import test from 'node:test';
import assert from 'node:assert/strict';
import { runKernel } from '../../../src/kernel/engine/run-kernel.ts';
import { loadCapturedRun } from '../captured-run.ts';

// The deterministic engine tests assert on a captured real run (a recording of a live grok
// run — no fabrication). The engine loop's live execution, and the multi-generation mechanics
// the single captured generation can't show, are proven in run-kernel.live.test.ts.

const CAPTURED_CASE_PATH =
  'test/captured/fsd/vault/flow/fsd-ownership-unwind-0caef8e3/fsd-ownership-unwind-0caef8e3.md';
const CAPTURED_VAULT = 'test/captured/fsd/vault';

test('requires explicit generation providers', async () => {
  await assert.rejects(
    () =>
      runKernel({
        stage: 'doppl',
        runId: 'run_requires_provider',
        casePath: CAPTURED_CASE_PATH,
        vault: CAPTURED_VAULT,
        memoryMode: 'auto',
      }),
    /generationProviders are required/,
  );
});

test('the captured run is a complete generate-under-selection loop', () => {
  const run = loadCapturedRun();
  assert.equal(run.stage, 'doppl');
  assert.ok(run.candidates.length >= 2, 'bred a population');
  assert.equal(run.selectedParents.length, 2, 'selected a parent pair');
  assert.ok((run.fusion?.inheritanceWeights.parentA ?? 0) > 0.5, 'fused with a dominant parent');
  assert.ok(run.events.some((event) => event.type === 'knowledge.packet_selected'));
  assert.ok(run.agenomes.length >= 2, 'materialized an agenome pool');
  assert.ok(run.agenomes.some((agenome) => agenome.id === run.candidates[0]?.agenomeId));
  assert.ok(run.events.some((event) => event.type === 'agenome.materialized'));
  assert.ok(run.energyLedger.some((entry) => entry.kind === 'allocation'));
  assert.ok(run.energyLedger.some((entry) => entry.kind === 'spend'));
  assert.ok(run.events.some((event) => event.type === 'agenome.energy_allocated'));
  assert.ok(run.events.some((event) => event.type === 'agenome.energy_spent'));

  // Each agenome's recorded energy spend reconciles with its spend-ledger entries.
  const firstAgenomeId = run.candidates[0]?.agenomeId;
  assert.equal(
    run.agenomes.find((agenome) => agenome.id === firstAgenomeId)?.energy.spent,
    run.energyLedger
      .filter((entry) => entry.agenomeId === firstAgenomeId && entry.kind === 'spend')
      .reduce((sum, entry) => sum + entry.units, 0),
  );
});

test('the captured run drew product knowledge from agarden stock', () => {
  const run = loadCapturedRun();
  assert.ok(run.knowledgePacket.items.length > 0, 'selected stock-backed knowledge');
  for (const item of run.knowledgePacket.items) {
    assert.equal(item.trustTier, 'agarden-stock');
  }
});

test('the captured run carries a clean-agent baseline outside selection', () => {
  const run = loadCapturedRun();
  assert.ok(run.controlBaseline, 'recorded a clean-agent control baseline');
  // The baseline is a separate single-pass control, not one of the evolved candidates.
  assert.ok(
    !run.candidates.some((candidate) => candidate.id === run.controlBaseline!.id),
    'baseline is excluded from the evolved population',
  );
});
