import {
  CURRENT_SCHEMA_VERSION,
  type ActorRole,
  validateRunConfig,
  type RunCaps,
  type RunConfig,
} from '@doppl/contracts';
import type { EventStore } from '../event-store';
import {
  modelRouteOverrideViolation,
  type ModelRouteOverrideAllowlist,
} from '../model-gateway/model-route-override';

export interface RunStartValidationDeps {
  defaultConfig: RunConfig;
  modelRouteOverrideAllowlist: ModelRouteOverrideAllowlist;
}

export type RunStartValidationResult =
  | { ok: true; config: RunConfig }
  | { ok: false; statusCode: 400 | 422; body: Record<string, unknown> };

export interface AppendAndStartInnerRunDeps {
  store: EventStore;
  newId: () => string;
  onRunConfigured?: (runId: string) => void;
}

export interface AppendAndStartInnerRunOptions {
  runId?: string;
  actor?: ActorRole;
  payloadExtras?: Record<string, unknown>;
}

/** The cap field that exceeds its maximum (lowering-only rule), or null if every cap is within ceiling. */
export function overCapField(caps: RunCaps, maxima: RunCaps): keyof RunCaps | null {
  for (const key of Object.keys(maxima) as (keyof RunCaps)[]) {
    if (caps[key] > maxima[key]) return key;
  }
  return null;
}

export function validateRunConfigForStart(
  rawConfig: Record<string, unknown>,
  deps: RunStartValidationDeps,
): RunStartValidationResult {
  let config: RunConfig;
  try {
    config = validateRunConfig({
      defaults: deps.defaultConfig as unknown as Record<string, unknown>,
      file: rawConfig,
      env: {},
    });
  } catch (error) {
    return {
      ok: false,
      statusCode: 400,
      body: { error: 'invalid_config', message: (error as Error).message },
    };
  }

  const over = overCapField(config.caps, deps.defaultConfig.caps);
  if (over !== null) {
    return { ok: false, statusCode: 422, body: { error: 'cap_override_exceeds_max', field: over } };
  }

  if (config.modelRouteOverride !== undefined) {
    const violation = modelRouteOverrideViolation(
      config.modelRouteOverride,
      deps.modelRouteOverrideAllowlist,
    );
    if (violation !== null) {
      return {
        ok: false,
        statusCode: 422,
        body: { error: 'model_route_override_not_permitted', ...violation },
      };
    }
  }

  return { ok: true, config };
}

export async function appendAndStartInnerRun(
  config: RunConfig,
  deps: AppendAndStartInnerRunDeps,
  options: AppendAndStartInnerRunOptions = {},
): Promise<string> {
  const runId = options.runId ?? deps.newId();
  await deps.store.append({
    id: deps.newId(),
    runId,
    type: 'run.configured',
    actor: options.actor ?? 'operator',
    payload: { ...config, ...(options.payloadExtras ?? {}) } as Record<string, unknown>,
    schemaVersion: CURRENT_SCHEMA_VERSION,
  });
  deps.onRunConfigured?.(runId);
  return runId;
}
