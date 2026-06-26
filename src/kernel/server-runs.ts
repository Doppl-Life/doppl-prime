import path from 'node:path';
import { defaultKernelArgs } from './cli.ts';
import { createModelGenerationProviders, type GenerationProviders } from './generation-providers.ts';
import {
  createOpenRouterModelClient,
  createReplayModelClient,
  readModelCallRecords,
} from './model-gateway.ts';
import { runKernel } from './run-kernel.ts';
import { exportRunToVault } from './vault-export.ts';
import { writeProofBoard } from './proof-board.ts';
import { appendRunEventSync, createMemoryEventRecorder, type EventRecorderListener } from './event-store.ts';
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

export async function generationProvidersFromRequest(
  parsed: KernelRunRequest,
  options: KernelHttpOptions,
): Promise<GenerationProviders | undefined> {
  if (parsed.liveModel && parsed.replayModelCallsPath) {
    throw new Error('liveModel cannot be combined with replay model calls');
  }
  if (parsed.liveModel) {
    if (!parsed.model) throw new Error('model is required when liveModel is set');
    return createModelGenerationProviders({
      client: createOpenRouterModelClient({
        apiKey: envValue(options, 'OPENROUTER_API_KEY'),
        fetch: options.fetch,
      }),
      model: parsed.model,
    });
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
    casePath,
    fixturePath: parsed.fixturePath || defaultKernelArgs.fixturePath,
    knowledgePacketPath: parsed.knowledgePacketPath || defaultKernelArgs.knowledgePacketPath,
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
  if (liveModel && !envFlagEnabled(options, 'DOPPL_ENABLE_LIVE_LLM')) {
    throw new KernelHttpError(403, 'live dashboard generation is disabled');
  }
  if (liveModel && !liveDemoAuthorized(request, options)) {
    throw new KernelHttpError(403, 'live demo token is required');
  }
  const requestedGenerations = parsePositiveInteger(parsed.generations, liveModel ? 1 : 4);
  const generations = liveModel ? Math.min(requestedGenerations, 1) : Math.min(requestedGenerations, 4);
  const runId = parsed.runId || `${dashboardCase.id}_${Date.now()}`;
  const runRequestBody = JSON.stringify({
      runId,
      casePath,
      fixturePath: dashboardCase.fixturePath,
      knowledgePacketPath: dashboardCase.knowledgePacketPath,
      generations,
      budget: generations,
      liveModel,
      replayRunId,
      model: liveModel ? parsed.model || 'openai/gpt-4.1-mini' : undefined,
      fitnessLens: parseFitnessLens(parsed.fitnessLens),
      fitnessSchedule: parseFitnessSchedule(parsed.fitnessSchedule),
      outDir,
      proofBoardDir: parsed.proofBoardDir || defaultKernelArgs.proofBoardDir,
    });
  if (parsed.async) {
    const eventLogPath = path.join(outDir, dashboardCase.id, runId, 'events.jsonl');
    startAsyncRun(runRequestBody, options, eventLogPath);
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
  const summary = await runFromRequestBody(runRequestBody, options);
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
