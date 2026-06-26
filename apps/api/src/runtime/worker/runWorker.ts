import { CURRENT_SCHEMA_VERSION } from '@doppl/contracts';
import type { EventStore } from '../../event-store';
import type { AppConfig } from '../config/configSchema';
import type { KillPlanSummary } from '../caps/killSwitch';
import { canTransitionRun } from '../state/runStateMachine';
import { createHeartbeat, type Heartbeat } from '../heartbeat';
import {
  runGenerationLoop,
  type GenerationGateway,
  type GenerationLoopDeps,
  type GenerationSeams,
} from '../loop/generationLoop';
import { activeRunGuard, isRunTerminal, type ActiveRunEntry } from './activeRunGuard';
import { stepAlreadyRecorded } from './idempotency';

/**
 * P3.12 — the in-process single-active-run worker (ARCHITECTURE.md §5 workers & concurrency, §3 run.started,
 * §4 sequence; KEY SAFETY RULES #1/#2/#8). The worker is `runGenerationLoop`'s production CALLER — it:
 *
 *  1. enforces single-active-run from the authoritative log (`activeRunGuard` — a second active run is
 *     rejected; read-only replays of terminal runs never count as active);
 *  2. is idempotent off the PERSISTED log — it starts ONLY a configured-and-not-yet-started run (a
 *     running/terminal run already carries `run.started` ⇒ no re-start, no loop re-entry ⇒ no double-append
 *     and no double `energy.spent` debit, rule #8);
 *  3. appends `run.started` (configured→running) guard-validated through the P3.2 run state machine;
 *  4. beats the worker-alive heartbeat (LESSONS §60 SIDE SIGNAL, NOT a run_event — rule #2) at pickup and
 *     once per generation via the loop's `onIteration` hook (injected clock + sink → timer-free);
 *  5. drives `runGenerationLoop`, which appends the generations and terminalizes via P3.11.
 *
 * The worker only appends (run.started) + reads ordered-by-sequence through the `EventStore` port — it never
 * mutates (the port exposes no update/delete, LESSONS §55). The REST POST `/runs` → `runWorker` trigger +
 * the stop → `operatorStop` wiring are DEFERRED to demo/Phase D (routes/ is demo territory; the integration
 * test exercises `runWorker` directly, so the worker itself is fully covered).
 */

export interface RunWorkerHeartbeat {
  /** Throttle window (ms) for the §60 heartbeat (`createHeartbeat`); 0 = beat on every call. */
  readonly intervalMs: number;
  /** Injected sink for an emitted beat (consumed by `isWorkerAlive` / the P6.8 /health surfacing). */
  readonly emit: (beat: Heartbeat) => void;
}

export interface RunWorkerDeps {
  readonly runId: string;
  readonly config: AppConfig;
  readonly eventStore: EventStore;
  readonly gateway: GenerationGateway;
  readonly seams: GenerationSeams;
  /**
   * Enumerate all run ids for the single-active-run scan. INJECTED: the runtime worker cannot import the
   * projections `listRunIds` (the layer rule — runtime is below projections) and the EventStore port is
   * append+read only; the REST/Phase-D caller + the integration test supply a drizzle `selectDistinct` impl.
   */
  readonly listRunIds: () => Promise<readonly string[]>;
  /** Injected wall-clock (replay-safe; default `() => 0`) shared with the heartbeat throttle + the loop. */
  readonly now?: () => number;
  /** Injected operator-stop signal threaded into the loop (§5); the stop endpoint sets it (Phase D). */
  readonly operatorStop?: () => boolean;
  /** Injected heartbeat config (§60); absent → no heartbeat wired. */
  readonly heartbeat?: RunWorkerHeartbeat;
  readonly minPopulationSurvival?: number;
  /** P5.11 — forwarded to the loop's successor-threading hook (additive; absent → no threading). The W3b
   *  boot root injects the real impl here. */
  readonly nextPopulation?: GenerationLoopDeps['nextPopulation'];
  /** KB in-run retrieval — forwarded to the loop's `retrieveKnowledge` seam (additive; absent → no
   *  retrieval). The boot root injects the shared-KB retriever here. */
  readonly retrieveKnowledge?: GenerationLoopDeps['retrieveKnowledge'];
}

export type RunWorkerSkipReason =
  | 'run_already_active'
  | 'already_started'
  | 'unknown_run'
  | 'illegal_transition';

export type RunWorkerResult =
  | {
      readonly started: true;
      readonly generationsRun: number;
      readonly killSummary?: KillPlanSummary;
    }
  | {
      readonly started: false;
      readonly reason: RunWorkerSkipReason;
      readonly activeRunId?: string;
    };

export async function runWorker(deps: RunWorkerDeps): Promise<RunWorkerResult> {
  const { runId, eventStore } = deps;
  const now = deps.now ?? (() => 0);

  // 1. Single-active-run guard (kernel-authoritative, over the log): reject a new start while any OTHER run
  //    is non-terminal. Each other run's terminal flag is derived from its persisted log (`isRunTerminal`).
  const runIds = await deps.listRunIds();
  const entries: ActiveRunEntry[] = [];
  for (const id of runIds) {
    if (id === runId) continue;
    entries.push({ runId: id, terminal: isRunTerminal(await eventStore.readByRun(id)) });
  }
  const guard = activeRunGuard(entries, runId);
  if (!guard.allowed) {
    return { started: false, reason: guard.reason, activeRunId: guard.activeRunId };
  }

  // 2. Run-level idempotency (off the persisted log): start ONLY a configured-and-not-yet-started run.
  const log = await eventStore.readByRun(runId);
  if (!stepAlreadyRecorded(log, { type: 'run.configured' })) {
    return { started: false, reason: 'unknown_run' };
  }
  if (stepAlreadyRecorded(log, { type: 'run.started' })) {
    return { started: false, reason: 'already_started' };
  }

  // 3. Append run.started (configured→running), guard-validated through the P3.2 run state machine.
  if (!canTransitionRun('configured', 'running').allowed) {
    return { started: false, reason: 'illegal_transition' }; // table-legal → unreachable; defensive backstop
  }
  await eventStore.append({
    id: `${runId}-run-started`,
    runId,
    type: 'run.started',
    actor: 'runtime',
    payload: { from: 'configured', to: 'running' },
    schemaVersion: CURRENT_SCHEMA_VERSION,
  });

  // 4. Worker-alive heartbeat — a §60 SIDE SIGNAL (never a run_event). Beat at pickup; the loop beats once
  //    per generation via `onIteration`. Injected clock + sink keep it timer-free + test-deterministic.
  const heartbeat = deps.heartbeat
    ? createHeartbeat({ now, intervalMs: deps.heartbeat.intervalMs, emit: deps.heartbeat.emit })
    : null;
  heartbeat?.beat();

  // 5. Drive the generation loop (P3.10) — it appends the generations and terminalizes via P3.11 at exit.
  const result = await runGenerationLoop({
    runId,
    config: deps.config,
    eventStore,
    gateway: deps.gateway,
    seams: deps.seams,
    now,
    ...(heartbeat ? { onIteration: () => heartbeat.beat() } : {}),
    ...(deps.operatorStop !== undefined ? { operatorStop: deps.operatorStop } : {}),
    ...(deps.minPopulationSurvival !== undefined
      ? { minPopulationSurvival: deps.minPopulationSurvival }
      : {}),
    ...(deps.nextPopulation !== undefined ? { nextPopulation: deps.nextPopulation } : {}),
    ...(deps.retrieveKnowledge !== undefined ? { retrieveKnowledge: deps.retrieveKnowledge } : {}),
  });

  return {
    started: true,
    generationsRun: result.generationsRun,
    ...(result.killSummary !== undefined ? { killSummary: result.killSummary } : {}),
  };
}
