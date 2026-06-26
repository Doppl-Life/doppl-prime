import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { runKernel } from '../../src/kernel/engine/run-kernel.ts';
import { createPresetModelClient } from '../../src/kernel/model/model-gateway.ts';
import { createModelGenerationProviders } from '../../src/kernel/engine/generation-providers.ts';

// The live engine proof: a real multi-generation run through a live model — no fabrication, no
// replay. It exercises the mechanics a single captured generation cannot show: a second generation
// that evolves off the first, and a fused survivor. Run with `pnpm test:live`.
//
// We test the system, not the model: this uses a fast LOCAL model (Ollama) so it never holds up
// development. The point is that the engine works, not the quality of the survivor. Override the
// model with DOPPL_LIVE_MODEL; point elsewhere with DOPPL_LIVE_PROVIDER (any OpenAI-compatible
// preset). Skipped (loudly) when the local model server is unreachable so the gate never silently
// passes on nothing.

const TEST_VAULT = 'test/captured/fsd/vault';
const TEST_CASE_PATH = `${TEST_VAULT}/flow/fsd-ownership-unwind-0caef8e3/fsd-ownership-unwind-0caef8e3.md`;
const LIVE_MODEL = process.env.DOPPL_LIVE_MODEL ?? 'qwen3.6:35b-a3b';

function ollamaUp(): boolean {
  try {
    execSync('curl -sf http://localhost:11434/api/version', { stdio: 'ignore', shell: '/bin/bash' });
    return true;
  } catch {
    return false;
  }
}

test(
  'a live local-model run evolves across generations into a fused survivor',
  { skip: ollamaUp() ? false : 'Ollama not reachable at localhost:11434 (start it or pull a model)', timeout: 600000 },
  async () => {
    const client = createPresetModelClient('ollama', {});
    const generationProviders = createModelGenerationProviders({ client, model: LIVE_MODEL });

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

    // A real second generation: candidates exist at generation >= 1, bred off the first.
    assert.ok(
      run.candidates.some((candidate) => candidate.generation >= 1),
      'second generation produced descendants',
    );

    // The crucible converges on a fused survivor.
    assert.ok(run.fusion, 'fused a surviving child');
    assert.ok(run.fusion?.child.id, 'survivor has an id');
  },
);
