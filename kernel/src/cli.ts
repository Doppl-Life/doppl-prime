import { runKernel } from './run-kernel.ts';
import { exportRunToVault } from './vault-export.ts';
import { compileProposalNodes } from './node-compiler.ts';
import { writeFlowNodes } from './vault-sink.ts';
import { writeProofBoard } from './proof-board.ts';
import { createModelGenerationProviders } from './generation-providers.ts';
import {
  createOpenRouterModelClient,
  createReplayModelClient,
  readModelCallRecords,
} from './model-gateway.ts';

export type KernelCliArgs = {
  runId: string;
  casePath: string;
  fixturePath: string;
  knowledgePacketPath: string;
  memoryMode: 'auto';
  generations: number;
  evolutionBudget: { maxUnits: number };
  outDir: string;
  vault: string;
  proofBoardDir: string;
  publishDir: string;
  replayModelCallsPath?: string;
  model?: string;
  liveModel?: boolean;
};

export const defaultKernelArgs: KernelCliArgs = {
  runId: 'run_fsd_ownership_fixture',
  casePath: 'case-studies/fsd-ownership-unwind/problem-statement.md',
  fixturePath: 'kernel/fixtures/fsd-ownership-unwind/run-fixture.json',
  knowledgePacketPath: 'kernel/fixtures/fsd-ownership-unwind/knowledge-packet.json',
  memoryMode: 'auto' as const,
  generations: 1,
  evolutionBudget: { maxUnits: 1 },
  outDir: 'kernel/out/vault',
  vault: '../agarden',
  proofBoardDir: 'kernel/out/proof-board',
  publishDir: 'published/kernel',
};

function readFlagValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
}

function readIntegerFlag(argv: string[], index: number, flag: string, min: number): number {
  const value = Number(readFlagValue(argv, index, flag));
  if (!Number.isInteger(value) || value < min) {
    throw new Error(`${flag} must be an integer >= ${min}`);
  }
  return value;
}

export function parseKernelCliArgs(argv: string[]): KernelCliArgs {
  const args: KernelCliArgs = {
    ...defaultKernelArgs,
    evolutionBudget: { ...defaultKernelArgs.evolutionBudget },
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--run-id') {
      args.runId = readFlagValue(argv, index, flag);
      index += 1;
    } else if (flag === '--case') {
      args.casePath = readFlagValue(argv, index, flag);
      index += 1;
    } else if (flag === '--fixture') {
      args.fixturePath = readFlagValue(argv, index, flag);
      index += 1;
    } else if (flag === '--knowledge-packet') {
      args.knowledgePacketPath = readFlagValue(argv, index, flag);
      index += 1;
    } else if (flag === '--generations') {
      args.generations = readIntegerFlag(argv, index, flag, 1);
      index += 1;
    } else if (flag === '--budget') {
      args.evolutionBudget = { maxUnits: readIntegerFlag(argv, index, flag, 0) };
      index += 1;
    } else if (flag === '--out-dir') {
      args.outDir = readFlagValue(argv, index, flag);
      index += 1;
    } else if (flag === '--vault') {
      args.vault = readFlagValue(argv, index, flag);
      index += 1;
    } else if (flag === '--proof-board-dir') {
      args.proofBoardDir = readFlagValue(argv, index, flag);
      index += 1;
    } else if (flag === '--publish-dir') {
      args.publishDir = readFlagValue(argv, index, flag);
      index += 1;
    } else if (flag === '--replay-model-calls') {
      args.replayModelCallsPath = readFlagValue(argv, index, flag);
      index += 1;
    } else if (flag === '--model') {
      args.model = readFlagValue(argv, index, flag);
      index += 1;
    } else if (flag === '--live-model') {
      args.liveModel = true;
    } else {
      throw new Error(`unknown CLI flag: ${flag}`);
    }
  }
  if (args.replayModelCallsPath && !args.model) {
    throw new Error('--model is required when --replay-model-calls is set');
  }
  if (args.liveModel && !args.model) {
    throw new Error('--model is required when --live-model is set');
  }
  if (args.liveModel && args.replayModelCallsPath) {
    throw new Error('--live-model cannot be combined with --replay-model-calls');
  }
  return args;
}

async function generationProvidersFromCliArgs(args: KernelCliArgs) {
  if (!args.replayModelCallsPath) return undefined;
  const records = await readModelCallRecords(args.replayModelCallsPath);
  return createModelGenerationProviders({
    client: createReplayModelClient(records),
    model: args.model!,
  });
}

function liveGenerationProvidersFromCliArgs(args: KernelCliArgs) {
  if (!args.liveModel) return undefined;
  return createModelGenerationProviders({
    client: createOpenRouterModelClient({
      apiKey: process.env.OPENROUTER_API_KEY || '',
    }),
    model: args.model!,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cliArgs = parseKernelCliArgs(process.argv.slice(2));
  const generationProviders =
    liveGenerationProvidersFromCliArgs(cliArgs) || (await generationProvidersFromCliArgs(cliArgs));
  const run = await runKernel({ ...cliArgs, generationProviders });
  const manifest = await exportRunToVault(run, cliArgs.outDir);
  const vaultFiles = writeFlowNodes(cliArgs.vault, compileProposalNodes(run));
  const proofBoard = await writeProofBoard(run, cliArgs.proofBoardDir);
  console.log(
    JSON.stringify(
      {
        runId: run.id,
        caseId: run.caseStudy.id,
        problemRecovery: run.problemRecovery.id,
        candidates: run.candidates.length,
        generations: run.evolution.length,
        budget: run.budget,
        child: run.fusion?.child.id || null,
        proofBoard,
        vault: cliArgs.vault,
        vaultFiles,
        files: manifest.files,
      },
      null,
      2,
    ),
  );
}
