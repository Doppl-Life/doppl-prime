import path from 'node:path';
import { defaultKernelArgs } from '../cli.ts';
import {
  createFallbackGenerationProviders,
  createModelGenerationProviders,
  type GenerationProviders,
  type ModelGenerationProviders,
} from '../engine/generation-providers.ts';
import {
  createOpenRouterModelClient,
  createPresetModelClient,
  createReplayModelClient,
  readModelCallRecords,
  type ModelCallRecord,
} from '../model/model-gateway.ts';
import { runKernel } from '../engine/run-kernel.ts';
import { exportRunToVault } from '../sink/vault-export.ts';
import { writeProofBoard } from '../projection/proof-board.ts';
import { appendRunEventSync, createMemoryEventRecorder, type EventRecorderListener } from '../trace/event-store.ts';
import {
  approvedDashboardCase,
  casePathFromRequest,
  envFlagEnabled,
  envValue,
  KernelHttpError,
  liveDemoAuthorized,
  parseBudget,
  parseFitnessLens,
  parseFitnessSchedule,
  parsePositiveInteger,
  runModeFor,
  type KernelHttpOptions,
  type KernelHttpRequest,
  type KernelRunRequest,
} from './server-http.ts';
import {
  readDashboardEvents,
  readRunArtifact,
  readRunIndex,
  replayModelCallsPathForRun,
} from './server-store.ts';

const HOSTED_MODEL = 'openai/gpt-4.1-mini';
const FAST_LOCAL_MODEL = 'gemma4:e4b'; // a fast first attempt for the keyless local path.
const RELIABLE_LOCAL_MODEL = 'qwen3.6:35b-a3b'; // the floor: capable enough to validate, MoE-fast.

// A representative model label for a live run (the cascade pins each layer's own model).
export function defaultLiveModel(options: KernelHttpOptions): string {
  return envValue(options, 'DOPPL_LIVE_MODEL') || FAST_LOCAL_MODEL;
}

// The cascading live providers. Each layer is a full set of model-backed providers; a generation or
// judgment falls through to the next layer when one fails — including when a weak model's output
// won't validate even after repair. So a fast model leads and a reliable local model is the floor,
// per call. Order:
//   1. hosted OpenRouter, when a key is present (`/kernel/runs` is authenticated; the public
//      dashboard hides the key unless the operator consents to spend — see the handler);
//   2. the local lead — a pinned model (`DOPPL_LIVE_MODEL`) or a fast small default;
//   3. the floor — a capable local model that reliably validates, keyless and free.
function liveProviderCascade(parsed: KernelRunRequest, options: KernelHttpOptions): GenerationProviders {
  const fetch = options.fetch;
  const records: ModelCallRecord[] = [];
  const layers: ModelGenerationProviders[] = [];
  const hostedKey = envValue(options, 'OPENROUTER_API_KEY').trim();
  if (hostedKey) {
    layers.push(createModelGenerationProviders({
      client: createOpenRouterModelClient({ apiKey: hostedKey, fetch }),
      model: parsed.model || HOSTED_MODEL,
      records,
    }));
  }
  const localModels = [envValue(options, 'DOPPL_LIVE_MODEL') || FAST_LOCAL_MODEL];
  if (!localModels.includes(RELIABLE_LOCAL_MODEL)) localModels.push(RELIABLE_LOCAL_MODEL);
  for (const model of localModels) {
    layers.push(createModelGenerationProviders({
      client: createPresetModelClient('ollama', { fetch }),
      model,
      records,
    }));
  }
  return createFallbackGenerationProviders(layers, records);
}

export async function generationProvidersFromRequest(
  parsed: KernelRunRequest,
  options: KernelHttpOptions,
): Promise<GenerationProviders | undefined> {
  if (parsed.liveModel && parsed.replayModelCallsPath) {
    throw new Error('liveModel cannot be combined with replay model calls');
  }
  if (parsed.liveModel) {
    return liveProviderCascade(parsed, options);
  }
  if (!parsed.replayModelCallsPath) return undefined;
  const records = await readModelCallRecords(parsed.replayModelCallsPath);
  const model = parsed.model || records[0]?.model;
  if (!model) throw new Error('model is required when replayModelCallsPath is set');
  return createModelGenerationProviders({
    client: createReplayModelClient(records, {
      sourceRunId: parsed.replayRunId,
      targetRunId: parsed.runId,
    }),
    model,
  });
}

export async function runFromRequestBody(
  body: string | undefined,
  options: KernelHttpOptions,
  runtime: { onEvent?: EventRecorderListener } = {},
): Promise<Record<string, unknown>> {
  const parsed = JSON.parse(body || '{}') as KernelRunRequest;
  const generations = parsePositiveInteger(parsed.generations, defaultKernelArgs.generations);
  const budget = parseBudget(parsed.budget, defaultKernelArgs.evolutionBudget.maxUnits);
  const casePath = casePathFromRequest(parsed.casePath);
  const fitnessLens = parseFitnessLens(parsed.fitnessLens);
  const fitnessSchedule = parseFitnessSchedule(parsed.fitnessSchedule);
  if (parsed.replayModelCallsPath && parsed.replayRunId) {
    throw new Error('replayModelCallsPath cannot be combined with replayRunId');
  }
  const replayModelCallsPath = parsed.replayRunId
    ? await replayModelCallsPathForRun(parsed.replayRunId, parsed.outDir || defaultKernelArgs.outDir)
    : parsed.replayModelCallsPath;
  const generationProviders = await generationProvidersFromRequest(
    { ...parsed, replayModelCallsPath },
    options,
  );
  const run = await runKernel({
    ...defaultKernelArgs,
    runId: parsed.runId || defaultKernelArgs.runId,
    stage: 'doppl',
    casePath,
    vault: parsed.vault || defaultKernelArgs.vault,
    generations,
    evolutionBudget: { maxUnits: budget },
    fitnessLens,
    fitnessSchedule,
    generationProviders,
    onEvent: runtime.onEvent,
  });
  const manifest = await exportRunToVault(run, parsed.outDir || defaultKernelArgs.outDir);
  const proofBoard = await writeProofBoard(run, parsed.proofBoardDir || defaultKernelArgs.proofBoardDir);
  return {
    runId: run.id,
    caseId: run.caseStudy.id,
    candidates: run.candidates.length,
    generations: run.evolution.length,
    budget: run.budget,
    child: run.fusion?.child.id || null,
    proofBoard,
    files: manifest.files,
  };
}

export function appendFailureEvent(eventLogPath: string, runId: string, error: unknown): void {
  const recorder = createMemoryEventRecorder([], runId);
  const event = recorder.push(
    'run.failed',
    {
      runId,
      error: error instanceof Error ? error.message : String(error),
    },
    { actor: 'runtime' },
  );
  appendRunEventSync(eventLogPath, event);
}

export function startAsyncRun(
  body: string,
  options: KernelHttpOptions,
  eventLogPath: string,
): void {
  void runFromRequestBody(body, options, {
    onEvent(event) {
      appendRunEventSync(eventLogPath, event);
    },
  }).catch((error: unknown) => {
    const parsedBody = JSON.parse(body) as { runId?: unknown };
    const failedRunId =
      typeof parsedBody.runId === 'string' ? parsedBody.runId : defaultKernelArgs.runId;
    appendFailureEvent(eventLogPath, failedRunId, error);
  });
}

export async function runDashboardCaseFromRequestBody(
  request: KernelHttpRequest,
  body: string | undefined,
  options: KernelHttpOptions,
): Promise<Record<string, unknown>> {
  const parsed = JSON.parse(body || '{}') as KernelRunRequest;
  const casePath = casePathFromRequest(parsed.casePath);
  const dashboardCase = approvedDashboardCase(casePath);
  const outDir = parsed.outDir || defaultKernelArgs.outDir;
  const liveModel = Boolean(parsed.liveModel);
  const replayRunId = typeof parsed.replayRunId === 'string' && parsed.replayRunId.trim()
    ? parsed.replayRunId.trim()
    : undefined;
  if (!liveModel && !replayRunId) {
    throw new KernelHttpError(
      400,
      'dashboard runs require liveModel or replayRunId',
    );
  }
  // Spending on the public dashboard needs explicit consent (a key AND the enable flag). Without
  // consent we do not 403 — we hide the hosted key so the live run falls through the cascade to the
  // free local floor. The run still happens; it just never spends without consent.
  const hostedConsent =
    liveModel &&
    Boolean(envValue(options, 'OPENROUTER_API_KEY').trim()) &&
    envFlagEnabled(options, 'DOPPL_ENABLE_LIVE_LLM');
  // A required demo token gates only the consented hosted (paid) path. A free local run is never
  // gated — that is the always-works default; gates protect spend, not function.
  if (hostedConsent && !liveDemoAuthorized(request, options)) {
    throw new KernelHttpError(403, 'live demo token is required');
  }
  const runOptions: KernelHttpOptions =
    liveModel && !hostedConsent
      ? { ...options, env: { ...options.env, OPENROUTER_API_KEY: '' } }
      : options;
  // The consented hosted (paid) path is capped to one generation; local and replay honor the count.
  const cappedLive = hostedConsent;
  const requestedGenerations = parsePositiveInteger(parsed.generations, cappedLive ? 1 : 4);
  const generations = cappedLive ? Math.min(requestedGenerations, 1) : Math.min(requestedGenerations, 4);
  const runId = parsed.runId || `${dashboardCase.id}_${Date.now()}`;
  const runRequestBody = JSON.stringify({
      runId,
      casePath,
      generations,
      budget: generations,
      liveModel,
      replayRunId,
      model: liveModel ? parsed.model || defaultLiveModel(options) : undefined,
      fitnessLens: parseFitnessLens(parsed.fitnessLens),
      fitnessSchedule: parseFitnessSchedule(parsed.fitnessSchedule),
      vault: parsed.vault || defaultKernelArgs.vault,
      outDir,
      proofBoardDir: parsed.proofBoardDir || defaultKernelArgs.proofBoardDir,
    });
  if (parsed.async) {
    const eventLogPath = path.join(outDir, dashboardCase.id, runId, 'events.jsonl');
    startAsyncRun(runRequestBody, runOptions, eventLogPath);
    return {
      runId,
      caseId: dashboardCase.id,
      caseTitle: dashboardCase.title,
      runMode: runModeFor(replayRunId, liveModel),
      status: 'running',
      async: true,
      generations: 0,
      candidateCount: 0,
      modelCalls: null,
      replaySourceRunId: replayRunId ?? null,
      dashboardEvents: await readDashboardEvents(runId, outDir),
    };
  }
  const summary = await runFromRequestBody(runRequestBody, runOptions);
  const completedRunId = String(summary.runId);
  const runIndex = await readRunIndex(completedRunId, outDir);
  const problemRecovery = runIndex.problemRecovery as { path?: string } | undefined;
  const artifact = problemRecovery?.path
    ? await readRunArtifact(completedRunId, outDir, problemRecovery.path)
    : undefined;
  return {
    ...runIndex,
    runMode: runModeFor(replayRunId, liveModel),
    generations: Array.isArray(runIndex.evolution) ? runIndex.evolution.length : 0,
    candidateCount: Array.isArray(runIndex.candidates) ? runIndex.candidates.length : 0,
    modelCalls: runIndex.trace &&
      typeof runIndex.trace === 'object' &&
      'modelCallsPath' in runIndex.trace &&
      typeof runIndex.trace.modelCallsPath === 'string'
      ? { path: runIndex.trace.modelCallsPath }
      : null,
    replaySourceRunId: replayRunId ?? null,
    dashboardArtifact: artifact?.content,
    dashboardEvents: await readDashboardEvents(runId, outDir),
  };
}
