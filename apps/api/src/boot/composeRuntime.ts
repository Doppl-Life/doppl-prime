import type {
  CheckRunnerRegistry,
  ModelGatewayRequest,
  ModelRouteOverride,
  RunCaps,
  RunConfig,
} from '@doppl/contracts';
import type { AppConfig } from '../runtime/config/configSchema';
import type { EventStore } from '../event-store';
import type { ModelGateway } from '../model-gateway';
import { type GenerationGateway, type RunWorkerDeps } from '../runtime';
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
    },
  };
}

/**
 * MVP boot defaults — `cullPolicy` + `MutationBounds` are NOT yet on `AppConfig` (a config-schema
 * follow-up). `minFitness: 0` is permissive (a fitness total is ≥ 0, so nothing is culled at MVP). The
 * mutation tool allowlist is DERIVED from the seed set's `toolPermissions` union → mutation never invents
 * a tool outside the seeded space (rule alignment; no privilege invention).
 */
const MVP_CULL_POLICY: CullPolicy = { minFitness: 0 };

function mvpMutationBounds(config: AppConfig): MutationBounds {
  const toolPermissionAllowlist = [
    ...new Set(config.seedSet.flatMap((template) => template.toolPermissions)),
  ];
  return { personaWeightDelta: 0.1, spawnBudgetDelta: 1, toolPermissionAllowlist };
}

/**
 * Adapt the frozen `ModelGateway` port to the loop's `GenerationGateway` (the `population_generator`
 * `generate`). Tool-call / attempt-failure surfacing is the production provider-adapter's job (the frozen
 * `ModelGatewayResponse` can't carry them) — deferred with the kernel's tool-energy item (Phase-D); the
 * loop already supports the channel.
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
  });
  const nextPopulation = createSuccessorThreading({ caps: config.caps });

  return {
    runId,
    config,
    eventStore,
    gateway: toGenerationGateway(modelGateway),
    seams: { verify, score, reproduce },
    nextPopulation,
    listRunIds,
    ...(input.operatorStop !== undefined ? { operatorStop: input.operatorStop } : {}),
  };
}
