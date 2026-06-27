import { RunConfig } from '@doppl/contracts';
import type { CheckRunnerRegistry, ModelRouteOverride } from '@doppl/contracts';
import type { AppConfig } from '../runtime/config/configSchema';
import type { EventStore } from '../event-store';
import type { ModelGateway, ToolExecutorDeps } from '../model-gateway';
import { runWorker } from '../runtime';
import { composeRunWorkerDeps } from './composeRuntime';

/**
 * extractRunConfig — reconstruct the strict `RunConfig` from a `run.configured` payload, TOLERATING extra
 * run-level metadata keys the payload may carry alongside the config (Islands pivot Increment A: the route
 * rides `caseStudyId` on the generic run.configured payload, §107, zero contract bump). `RunConfig` is a
 * strict object, so a raw `safeParse` of the whole payload would REJECT the extra key; instead we pick only
 * `RunConfig`'s own fields before parsing. Generic over any future run-level metadata. Pure. Returns
 * `undefined` when the payload isn't an object or the picked fields don't form a valid RunConfig.
 */
export function extractRunConfig(payload: unknown): RunConfig | undefined {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return undefined;
  const record = payload as Record<string, unknown>;
  const configFields: Record<string, unknown> = {};
  for (const key of Object.keys(RunConfig.shape)) {
    if (key in record) configFields[key] = record[key];
  }
  const parsed = RunConfig.safeParse(configFields);
  return parsed.success ? parsed.data : undefined;
}

/**
 * readRecordedConfig — read the operator's RECORDED `RunConfig` from the run's authoritative
 * `run.configured` event (the route appended the validated config there). Returns `undefined` when absent
 * or unparseable → the caller falls back to the boot config (defensive; the worker's idempotency already
 * requires `run.configured` to exist, so the normal path always finds it). Read-only; no provider call.
 */
async function readRecordedConfig(
  store: Pick<EventStore, 'readByRun'>,
  runId: string,
): Promise<RunConfig | undefined> {
  const rows = await store.readByRun(runId);
  const configured = rows.find((row) => row.type === 'run.configured');
  if (configured === undefined) return undefined;
  return extractRunConfig(configured.payload);
}

/**
 * The infra a run trigger closes over at boot — built ONCE (config/gateway/store/registry/listRunIds/newId);
 * per-run only the `runId` varies. (MVP: the worker runs with this boot `config`; per-run config from the
 * `run.configured` payload driving the worker is a documented follow-up.)
 */
export interface StartRunInfra {
  readonly config: AppConfig;
  readonly modelGateway: ModelGateway;
  /** FB.2 — the per-run gateway factory (live boot only): a registry overlay re-clamped to the allowlist
   *  when a run carries a validated `modelRouteOverride`. Absent → the boot singleton gateway (rule #7). */
  readonly gatewayForOverride?: (override: ModelRouteOverride) => ModelGateway;
  /** TU.5 — the live tool-execution seams (live boot only): the population_generator gateway becomes the
   *  tool-orchestrating gateway so agents do their own research. Absent → pass-through (recorded/replay). */
  readonly toolExecutorSeams?: ToolExecutorDeps;
  readonly eventStore: EventStore;
  readonly checkRegistry: CheckRunnerRegistry;
  readonly listRunIds: () => Promise<readonly string[]>;
  readonly newId: () => string;
  /** Called on a worker error — the run's failure is authoritative in the log; this is for logging only. */
  readonly onError?: (runId: string, err: unknown) => void;
  /** Called after the worker SETTLES (success or error) — a determinism hook for tests + the boot's
   *  operator-stop registry cleanup; omit when neither is needed. */
  readonly onSettled?: (runId: string) => void;
  /** PD.3 — the operator-stop poll-fn factory (the boot `operatorStopRegistry.checker`). When present,
   *  `createStartRun` threads `operatorStop: operatorStopFor(runId)` into the worker so the loop drains on a
   *  latched stop. Absent → no operator-stop seam (the run ends only via caps / completion). */
  readonly operatorStopFor?: (runId: string) => () => boolean;
}

/**
 * createStartRun (P5.11) — the production FIRE-AND-FORGET run trigger. Returns `(runId) => void`: it composes
 * the worker deps (W3b-2a `composeRunWorkerDeps`) for the run and fires `runWorker` WITHOUT blocking the
 * caller — so the HTTP `POST /runs` 201 returns immediately (the run executes in-process, asynchronously).
 *
 * A worker error is CAUGHT (`.catch`) so a rejection can never become an unhandled rejection that crashes
 * the HTTP server — the run's failure is authoritative in the event log (the worker / crash-forward
 * terminalizes it `run.failed`). `onSettled` is a test-only determinism hook (resolve a latch when the run
 * settles); production omits it. The wrapper appends nothing itself (the worker/loop own all events, rule #2).
 */
export function createStartRun(infra: StartRunInfra): (runId: string) => void {
  return (runId: string): void => {
    // W3b-2c — read the RECORDED per-run config from run.configured (async) then run the worker under the
    // merged+clamped config, so recorded == executed. The read + run ride one fire-and-forget chain.
    void (async (): Promise<void> => {
      const perRunConfig = await readRecordedConfig(infra.eventStore, runId);
      await runWorker(
        composeRunWorkerDeps({
          config: infra.config,
          modelGateway: infra.modelGateway,
          eventStore: infra.eventStore,
          checkRegistry: infra.checkRegistry,
          listRunIds: infra.listRunIds,
          newId: infra.newId,
          runId,
          ...(perRunConfig !== undefined ? { perRunConfig } : {}),
          ...(infra.gatewayForOverride !== undefined
            ? { gatewayForOverride: infra.gatewayForOverride }
            : {}),
          ...(infra.toolExecutorSeams !== undefined
            ? { toolExecutorSeams: infra.toolExecutorSeams }
            : {}),
          ...(infra.operatorStopFor !== undefined
            ? { operatorStop: infra.operatorStopFor(runId) }
            : {}),
        }),
      );
    })()
      // The hook bodies are wrapped so a throwing onError/onSettled can NEVER escape as an unhandled
      // rejection that crashes the HTTP server — the fire-and-forget guarantee holds even for a bad hook.
      .catch((err: unknown) => {
        try {
          infra.onError?.(runId, err);
        } catch {
          /* a logging hook must never crash the server */
        }
      })
      .finally(() => {
        try {
          infra.onSettled?.(runId);
        } catch {
          /* a determinism/settle hook must never crash the server */
        }
      });
  };
}
