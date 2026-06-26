import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { runKernel } from '../../src/kernel/engine/run-kernel.ts';
import { createCliModelClient } from '../../src/kernel/model/cli-model-client.ts';
import { createModelGenerationProviders } from '../../src/kernel/engine/generation-providers.ts';

// The live engine proof: a real multi-generation run through the configured grok CLI bridge —
// no fabrication, no replay. It exercises the mechanics a single captured generation cannot show
// (mutation tagging, lineage accumulation, multi-generation evolution). Run with `pnpm test:live`.
// Skipped (loudly) when the grok CLI is unavailable so the gate never silently passes on nothing.

const TEST_VAULT = 'test/captured/fsd/vault';
const TEST_CASE_PATH = `${TEST_VAULT}/flow/fsd-ownership-unwind-0caef8e3/fsd-ownership-unwind-0caef8e3.md`;

function grokAvailable(): boolean {
  try {
    execSync('command -v grok', { stdio: 'ignore', shell: '/bin/bash' });
    return true;
  } catch {
    return false;
  }
}

test('a live grok run evolves across generations with mutagen lineage', { skip: grokAvailable() ? false : 'grok CLI not available' }, async () => {
  const client = createCliModelClient({ cmd: 'grok', headless: ['-p'], provider: 'grok' });
  const generationProviders = createModelGenerationProviders({ client, model: 'grok' });

  const run = await runKernel({
    stage: 'doppl',
    runId: `live_engine_${Date.now()}`,
    casePath: TEST_CASE_PATH,
    vault: TEST_VAULT,
    memoryMode: 'auto',
    generations: 2,
    evolutionBudget: { maxUnits: 2 },
    generationProviders,
  });

  assert.equal(run.stage, 'doppl');
  assert.equal(run.evolution.length, 2, 'evolved across two generations');
  assert.ok(run.candidates.length >= 2, 'bred a population');

  // Generation >= 1 candidates are mutations: each is tagged with the mutagen that made it,
  // and that mutagen appears in its accumulated lineage.
  const mutated = run.candidates.filter((candidate) => candidate.mutagen !== undefined);
  assert.ok(mutated.length >= 1, 'second generation produced tagged mutations');
  for (const candidate of mutated) {
    assert.ok(
      candidate.mutagenLineage?.includes(candidate.mutagen!),
      `lineage of ${candidate.id} includes its mutagen ${candidate.mutagen}`,
    );
  }

  // The fused survivor carries an accumulated lineage — the witness of the moves that shaped it.
  assert.ok(run.fusion, 'fused a surviving child');
  assert.ok((run.fusion?.child.mutagenLineage?.length ?? 0) > 0, 'survivor accumulated a lineage');
}, { timeout: 600000 });
