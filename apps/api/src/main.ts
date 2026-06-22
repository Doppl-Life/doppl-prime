import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { FastifyInstance } from 'fastify';
import type { RunConfig } from '@doppl/contracts';
import { loadConfig } from './runtime/config/loadConfig';
import { createEventStore, runMigrations } from './event-store';
import { selectGateway, type GatewaySelection, type ModelGateway } from './model-gateway';
import { CHECK_RUNNER_REGISTRY } from './check-runners/registry';
import { listRunIds } from './projections/run-list';
import { crashForward } from './runtime/recovery/crashForward';
import { createStartRun, type StartRunInfra } from './boot/startRun';
import { buildServer } from './server';

/**
 * The production boot root (PD.3, ARCHITECTURE.md §15/§5/§11/§17, KEY SAFETY RULES #2/#4/#7). The single
 * place env/file IO happens — every kernel seam stays PURE and is COMPOSED here (IO at the boundary,
 * LESSON 4 extended to boot). `bootApp(overrides?)` runs the fixed boot order:
 *
 *   loadConfig (fail-fast env: OPENROUTER/OPENAI/DATABASE_URL — names the var, never echoes a value, rule #4)
 *   → runMigrations (idempotent; the PD.2 seed step slots in here later: migrate → [seed] → start)
 *   → build infra over ONE pg pool (event store + the single `listRunIds(db)` reader)
 *   → AWAIT crashForward (every orphaned non-terminal run forward-failed to its §3 terminal BEFORE listen,
 *     so the single-active-run guard starts clean — §5 / P3.13)
 *   → buildServer({ onRunConfigured: createStartRun(infra) }) (the §11 fire-and-forget run trigger)
 *   → app.listen.
 *
 * It introduces ZERO new contract surface and authors no event — every seam it composes is already shipped
 * and kernel-enforced (caps rule #1, append-only rule #2, success-only energy rule #8, replay rule #7 all
 * stay the seams' job). The stop route keeps its in-route `run.stopped` append this slice (the kernel
 * `operatorStop` kill-and-drain rewire is the next, isolated stop-path slice).
 *
 * Exported `bootApp` + a guarded entry runner: a test boots it with no process-level side effect and tears
 * down cleanly; production reaches it by executing the module (the `start` script).
 */

/** The required secret env vars whose VALUES feed the persistence-boundary redaction scrub (rule #4). */
const REQUIRED_SECRET_ENV = ['OPENROUTER_API_KEY', 'OPENAI_API_KEY', 'DATABASE_URL'] as const;

export interface BootOverrides {
  /** Env record (default `process.env`); injected so the test drives fail-fast + caps without a real env. */
  readonly env?: Record<string, string | undefined>;
  /**
   * Direct gateway injection (default `selectGateway(env)`); the test injects a deterministic recorded
   * multi-role fake (no live SDK, rule #7) — `createFakeGateway`'s per-role fixtures satisfy the discipline
   * but do not shape a CandidateIdea, so they cannot drive the generation loop.
   */
  readonly gateway?: ModelGateway;
  /** Listen host (default `env.HOST ?? '0.0.0.0'`). */
  readonly host?: string;
  /** Listen port (default `env.PORT ?? 3000`); the test injects 0 for an ephemeral port. */
  readonly port?: number;
  /** Test determinism hook threaded into `createStartRun` (resolves when the fire-and-forget run settles). */
  readonly onSettled?: (runId: string) => void;
  /** Optional worker-error logging hook threaded into `createStartRun` (the failure is authoritative in the log). */
  readonly onError?: (runId: string, err: unknown) => void;
}

export interface BootedApp {
  readonly app: FastifyInstance;
  /** Tear down the listening server + the pg pool (no open-handle leak). */
  readonly close: () => Promise<void>;
}

/** Map the boot env to a `GatewaySelection`. Default `recorded` (local-first is the demo of record, §17);
 *  `live` selects the real provider path (currently unwired in `selectGateway` — P2.5 deferred → throws). */
function gatewaySelectionFromEnv(env: Record<string, string | undefined>): GatewaySelection {
  const mode = (env.DOPPL_GATEWAY ?? 'recorded').trim().toLowerCase();
  return mode === 'live' ? { useStub: false } : { useStub: true };
}

/** The present secret values (provider keys + DB URL) that must never appear in a persisted payload (rule #4).
 *  Length-gating is deferred to the scrub (`MIN_SECRET_LENGTH`) — this collects every present secret value. */
function collectSecretValues(env: Record<string, string | undefined>): string[] {
  return REQUIRED_SECRET_ENV.map((key) => env[key]).filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );
}

/** Resolve the listen port from env (default 3000), fail-fast on a malformed value (§15) — names the var,
 *  never silently binds an unintended port (a non-integer `Number()`-coerces to NaN → an ephemeral bind). */
function parsePort(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return 3000;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error('Invalid PORT env var — must be an integer in [0, 65535]');
  }
  return port;
}

export async function bootApp(overrides: BootOverrides = {}): Promise<BootedApp> {
  const env = overrides.env ?? process.env;

  // 1. loadConfig — fail-fast env validation (assertProviderCredentials) + Zod config validation. PURE; it
  //    throws BEFORE any migration/connection below, so a missing/invalid env starts no server.
  const config = loadConfig({ env, fileSources: {} });
  const databaseUrl = env.DATABASE_URL as string; // present — assertProviderCredentials passed inside loadConfig.
  // Resolve the listen address up-front so a malformed PORT fails fast BEFORE any migration/IO (§15).
  const host = overrides.host ?? env.HOST ?? '0.0.0.0';
  const port = overrides.port ?? parsePort(env.PORT);

  // 2. Migrate FIRST (idempotent). The PD.2 seed-demo step slots in right here later without reshaping boot.
  await runMigrations(databaseUrl);

  // 3. Real infra over ONE pg pool. The same drizzle handle backs the event store, the GET /runs reader, and
  //    the SINGLE `listRunIds(db)` source wired into BOTH crashForward + the worker (no divergent enumeration).
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);
  const eventStore = createEventStore({ db, secretValues: collectSecretValues(env) });
  const gateway = overrides.gateway ?? selectGateway(gatewaySelectionFromEnv(env));
  const listRunIdsBound = (): Promise<readonly string[]> => listRunIds(db);
  const newId = (): string => randomUUID();

  // 4. crash-forward AWAITED before the server can accept work (§5 / P3.13): orphaned non-terminal runs are
  //    forward-failed to their §3-legal terminal so the single-active-run guard starts from a clean slate.
  await crashForward({ eventStore, listRunIds: listRunIdsBound });

  // 5. The §11 fire-and-forget run trigger — the only `onRunConfigured` (createStartRun composes the worker).
  const infra: StartRunInfra = {
    config,
    modelGateway: gateway,
    eventStore,
    checkRegistry: CHECK_RUNNER_REGISTRY,
    listRunIds: listRunIdsBound,
    newId,
    ...(overrides.onError !== undefined ? { onError: overrides.onError } : {}),
    ...(overrides.onSettled !== undefined ? { onSettled: overrides.onSettled } : {}),
  };

  // The route cap-maxima == the boot ceiling (`config.caps` — what the worker clamps to, rule #1), so a
  // recorded run.configured cannot execute above-ceiling (recorded == executed cannot drift via a
  // runConfig.caps / config.caps divergence). Closes selection P5 carry-forward (a) route-max residual.
  const defaultConfig: RunConfig = { ...config.runConfig, caps: config.caps };

  const app = buildServer({
    store: eventStore,
    db,
    defaultConfig,
    newId,
    onRunConfigured: createStartRun(infra),
  });

  await app.listen({ host, port });

  const close = async (): Promise<void> => {
    await app.close();
    await pool.end();
  };
  return { app, close };
}

/** True when this module is the process entry (so an import — e.g. a test — never auto-boots). ESM-safe. */
function isProcessEntry(): boolean {
  try {
    const entry = process.argv[1];
    return entry !== undefined && import.meta.url === pathToFileURL(entry).href;
  } catch {
    return false;
  }
}

if (isProcessEntry()) {
  bootApp()
    .then(({ app }) => {
      app.log.info('Doppl API booted (migrate → crash-forward → listening)');
    })
    .catch((err: unknown) => {
      // Fail-fast: surface the message (loadConfig errors name the var, never echo a value — rule #4) + exit.
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
}
