import type { FastifyInstance } from 'fastify';
import {
  CURRENT_SCHEMA_VERSION,
  validateRunConfig,
  type RunCaps,
  type RunConfig,
} from '@doppl/contracts';
import type { EventStore } from '../event-store';
import { buildCurrentState } from '../projections';
import { createIdempotencyStore } from '../middleware/idempotency';

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
  /** Injected unique-id generator (UUID in prod boot; deterministic in tests). */
  newId: () => string;
}

/** The cap field that exceeds its maximum (lowering-only rule), or null if every cap is within ceiling. */
export function overCapField(caps: RunCaps, maxima: RunCaps): keyof RunCaps | null {
  for (const key of Object.keys(maxima) as (keyof RunCaps)[]) {
    if (caps[key] > maxima[key]) return key;
  }
  return null;
}

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

    // Fail-fast config validation (§15) — an invalid config appends NO run.configured.
    let config: RunConfig;
    try {
      config = validateRunConfig({
        defaults: deps.defaultConfig as unknown as Record<string, unknown>,
        file: asRecord(request.body),
        env: {},
      });
    } catch (error) {
      return reply.status(400).send({ error: 'invalid_config', message: (error as Error).message });
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
    const runId = deps.newId();
    await deps.store.append({
      id: deps.newId(),
      runId,
      type: 'run.configured',
      actor: 'operator',
      payload: { ...config } as Record<string, unknown>,
      schemaVersion: CURRENT_SCHEMA_VERSION,
    });
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
    // Idempotent: stopping an already-terminal run is a no-op success (no second terminal append).
    if (status !== undefined && TERMINAL_RUN_STATUSES.has(status)) {
      return reply.status(200).send({ runId, status, stopped: false });
    }
    // Append the terminal event — append-only, so prior events (partial evidence) are preserved.
    await deps.store.append({
      id: deps.newId(),
      runId,
      type: 'run.stopped',
      actor: 'operator',
      payload: {},
      schemaVersion: CURRENT_SCHEMA_VERSION,
    });
    if (activeRunId === runId) activeRunId = null;
    return reply.status(200).send({ runId, status: 'stopped', stopped: true });
  });
}
