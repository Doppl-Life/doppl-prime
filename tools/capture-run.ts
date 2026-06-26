// Regenerate the captured test run: a real, live grok chain over the committed test vault.
// The deterministic test suite (test/kernel/**) reads these recordings — the serialized KernelRun
// aggregates and the real model-call records — instead of any fabricated fixture. Run after a
// kernel change that alters run shape, prompts, or the trace:
//
//   pnpm capture
//
// It writes nothing into the vault and makes no fixtures; it records what a live run produced.
import { writeFile } from 'node:fs/promises';
import { runChain } from '../src/kernel/engine/run-kernel.ts';
import { createCliModelClient } from '../src/kernel/model/cli-model-client.ts';
import { createModelGenerationProviders } from '../src/kernel/engine/generation-providers.ts';
import { writeModelCallRecords } from '../src/kernel/model/model-gateway.ts';
import type { KernelRun } from '../src/kernel/boundary.ts';

const CAPTURED_DIR = 'test/captured/fsd';
const TEST_VAULT = `${CAPTURED_DIR}/vault`;
const TEST_CASE_PATH = `${TEST_VAULT}/flow/fsd-ownership-unwind-0caef8e3/fsd-ownership-unwind-0caef8e3.md`;

async function writeRun(run: KernelRun, runFile: string, callsFile: string): Promise<void> {
  await writeFile(`${CAPTURED_DIR}/${runFile}`, JSON.stringify(run, null, 2), 'utf8');
  await writeModelCallRecords(`${CAPTURED_DIR}/${callsFile}`, run.modelCallRecords);
}

const client = createCliModelClient({ cmd: 'grok', headless: ['-p'], provider: 'grok' });
const generationProviders = createModelGenerationProviders({ client, model: 'grok' });

const { problemRecovery, doppl } = await runChain({
  runId: 'capture_fsd',
  casePath: TEST_CASE_PATH,
  vault: TEST_VAULT,
  memoryMode: 'auto',
  generations: 1,
  evolutionBudget: { maxUnits: 1 },
  generationProviders,
});

await writeRun(doppl, 'kernel-run.json', 'model-calls.jsonl');
await writeRun(problemRecovery, 'problem-recovery-run.json', 'problem-recovery-model-calls.jsonl');

console.log(
  JSON.stringify({
    captured: CAPTURED_DIR,
    doppl: { candidates: doppl.candidates.length, child: doppl.fusion?.child.id, modelCalls: doppl.modelCallRecords.length },
    problemRecovery: { candidates: problemRecovery.candidates.length, modelCalls: problemRecovery.modelCallRecords.length },
  }, null, 2),
);
