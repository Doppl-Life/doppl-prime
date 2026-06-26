import { readFileSync } from 'node:fs';
import { runChain } from './engine/run-kernel.ts';
import { exportRunToVault } from './sink/vault-export.ts';
import { compileChainNodes } from './compile/node-compiler.ts';
import { writeFlowNodes } from './sink/vault-sink.ts';
import { writeProofBoard } from './projection/proof-board.ts';
import { createModelGenerationProviders } from './engine/generation-providers.ts';
import { createCliModelClient } from './model/cli-model-client.ts';
import {
  createPresetModelClient,
  createFusionModelClient,
  createReplayModelClient,
  readModelCallRecords,
  LOCAL_PROVIDERS,
  OPENAI_COMPATIBLE_PRESETS,
  type ModelClient,
  type OpenAICompatibleProvider,
} from './model/model-gateway.ts';
import { createFirecrawlRetrieval } from './discovery/web-retrieval.ts';

export type KernelCliArgs = {
  runId: string;
  casePath: string;
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
  provider: OpenAICompatibleProvider;
  fusionModels?: string[];
  cli?: string;
  discover?: string;
};

export const defaultKernelArgs: KernelCliArgs = {
  runId: 'run_fsd_ownership',
  casePath: '../agarden/flow/fsd-ownership-unwind-0caef8e3/fsd-ownership-unwind-0caef8e3.md',
  memoryMode: 'auto' as const,
  generations: 1,
  evolutionBudget: { maxUnits: 1 },
  outDir: 'out/kernel/vault',
  vault: '../agarden',
  proofBoardDir: 'out/kernel/proof-board',
  publishDir: 'published/kernel',
  provider: 'openrouter',
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
    if (flag === '--') continue; // the npm/pnpm "end of options" separator; not a flag
    if (flag === '--run-id') {
      args.runId = readFlagValue(argv, index, flag);
      index += 1;
    } else if (flag === '--case') {
      args.casePath = readFlagValue(argv, index, flag);
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
    } else if (flag === '--provider') {
      const value = readFlagValue(argv, index, flag);
      if (!(value in OPENAI_COMPATIBLE_PRESETS)) {
        throw new Error(
          `unknown --provider: ${value} (expected one of ${Object.keys(OPENAI_COMPATIBLE_PRESETS).join(', ')})`,
        );
      }
      args.provider = value as OpenAICompatibleProvider;
      index += 1;
    } else if (flag === '--fusion') {
      args.fusionModels = readFlagValue(argv, index, flag)
        .split(',')
        .map((model) => model.trim())
        .filter(Boolean);
      index += 1;
    } else if (flag === '--cli') {
      args.cli = readFlagValue(argv, index, flag);
      index += 1;
    } else if (flag === '--discover') {
      args.discover = readFlagValue(argv, index, flag);
      index += 1;
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
  if (args.cli && (args.liveModel || args.replayModelCallsPath)) {
    throw new Error('--cli cannot be combined with --live-model or --replay-model-calls');
  }
  return args;
}

async function generationProvidersFromCliArgs(args: KernelCliArgs) {
  if (!args.replayModelCallsPath) return undefined;
  const records = await readModelCallRecords(args.replayModelCallsPath);
  return createModelGenerationProviders({
    client: createReplayModelClient(records),
    model: args.model ?? 'replay',
  });
}

function liveApiKey(provider: OpenAICompatibleProvider): string | undefined {
  if (LOCAL_PROVIDERS.has(provider)) return undefined;
  const byProvider: Record<string, string | undefined> = {
    openrouter: process.env.OPENROUTER_API_KEY,
    groq: process.env.GROQ_API_KEY,
    openai: process.env.OPENAI_API_KEY,
  };
  return byProvider[provider];
}

function cliToolFromConfig(
  name: string,
  configPath = 'doppl.config.json',
): { cmd: string; headless: string[] } {
  const config = JSON.parse(readFileSync(configPath, 'utf8')) as {
    tools?: Record<string, { cmd?: string; headless?: string[] }>;
  };
  const tool = config.tools?.[name];
  if (!tool?.cmd) throw new Error(`no CLI tool '${name}' in ${configPath} tools`);
  return { cmd: tool.cmd, headless: tool.headless ?? [] };
}

function liveGenerationProvidersFromCliArgs(args: KernelCliArgs) {
  let client: ModelClient | undefined;
  if (args.cli) {
    const tool = cliToolFromConfig(args.cli);
    client = createCliModelClient({ ...tool, provider: args.cli });
  } else if (args.liveModel) {
    client = createPresetModelClient(args.provider, { apiKey: liveApiKey(args.provider) });
    if (args.fusionModels?.length) {
      client = createFusionModelClient({ client, models: args.fusionModels, synthesisModel: args.model });
    }
  }
  if (!client) return undefined;
  return createModelGenerationProviders({ client, model: args.model ?? args.cli ?? 'cli' });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cliArgs = parseKernelCliArgs(process.argv.slice(2));
  const generationProviders =
    liveGenerationProvidersFromCliArgs(cliArgs) || (await generationProvidersFromCliArgs(cliArgs));
  const webRetrieval = cliArgs.discover
    ? createFirecrawlRetrieval(cliToolFromConfig(cliArgs.discover).cmd)
    : undefined;
  const { problemRecovery, doppl } = await runChain({ ...cliArgs, generationProviders, webRetrieval });
  await exportRunToVault(problemRecovery, cliArgs.outDir);
  const manifest = await exportRunToVault(doppl, cliArgs.outDir);
  const vaultFiles = writeFlowNodes(cliArgs.vault, compileChainNodes(problemRecovery, doppl));
  const proofBoard = await writeProofBoard(doppl, cliArgs.proofBoardDir);
  console.log(
    JSON.stringify(
      {
        runId: doppl.id,
        caseId: doppl.caseStudy.id,
        problemRecovery: problemRecovery.id,
        candidates: doppl.candidates.length,
        generations: doppl.evolution.length,
        budget: doppl.budget,
        child: doppl.fusion?.child.id || null,
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
