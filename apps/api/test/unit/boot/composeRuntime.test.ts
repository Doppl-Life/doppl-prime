import { describe, expect, test } from 'vitest';
import type { ModelGatewayResponse, ModelRouteOverride, RunConfig } from '@doppl/contracts';
import { composeRunWorkerDeps, mergePerRunConfig } from '../../../src/boot/composeRuntime';
import { loadConfig } from '../../../src/runtime/config/loadConfig';
import type { AppConfig } from '../../../src/runtime/config/configSchema';
import type { EventStore } from '../../../src/event-store';
import type { ModelGateway } from '../../../src/model-gateway';
import { CHECK_RUNNER_REGISTRY } from '../../../src/check-runners/registry';

/**
 * FB.2 — `mergePerRunConfig` now threads the validated `modelRouteOverride` into the per-run config (it
 * used to drop it), and `composeRunWorkerDeps` selects a per-run gateway via the injected
 * `gatewayForOverride` factory when (and only when) the run carries an override — so the run executes
 * against the overridden route (recorded == executed). Pure composition; no DB (the seams are factories).
 */

const VALID_ENV: Record<string, string | undefined> = {
  OPENROUTER_API_KEY: 'or-key',
  OPENAI_API_KEY: 'oai-key',
  DATABASE_URL: 'postgres://localhost/db',
};

const BOOT: AppConfig = loadConfig({ env: VALID_ENV, fileSources: {} });

const OVERRIDE: ModelRouteOverride = {
  population_generator: { provider: 'ollama', modelId: 'llama3.1' },
};

function perRun(over?: ModelRouteOverride): RunConfig {
  return {
    seed: 'scenario-x',
    enabledSubtypes: BOOT.runConfig.enabledSubtypes,
    caps: BOOT.caps, // within the boot ceiling (equal)
    modelProfile: BOOT.runConfig.modelProfile,
    scoringPolicyVersion: BOOT.runConfig.scoringPolicyVersion,
    rngSeed: 7,
    ...(over !== undefined ? { modelRouteOverride: over } : {}),
  };
}

const fakeGateway = (label: string): ModelGateway => ({
  call: (): Promise<ModelGatewayResponse> =>
    Promise.resolve({
      accepted: true,
      validationResult: 'accepted',
      output: { label },
      providerMeta: {
        provider: label,
        modelId: 'm',
        gatewayRequestId: 'g',
        tokensIn: 0,
        tokensOut: 0,
      },
    }),
  capabilityFor: () => ({ structuredOutputs: true, embeddings: false }),
});

const fakeStore = {
  readByRun: () => Promise.resolve([]),
} as unknown as EventStore;

function composeWith(opts: {
  perRunConfig?: RunConfig;
  gatewayForOverride?: (o: ModelRouteOverride) => ModelGateway;
}): ReturnType<typeof composeRunWorkerDeps> {
  return composeRunWorkerDeps({
    config: BOOT,
    modelGateway: fakeGateway('boot'),
    eventStore: fakeStore,
    checkRegistry: CHECK_RUNNER_REGISTRY,
    listRunIds: () => Promise.resolve([]),
    newId: () => 'id',
    runId: 'run_1',
    ...(opts.perRunConfig !== undefined ? { perRunConfig: opts.perRunConfig } : {}),
    ...(opts.gatewayForOverride !== undefined
      ? { gatewayForOverride: opts.gatewayForOverride }
      : {}),
  });
}

describe('FB.2 — mergePerRunConfig threads the validated override', () => {
  test('test_merge_per_run_threads_validated_override', () => {
    // the validated modelRouteOverride is carried into the per-run config (no longer dropped); the caps
    // clamp still applies (min(perRun, boot)).
    const merged = mergePerRunConfig(BOOT, perRun(OVERRIDE));
    expect(merged.runConfig.modelRouteOverride).toEqual(OVERRIDE);
    expect(merged.runConfig.caps.maxPopulation).toBe(
      Math.min(BOOT.caps.maxPopulation, BOOT.caps.maxPopulation),
    );
    // an absent override leaves the field absent (additive/optional).
    expect(mergePerRunConfig(BOOT, perRun()).runConfig.modelRouteOverride).toBeUndefined();
  });
});

describe('FB.2 — composeRunWorkerDeps selects the per-run override gateway', () => {
  test('test_compose_uses_override_gateway_when_present', () => {
    // when the run carries an override AND a gatewayForOverride factory is injected, compose builds the
    // run's gateway from it (passing the override) — the run executes against the overridden route.
    const seen: ModelRouteOverride[] = [];
    composeWith({
      perRunConfig: perRun(OVERRIDE),
      gatewayForOverride: (o) => {
        seen.push(o);
        return fakeGateway('overlay');
      },
    });
    expect(seen).toEqual([OVERRIDE]); // the factory was invoked with the run's override
  });

  test('test_compose_uses_boot_gateway_without_override', () => {
    // no override (or no factory) → the boot singleton gateway is used; the factory is never invoked.
    // This is also the recorded/replay path — no per-run provider re-resolution (rule #7).
    const seen: ModelRouteOverride[] = [];
    const factory = (o: ModelRouteOverride): ModelGateway => {
      seen.push(o);
      return fakeGateway('overlay');
    };
    composeWith({ perRunConfig: perRun(), gatewayForOverride: factory }); // override absent
    composeWith({ perRunConfig: perRun(OVERRIDE) }); // override present but NO factory (recorded)
    expect(seen).toEqual([]); // factory never invoked on either path
  });
});
