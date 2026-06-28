import type { FastifyInstance } from 'fastify';
import { type RunCaps, type RunConfig } from '@doppl/contracts';
import type { EventStore } from '../event-store';
import { buildCurrentState } from '../projections';
import { createIdempotencyStore } from '../middleware/idempotency';
import { applyDemoCapOverride } from '../runtime/demo';
import { type ModelRouteOverrideAllowlist } from '../model-gateway/model-route-override';
import {
  appendAndStartInnerRun,
  overCapField,
  validateRunConfigForStart,
} from '../runs/start-inner-run';

/**
 * The REST write path (ARCHITECTURE.md §11/§14/§15). POST /runs + POST /runs/:id/stop append
 * authoritative events via the P1.3 writer ONLY — they never mutate a projection directly (REST is the
 * sole write path, rule #2). Defense layer: the API rejects a cap override above the validated maxima
 * (lowering-only); the KERNEL (P3) is the authoritative cap enforcer (rule #1). Concurrency + idempotency
 * are in-memory per server instance, re-validated against the authoritative log (MVP, §5 single-process).
 */

/** Terminal RunStatus values (§3) — no exit from terminal. */
const TERMINAL_RUN_STATUSES: ReadonlySet<string> = new Set([
  'completed',
  'stopped',
  'failed',
  // forward-compat: 'cancelled' is a valid terminal RunStatus (§3) but no `run.cancelled` event exists
  // in the closed 36-member registry yet, so it's currently unreachable here — kept for when the kernel
  // emits cancellation (P3). Harmless: a status that never occurs simply never matches.
  'cancelled',
]);

export interface RunRoutesDeps {
  store: EventStore;
  /** The default config; its `caps` are the maxima (ceilings) a request may lower but not exceed. */
  defaultConfig: RunConfig;
  /**
   * FB.2 — the frozen per-role allowlist `RunConfig.modelRouteOverride` is clamped to (rule #1, like
   * caps). A non-permitted override is rejected 422 before the `run.configured` append; `final_judge` is
   * absent (rule #6). An empty/absent allowlist ⇒ no override permitted (fail-closed).
   */
  modelRouteOverrideAllowlist: ModelRouteOverrideAllowlist;
  /** Injected unique-id generator (UUID in prod boot; deterministic in tests). */
  newId: () => string;
  /**
   * P5.11 — additive optional execution trigger, fired AFTER the authoritative `run.configured` append
   * (fire-and-forget; the 201 does NOT block on the run). Default ABSENT → today's behavior (append-only,
   * no execution) unchanged. Wired to the boot composition (`createStartRun`) in `buildServer`.
   */
  onRunConfigured?: (runId: string) => void;
  /**
   * PD.3 — latch an operator stop for `runId` (the boot `operatorStopRegistry.request`). `POST /runs/:id/stop`
   * SIGNALS the in-flight worker through this; the worker drains + terminalizes `run.stopped` (rule #2 — the
   * route appends NO terminal). `buildServer` supplies a no-op default when boot wires no registry.
   */
  requestStop: (runId: string) => void;
}

export { overCapField } from '../runs/start-inner-run';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isPlainObject(value) ? value : {};
}

// A duplicated `Idempotency-Key` header arrives as string[] — coalesce to the first element
// deterministically rather than silently dropping the key (which would bypass the dedup).
function readIdempotencyKey(raw: string | string[] | undefined): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function registerRunRoutes(app: FastifyInstance, deps: RunRoutesDeps): void {
  const idempotency = createIdempotencyStore();
  // One active run at a time (§5/§15): an in-memory hint, re-validated against the authoritative log.
  let activeRunId: string | null = null;

  async function isActive(runId: string): Promise<boolean> {
    const events = await deps.store.readByRun(runId);
    if (events.length === 0) return false;
    const status = buildCurrentState(events).state.runs[runId]?.status;
    return status !== undefined && !TERMINAL_RUN_STATUSES.has(status);
  }

  app.post('/runs', async (request, reply) => {
    // Idempotency first: a repeated key returns the existing run (no second run.configured).
    const idemKey = readIdempotencyKey(request.headers['idempotency-key']);
    if (idemKey !== null) {
      const existing = idempotency.get(idemKey);
      if (existing !== undefined) {
        return reply.status(200).send({ runId: existing, idempotent: true });
      }
    }

    // Fail-fast (§15): a present-but-non-object body (array/string/number) is malformed — reject
    // rather than letting `asRecord` mask it into a silent default-config run.
    if (request.body !== undefined && request.body !== null && !isPlainObject(request.body)) {
      return reply
        .status(400)
        .send({ error: 'invalid_config', message: 'request body must be a JSON object' });
    }

    // Separate the PD.12 demo cap-override AND the Islands-pivot `caseStudyId` from the RunConfig body
    // BEFORE validation — RunConfig is strict, so an unknown `demoOverride`/`caseStudyId` key would 400.
    // demoOverride is a demo cap-LOWERING convenience; caseStudyId is the case study this run executes
    // (Increment A: rides the run.configured payload, zero contract bump §107; formalized in Increment B).
    const { demoOverride, caseStudyId, ...runConfigBody } = asRecord(request.body);

    // Fail-fast config validation (§15) — an invalid config appends NO run.configured.
    const validated = validateRunConfigForStart(runConfigBody, deps);
    if (!validated.ok) return reply.status(validated.statusCode).send(validated.body);
    let config: RunConfig = validated.config;

    // Demo cap-override (PD.12, §17/§5) — when present, the caps come ENTIRELY from
    // `applyDemoCapOverride(maxima, override)`: every overridden field is LOWERED, every other field is
    // the maximum (the override supersedes any submitted `caps` — a deliberate demo convenience). It
    // only-LOWERS within maxima (throws → 422 on above-maxima / non-positive / bogus field) and is
    // defense-in-depth operator input, NEVER a 2nd cap authority — the authoritative `overCapField`
    // below still runs on the result (rule #1, LESSONS §89).
    if (isPlainObject(demoOverride)) {
      try {
        config = {
          ...config,
          caps: applyDemoCapOverride(deps.defaultConfig.caps, demoOverride as Partial<RunCaps>),
        };
      } catch (error) {
        return reply
          .status(422)
          .send({ error: 'cap_override_exceeds_max', message: (error as Error).message });
      }
    }

    // Cap-override rejection (§11) — a cap above the validated maxima is refused, never clamped up.
    const over = overCapField(config.caps, deps.defaultConfig.caps);
    if (over !== null) {
      return reply.status(422).send({ error: 'cap_override_exceeds_max', field: over });
    }

    // Concurrency (§15) — refuse a new run while one is non-terminal (not silently queued).
    if (activeRunId !== null && (await isActive(activeRunId))) {
      return reply.status(409).send({ error: 'run_already_active', activeRunId });
    }

    // Append run.configured — the sole authoritative write (rule #2). Operator-initiated.
    // caseStudyId rides the generic run.configured payload as run-level metadata (NOT a RunConfig field
    // — readRecordedConfig's extractRunConfig tolerates it). Added only when a non-empty string is given,
    // so an absent caseStudyId leaves the payload byte-identical to today.
    const runOptions =
      typeof caseStudyId === 'string' && caseStudyId.length > 0
        ? { payloadExtras: { caseStudyId } }
        : {};
    const runId = await appendAndStartInnerRun(config, deps, runOptions);
    activeRunId = runId;
    if (idemKey !== null) idempotency.set(idemKey, runId);
    return reply.status(201).send({ runId });
  });

  app.post('/runs/:id/stop', async (request, reply) => {
    const runId = (request.params as { id: string }).id;
    const events = await deps.store.readByRun(runId);
    if (events.length === 0) {
      return reply.status(404).send({ error: 'run_not_found', runId });
    }
    const status = buildCurrentState(events).state.runs[runId]?.status;
    // Idempotent: stopping an already-terminal run is a no-op success (no signal, no second terminal append).
    if (status !== undefined && TERMINAL_RUN_STATUSES.has(status)) {
      return reply.status(200).send({ runId, status, stopped: false });
    }
    // Non-terminal: SIGNAL the in-flight worker (latch `operatorStop`) — the worker's loop picks it up at its
    // next generation boundary, drains the current generation, and terminalizes `run.stopped` (running→
    // stopping, actor `runtime`). The route appends NOTHING (the worker owns the terminal — rule #2). A direct
    // in-route terminal append is buggy against a live worker (the loop polls the signal, not the log).
    // Do NOT clear `activeRunId`: the run is still draining/non-terminal until the worker terminalizes, so a
    // concurrent `POST /runs` still gets 409 (the `isActive()` log re-validation is the source of truth).
    deps.requestStop(runId);
    return reply.status(202).send({ runId, stopRequested: true });
  });
}
