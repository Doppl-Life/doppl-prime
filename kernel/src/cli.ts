import { runKernel } from './run-kernel.ts';
import { exportRunToVault } from './vault-export.ts';
import { writeProofBoard } from './proof-board.ts';

export const defaultKernelArgs = {
  runId: 'run_fsd_ownership_fixture',
  casePath: 'case-studies/fsd-ownership-unwind/problem-statement.md',
  fixturePath: 'kernel/fixtures/fsd-ownership-unwind/run-fixture.json',
  knowledgePacketPath: 'kernel/fixtures/fsd-ownership-unwind/knowledge-packet.json',
  memoryMode: 'auto' as const,
  generations: 1,
  evolutionBudget: { maxUnits: 1 },
  outDir: 'kernel/out/vault',
  proofBoardDir: 'kernel/out/proof-board',
  publishDir: 'published/kernel',
};

type KernelCliArgs = typeof defaultKernelArgs;

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
    } else if (flag === '--proof-board-dir') {
      args.proofBoardDir = readFlagValue(argv, index, flag);
      index += 1;
    } else if (flag === '--publish-dir') {
      args.publishDir = readFlagValue(argv, index, flag);
      index += 1;
    } else {
      throw new Error(`unknown CLI flag: ${flag}`);
    }
  }
  return args;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cliArgs = parseKernelCliArgs(process.argv.slice(2));
  const run = await runKernel(cliArgs);
  const manifest = await exportRunToVault(run, cliArgs.outDir);
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
        files: manifest.files,
      },
      null,
      2,
    ),
  );
}
