import type {
  CheckRunnerRegistry,
  ModelGatewayRequest,
  ModelRouteOverride,
  RunCaps,
  RunConfig,
} from '@doppl/contracts';
import type { AppConfig } from '../runtime/config/configSchema';
import { strategyParams } from '../runtime/loop/mutagenStrategy';
import type { EventStore } from '../event-store';
import type { ModelGateway, ToolExecutorDeps } from '../model-gateway';
import { type GenerationGateway, type RunWorkerDeps } from '../runtime';
import { createToolOrchestratingGateway } from './toolOrchestrator';
import { createKnowledgeRetriever } from './knowledgeRetriever';
import { createVerifySeam } from '../verifier/verify-seam';
import { DEFAULT_JUDGE_RUBRIC } from '../verifier/judge/rubric';
import {
  createReproduceSeam,
  createScoreSeam,
  createSuccessorThreading,
  type CullPolicy,
  type MutationBounds,
} from '../selection';

/**
 * composeRuntime (P5.11, ARCHITECTURE.md §5/§8/§11) — the BOOT COMPOSITION ROOT. It assembles the
 * production `RunWorkerDeps` from INJECTED infra (config, gateway, event store, check registry) + all
 * THREE real subsystem seams (verify=`createVerifySeam`, score=`createScoreSeam`, reproduce=
 * `createReproduceSeam`) + the `nextPopulation` successor-threading hook (`createSuccessorThreading`).
 *
 * Rule #6 single-source: the SAME immutable `DEFAULT_JUDGE_RUBRIC` is wired to BOTH the verify seam's
 * held-out judge (which produces the `JudgeResult` under it) AND the score seam's `judgeAcceptance` (which
 * validates `rubricPolicyVersion`) — so the candidateId-join's `judge_acceptance` is a PRESENT value, never
 * a version-mismatch silent absence. The composition only WIRES; it never bypasses a kernel enforcement
 * (caps rule #1, append-only rule #2, success-only energy rule #8, replay-faithful seams rule #7 all stay
 * the kernel's / seams' job). Pure assembly — returns the deps; the caller (the W3b-2b POST /runs trigger)
 * runs `runWorker`.
 */
export interface ComposeRuntimeInput {
  readonly config: AppConfig;
  readonly modelGateway: ModelGateway;
  readonly eventStore: EventStore;
  readonly checkRegistry: CheckRunnerRegistry;
  /** Enumerate all run ids for the worker's single-active-run scan (DI — runtime can't import projections). */
  readonly listRunIds: () => Promise<readonly string[]>;
  readonly newId: () => string;
  readonly runId: string;
  /**
   * W3b-2c — the operator's RECORDED per-run config (from `run.configured`). When present, its
   * `caps`/`rngSeed`/`enabledSubtypes` are merged over the boot `AppConfig` (CLAMPED — caps can only lower
   * within the boot ceiling, rule #1); the immutables (scoringPolicy/rubric/seedSet) stay boot. Absent →
   * the boot config drives the run.
   */
  readonly perRunConfig?: RunConfig;
  /**
   * FB.2 — the per-run gateway factory: when the recorded `perRunConfig` carries a (route-validated)
   * `modelRouteOverride`, the run's gateway is built from this factory (a registry OVERLAY re-clamped to
   * the allowlist → FB.1's provider-dispatch routes the overridden provider). Set ONLY on the live boot
   * branch; absent on the recorded/replay path → the boot singleton gateway is used (no provider, rule #7).
   */
  readonly gatewayForOverride?: (override: ModelRouteOverride) => ModelGateway;
  /** PD.3 — the operator-stop poll fn (the boot `operatorStopRegistry.checker(runId)`). Set on the worker
   *  deps → the loop's `detectKill` polls it at each generation boundary → drain-then-terminalize run.stopped
   *  (§5). Absent → no operator-stop seam (today's behavior). */
  readonly operatorStop?: () => boolean;
  /**
   * TU.5 — the live tool-execution IO seams (httpGet / resolveHostIsPublic / webSearch). PRESENT only on the
   * live boot branch → the population_generator gateway becomes the tool-orchestrating gateway, so agents do
   * their own research. ABSENT on the recorded/replay path → the pass-through gateway (replay reads the
   * persisted tool results, never re-executes — rule #7).
   */
  readonly toolExecutorSeams?: ToolExecutorDeps;
}

/**
 * mergePerRunConfig — overlay the operator's recorded per-run config on the boot `AppConfig` so the worker
 * EXECUTES what was recorded (recorded == executed, the log-is-truth thesis). The OPERATOR-tunable fields
 * (`caps`/`rngSeed`/`enabledSubtypes`) come from the per-run config; the immutables (scoringPolicy, the
 * judge rubric, seedSet, infra) stay boot (rule #6 for the rubric; scope of the override). Rule #1: each
 * cap is CLAMPED to `min(posted, boot ceiling)` — a posted config (even a directly-appended `run.configured`
 * bypassing the route's 422) can LOWER a cap but NEVER raise it above the boot maximum. The loop enforces
 * the TOP-LEVEL `config.caps` (generationLoop.ts:230), so both the top-level and `runConfig.caps` are set
 * to the clamped value (consistency). The boot immutables ride through by reference (the `...boot` spread).
 */
export function mergePerRunConfig(boot: AppConfig, perRun: RunConfig): AppConfig {
  const caps: RunCaps = {
    maxPopulation: Math.min(perRun.caps.maxPopulation, boot.caps.maxPopulation),
    maxGenerations: Math.min(perRun.caps.maxGenerations, boot.caps.maxGenerations),
    energyBudget: Math.min(perRun.caps.energyBudget, boot.caps.energyBudget),
    maxSpawnDepth: Math.min(perRun.caps.maxSpawnDepth, boot.caps.maxSpawnDepth),
    maxToolCalls: Math.min(perRun.caps.maxToolCalls, boot.caps.maxToolCalls),
    wallClockTimeoutMs: Math.min(perRun.caps.wallClockTimeoutMs, boot.caps.wallClockTimeoutMs),
  };
  return {
    ...boot,
    caps,
    runConfig: {
      ...boot.runConfig,
      // PD.10 — thread the per-run PROBLEM (RunConfig.seed) so it reaches the generation loop (was dropped).
      seed: perRun.seed,
      rngSeed: perRun.rngSeed,
      enabledSubtypes: perRun.enabledSubtypes,
      caps,
      // FB.2 — thread the (route-validated) per-run modelRouteOverride so recorded == executed (was
      // dropped). The kernel-bound re-clamp + the actual route resolution happen at the gateway overlay.
      ...(perRun.modelRouteOverride !== undefined
        ? { modelRouteOverride: perRun.modelRouteOverride }
        : {}),
      // FB.3 — thread the per-run generationOperators so the loop executes the recorded operators (was
      // dropped). The closed-enum operators map to TRUSTED framing fragments in the population_generator
      // system message (composeOperatorFraming) — prompt-only, no cap/energy effect (rule #1/#8).
      ...(perRun.generationOperators !== undefined
        ? { generationOperators: perRun.generationOperators }
        : {}),
      // FB.4 — thread the per-run generationBias dial so the loop executes the recorded diverge/converge
      // value (was dropped). `!== undefined` preserves an explicit neutral 0 (an engaged-but-neutral dial);
      // the dial maps to a TRUSTED band fragment + a clamped temperature on the population_generator request
      // only — prompt + sampling, no cap/energy effect (rule #1/#8), never the judge/critic path (rule #6).
      ...(perRun.generationBias !== undefined ? { generationBias: perRun.generationBias } : {}),
    },
  };
}

/**
 * MVP boot defaults — `cullPolicy` + `MutationBounds` are NOT yet on `AppConfig` (a config-schema
 * follow-up). The cull is RELATIVE to each generation's fitness distribution: an agenome is culled when its
 * best total falls below `mean − 1·stddev` (`relativeStdDevK: 1`), so clearly-weak lineages are removed but
 * a tight distribution erodes nothing — the prior `minFitness: 0` never fired (a total is ≥ 0, so nothing
 * was ever culled). `minSurvivors: 2` is the POPULATION FLOOR: the cull never drops the eligible population
 * below the 2 parents fusion needs to reproduce (complements the extinction-guard in `successor.ts`).
 * `cullFraction: 1/3` adds TRUNCATION pressure — each generation the weakest third of eligible lineages die
 * even in a tight (no-outlier) distribution, so weak lineages reliably die and the population converges
 * toward a winner (the relative-only rule eroded nothing when fitness clustered). Floor-clamped + weakest-
 * first → deterministic/replay-safe (rule #7). The mutation tool allowlist is DERIVED from the seed set's
 * `toolPermissions` union → mutation never invents a tool outside the seeded space (no privilege invention).
 */
const MVP_CULL_POLICY: CullPolicy = { relativeStdDevK: 1, minSurvivors: 2, cullFraction: 1 / 3 };

function mvpMutationBounds(config: AppConfig): MutationBounds {
  const toolPermissionAllowlist = [
    ...new Set(config.seedSet.flatMap((template) => template.toolPermissions)),
  ];
  return { personaWeightDelta: 0.1, spawnBudgetDelta: 1, toolPermissionAllowlist };
}

/**
 * Adapt the frozen `ModelGateway` port to the loop's `GenerationGateway` — the PASS-THROUGH (no tool-use):
 * one `population_generator` call, no tool relay. Used on the recorded/replay path (where the recorded
 * gateway returns final candidates and replay reads any persisted tool results — rule #7, no re-execution).
 * The live path uses {@link createToolOrchestratingGateway} instead (TU.5).
 */
function toGenerationGateway(modelGateway: ModelGateway): GenerationGateway {
  return {
    generate: async (request: ModelGatewayRequest) => ({
      response: await modelGateway.call(request),
    }),
  };
}

export function composeRunWorkerDeps(input: ComposeRuntimeInput): RunWorkerDeps {
  const { eventStore, checkRegistry, listRunIds, newId, runId } = input;
  // W3b-2c — the worker executes the RECORDED per-run config (merged + clamped over boot), or the boot
  // config when no per-run config is supplied.
  const config =
    input.perRunConfig === undefined
      ? input.config
      : mergePerRunConfig(input.config, input.perRunConfig);

  // FB.2 — when the run carries a (route-validated) modelRouteOverride AND the live boot supplied a
  // `gatewayForOverride` factory, build the run's gateway from it (a registry overlay re-clamped to the
  // allowlist → FB.1 dispatch routes the overridden provider). Otherwise the boot singleton gateway
  // (the recorded/replay path builds no factory → no provider re-resolution, rule #7).
  const override = input.perRunConfig?.modelRouteOverride;
  const modelGateway =
    override !== undefined && input.gatewayForOverride !== undefined
      ? input.gatewayForOverride(override)
      : input.modelGateway;

  const verify = createVerifySeam({
    gateway: modelGateway,
    eventStore,
    registry: checkRegistry,
    config,
    // rule #6 single-source — the held-out judge produces JudgeResult under THIS exact rubric.
    rubricSource: DEFAULT_JUDGE_RUBRIC,
    // Wave 1, Step 2 — run ALL 5 critic mandates every generation (no K=3 rotation), so critic_scores is
    // measured over the same axes each generation (no cross-gen "moving measuring stick") AND the two
    // previously-rotated-out mandates (falsification / subtype_specific) always review. Critics debit no
    // energy (rule #8), so this costs provider fan-out only.
    activeCount: 5,
  });
  const score = createScoreSeam({
    gateway: modelGateway,
    readByRun: eventStore.readByRun,
    policy: config.scoringPolicy,
    // rule #6 single-source — the SAME rubric the judge used, so judgeAcceptance's version check matches.
    rubric: DEFAULT_JUDGE_RUBRIC,
    cullPolicy: MVP_CULL_POLICY,
    newId,
  });
  const reproduce = createReproduceSeam({
    gateway: modelGateway,
    maxPopulation: config.caps.maxPopulation,
    bounds: mvpMutationBounds(config),
    seed: config.runConfig.rngSeed,
    newId,
    // EXPERIMENT — the r/K mutation share for the run's strategy (0 for fusion_only = HEAD). Under the
    // adaptive strategy the seam overrides this per-generation from the population novelty spread (E2).
    mutationFraction: strategyParams(config.mutationStrategy).baseMutationFraction,
    adaptive: strategyParams(config.mutationStrategy).usesAdaptiveFraction,
  });
  // ELITISM (anti-regression) — carry the top-K scored survivors UNCHANGED into the next generation so the
  // population doesn't regress to the mean each generation (the kernel still clamps the returned population
  // to maxPopulation — rule #1). Default 1 (config.eliteCount); 0 = offspring-only control.
  const nextPopulation = createSuccessorThreading({
    caps: config.caps,
    eliteCount: config.eliteCount,
  });

  // KB in-run retrieval (shared-knowledge stigmergy) — agents query the run's accumulated research notes at
  // generation time. SELF-GATING: it folds notes via `readByRun` and returns `undefined` when there are none
  // (gen-0, or any non-tool-using run — the recorded/replay path surfaces no tool calls), so wiring it
  // unconditionally is byte-identical to the baseline UNTIL a tool-using run leaves notes (then gen-1+
  // retrieve them). The loop persists the retrieved set on `candidate.generation_started` (rule #7) + threads
  // it as wrapUntrusted DATA into the population_generator request ONLY (rule #5/#6). Lexical MVP (keyless).
  const retrieveKnowledge = createKnowledgeRetriever({
    readByRun: eventStore.readByRun,
    ...(config.runConfig.generationBias !== undefined
      ? { generationBias: config.runConfig.generationBias }
      : {}),
  });

  // TU.5 — the population_generator gateway: the tool-orchestrating gateway when the live tool seams are
  // wired (agents do their own research), else the pass-through (recorded/replay — replay reads persisted
  // tool results, never re-executes; rule #7). Rule #6: this gateway is the population_generator path ONLY;
  // the verify seam calls `modelGateway` directly for critic/judge, which never sees a tool.
  const generationGateway: GenerationGateway =
    input.toolExecutorSeams !== undefined
      ? createToolOrchestratingGateway({
          gateway: modelGateway,
          toolExecutorDeps: input.toolExecutorSeams,
        })
      : toGenerationGateway(modelGateway);

  return {
    runId,
    config,
    eventStore,
    gateway: generationGateway,
    seams: { verify, score, reproduce },
    nextPopulation,
    retrieveKnowledge,
    listRunIds,
    ...(input.operatorStop !== undefined ? { operatorStop: input.operatorStop } : {}),
  };
}
