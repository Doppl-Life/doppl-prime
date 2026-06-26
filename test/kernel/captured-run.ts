import { readFileSync } from 'node:fs';
import { assertKernelRun, type KernelRun } from '../../src/kernel/boundary.ts';
import type { ModelCallRecord } from '../../src/kernel/model/model-gateway.ts';

// A captured run is a recording of a real, live kernel run (no fabrication): its serialized
// KernelRun aggregate plus the real model-call records that produced it. `pnpm capture`
// regenerates these by running the kernel live. Deterministic projection/sink/compile/trace
// tests read the aggregate here; the engine-loop test replays the recorded model calls. The
// live model path itself is proven by the live integration tests (`pnpm test:live`).

const CAPTURED_DIR = 'test/captured/fsd';

export function loadCapturedRun(): KernelRun {
  return assertKernelRun(JSON.parse(readFileSync(`${CAPTURED_DIR}/kernel-run.json`, 'utf8')));
}

export function loadCapturedProblemRecoveryRun(): KernelRun {
  return assertKernelRun(
    JSON.parse(readFileSync(`${CAPTURED_DIR}/problem-recovery-run.json`, 'utf8')),
  );
}

// The full captured chain: the problem_recovery arrow's run and the doppl arrow's run, the
// same shape `runChain()` returns. Chain-projection tests (node-compiler, vault-sink) read this.
export function loadCapturedChain(): { problemRecovery: KernelRun; doppl: KernelRun } {
  return { problemRecovery: loadCapturedProblemRecoveryRun(), doppl: loadCapturedRun() };
}

export function loadCapturedModelCalls(): ModelCallRecord[] {
  return readFileSync(`${CAPTURED_DIR}/model-calls.jsonl`, 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as ModelCallRecord);
}
