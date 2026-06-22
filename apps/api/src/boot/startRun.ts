import type { CheckRunnerRegistry } from '@doppl/contracts';
import type { AppConfig } from '../runtime/config/configSchema';
import type { EventStore } from '../event-store';
import type { ModelGateway } from '../model-gateway';
import { runWorker } from '../runtime';
import { composeRunWorkerDeps } from './composeRuntime';

/**
 * The infra a run trigger closes over at boot — built ONCE (config/gateway/store/registry/listRunIds/newId);
 * per-run only the `runId` varies. (MVP: the worker runs with this boot `config`; per-run config from the
 * `run.configured` payload driving the worker is a documented follow-up.)
 */
export interface StartRunInfra {
  readonly config: AppConfig;
  readonly modelGateway: ModelGateway;
  readonly eventStore: EventStore;
  readonly checkRegistry: CheckRunnerRegistry;
  readonly listRunIds: () => Promise<readonly string[]>;
  readonly newId: () => string;
  /** Called on a worker error — the run's failure is authoritative in the log; this is for logging only. */
  readonly onError?: (runId: string, err: unknown) => void;
  /** Called after the worker SETTLES (success or error) — a determinism hook for tests; omit in production. */
  readonly onSettled?: (runId: string) => void;
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
    void runWorker(
      composeRunWorkerDeps({
        config: infra.config,
        modelGateway: infra.modelGateway,
        eventStore: infra.eventStore,
        checkRegistry: infra.checkRegistry,
        listRunIds: infra.listRunIds,
        newId: infra.newId,
        runId,
      }),
    )
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
