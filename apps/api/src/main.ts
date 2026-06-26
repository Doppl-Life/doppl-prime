import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { FastifyInstance } from 'fastify';
import type { ModelRouteOverride, RunConfig } from '@doppl/contracts';
import { loadConfig } from './runtime/config/loadConfig';
import { createEventStore, runMigrations } from './event-store';
import {
  createLiveGateway,
  createModelRegistry,
  createOpenAIEmbeddingClient,
  createOpenRouterClient,
  createOllamaClient,
  createRegistryOverlay,
  loadModelRegistry,
  selectGateway,
  type GatewaySelection,
  type ModelGateway,
  type OpenAIEmbeddingClient,
  type OpenRouterClient,
  type OllamaClient,
  type ToolExecutorDeps,
} from './model-gateway';
import { REQUIRED_CREDENTIAL_ENV } from './model-gateway/registry';
import { DEFAULT_MODEL_REGISTRY } from './config/model-registry.config';
import { MODEL_ROUTE_OVERRIDE_ALLOWLIST } from './config/model-route-allowlist.config';
import { CHECK_RUNNER_REGISTRY } from './check-runners/registry';
import { listRunIds } from './projections/run-list';
import { crashForward } from './runtime/recovery/crashForward';
import { createStartRun, type StartRunInfra } from './boot/startRun';
import { createToolExecutorSeams } from './boot/toolSeams';
import { createOperatorStopRegistry } from './boot/operatorStop';
import { seedDemo } from './event-store/scripts/seed-demo';
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
 * stay the seams' job). `POST /runs/:id/stop` SIGNALS the kernel kill-and-drain through the in-memory
 * `operatorStopRegistry` (PD.3): boot wires `request` → the route + `checker(runId)` → the worker, so the
 * worker (not the route) terminalizes `run.stopped` — the route appends nothing (rule #2).
 *
 * Exported `bootApp` + a guarded entry runner: a test boots it with no process-level side effect and tears
 * down cleanly; production reaches it by executing the module (the `start` script).
 */

/**
 * The boot-orchestration env vars this module reads (DISTINCT from the closed config-override
 * `ENV_ALLOWLIST` + the credential `REQUIRED_CREDENTIAL_ENV`): the gateway-mode + seed-fixture + listen
 * knobs consumed BELOW (`gatewaySelectionFromEnv`, the seed step, `parsePort`/host). Single source for the
 * PD.8b `.env.example` drift-guard — KEEP IN SYNC with the `env.<VAR>` reads in this file.
 */
export const BOOT_ORCHESTRATION_ENV = [
  'DOPPL_GATEWAY',
  'DOPPL_SEED_FIXTURE',
  'DOPPL_FIXTURE_DIR',
  'CORS_ALLOWED_ORIGINS',
  'HOST',
  'PORT',
] as const;

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
  /** PD.3-completion — restore this committed fixture (`<fixtureDir>/<runId>.json`) after migrations + before
   *  the server accepts work (the demo fallback). Default `env.DOPPL_SEED_FIXTURE`; absent → no seed step. */
  readonly seedFixtureRunId?: string;
  /** The fixtures dir the seed step reads (default `env.DOPPL_FIXTURE_DIR ?? the repo `fixtures/replay/`). */
  readonly fixtureDir?: string;
  /**
   * PD.9 — the OpenRouter provider client used ONLY on the `DOPPL_GATEWAY=live` branch (default
   * `createOpenRouterClient(env)`). Injected so the live boot branch is exercised WITHOUT a network call
   * (a fake `OpenRouterClient`). Ignored on the recorded default (no provider client is built — Q4 lazy).
   */
  readonly openRouterClient?: OpenRouterClient;
  /**
   * The direct-OpenAI EMBEDDING provider client used ONLY on the `DOPPL_GATEWAY=live` branch (default
   * `createOpenAIEmbeddingClient(env)`). Injected so the live boot branch is exercised WITHOUT a network
   * call (a fake `OpenAIEmbeddingClient`). Wired so the `embedding` role reaches the OpenAI adapter instead
   * of being misrouted to OpenRouter chat-completions (the novelty-degradation root cause). Ignored on the
   * recorded default (no provider client is built — Q4 lazy).
   */
  readonly embeddingClient?: OpenAIEmbeddingClient;
  /**
   * FB.1 — the KEYLESS ollama provider client used ONLY on the `DOPPL_GATEWAY=live` branch (default
   * `createOllamaClient(env)` — reads `OLLAMA_BASE_URL`, no key). Injected so the live boot branch is
   * exercised WITHOUT a network call (a fake `OllamaClient`). Ignored on the recorded default (lazy).
   */
  readonly ollamaClient?: OllamaClient;
}

/** The committed fixtures dir at the repo root (`fixtures/replay/`), resolved from this module's location. */
const DEFAULT_FIXTURE_DIR = fileURLToPath(new URL('../../../fixtures/replay', import.meta.url));

export interface BootedApp {
  readonly app: FastifyInstance;
  /** Tear down the listening server + the pg pool (no open-handle leak). */
  readonly close: () => Promise<void>;
}

/** Map the boot env to a `GatewaySelection`. Default `recorded` (local-first is the demo of record, §17);
 *  `live` selects the real OpenRouter-backed provider path (PD.9 — wired below in `resolveGateway`). */
function gatewaySelectionFromEnv(env: Record<string, string | undefined>): GatewaySelection {
  const mode = (env.DOPPL_GATEWAY ?? 'recorded').trim().toLowerCase();
  return mode === 'live' ? { useStub: false } : { useStub: true };
}

/**
 * Resolve the boot ModelGateway (PD.9) + the FB.2 per-run override factory. A direct `overrides.gateway`
 * wins (the run-executing tests inject a recorded multi-role fake; no override factory). Otherwise: the
 * recorded default builds NO provider client/registry (local-first stays dependency-light — Q4 lazy; no
 * override factory → the recorded/replay path calls no provider, rule #7); `DOPPL_GATEWAY=live` builds the
 * live deps (registry from DEFAULT_MODEL_REGISTRY + the OpenRouter chat client + the direct-OpenAI embedding
 * client + the keyless ollama client) and returns BOTH the boot gateway AND a `gatewayForOverride` factory
 * that builds a per-run gateway from a registry OVERLAY re-clamped to the frozen allowlist (FB.1 dispatch
 * then routes the overridden provider). `createLiveGateway` dispatches the `embedding` role to the OpenAI
 * adapter (so novelty gets real embeddings instead of always degrading — the d287675 fix, preserved on
 * BOTH the boot gateway and the override factory). All keys stay env-only inside their clients (rule #4);
 * the present ones are guaranteed by `assertProviderCredentials` failing fast at boot.
 */
function resolveGateway(
  env: Record<string, string | undefined>,
  overrides: BootOverrides,
): {
  gateway: ModelGateway;
  gatewayForOverride?: (override: ModelRouteOverride) => ModelGateway;
  toolExecutorSeams?: ToolExecutorDeps;
} {
  if (overrides.gateway !== undefined) return { gateway: overrides.gateway };
  const selection = gatewaySelectionFromEnv(env);
  if (selection.useStub) return { gateway: selectGateway(selection) }; // recorded — no provider client
  const registry = createModelRegistry(loadModelRegistry({ defaults: DEFAULT_MODEL_REGISTRY }));
  const client = overrides.openRouterClient ?? createOpenRouterClient(env);
  const embeddingClient = overrides.embeddingClient ?? createOpenAIEmbeddingClient(env);
  // FB.1 — the keyless ollama client is always constructed on the live branch (no key, cheap) so an
  // ollama-routed role (per-run modelRouteOverride, FB.2) is servable; provider-dispatch in
  // createLiveGateway selects it by route.provider. OpenRouter remains the default for the demo routes.
  const ollamaClient = overrides.ollamaClient ?? createOllamaClient(env);
  const gateway = selectGateway(selection, { registry, client, embeddingClient, ollamaClient });
  // FB.2 — the per-run override factory: a registry OVERLAY re-clamped to the frozen allowlist (rule #1
  // kernel-bound), fed into a fresh live gateway → FB.1 dispatch routes the overridden provider. Built
  // from the SAME registry + clients — INCLUDING the embedding client, so an override run keeps the
  // embedding-role fix (d287675); replay reconstructs the overlay deterministically (rule #7).
  const gatewayForOverride = (override: ModelRouteOverride): ModelGateway =>
    createLiveGateway({
      registry: createRegistryOverlay(registry, override, MODEL_ROUTE_OVERRIDE_ALLOWLIST),
      client,
      embeddingClient,
      ollamaClient,
    });
  // TU.5 — the live tool-execution seams (agents do their own research). The OpenRouter key is env-only
  // (rule #4 — closed over the webSearch seam); fetch + dns are the real primitives. Present ONLY on the
  // live branch → composeRuntime wires the tool-orchestrating gateway (the recorded/replay path gets none,
  // so replay reads persisted tool results, never re-executes — rule #7).
  const toolExecutorSeams = createToolExecutorSeams({
    ...(env.OPENROUTER_API_KEY !== undefined ? { openRouterApiKey: env.OPENROUTER_API_KEY } : {}),
    ...(env.DOPPL_WEB_SEARCH_MODEL !== undefined
      ? { webSearchModel: env.DOPPL_WEB_SEARCH_MODEL }
      : {}),
    ...(env.DOPPL_X_SEARCH_MODEL !== undefined ? { xSearchModel: env.DOPPL_X_SEARCH_MODEL } : {}),
    ...(env.DOPPL_YOUTUBE_MODEL !== undefined ? { youtubeModel: env.DOPPL_YOUTUBE_MODEL } : {}),
  });
  return { gateway, gatewayForOverride, toolExecutorSeams };
}

/** The present secret values (provider keys + DB URL) that must never appear in a persisted payload (rule #4).
 *  Length-gating is deferred to the scrub (`MIN_SECRET_LENGTH`) — this collects every present secret value. */
function collectSecretValues(env: Record<string, string | undefined>): string[] {
  return REQUIRED_CREDENTIAL_ENV.map((key) => env[key]).filter(
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

function parseAllowedOrigins(raw: string | undefined): readonly string[] {
  if (raw === undefined) return [];
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
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
  //    Everything after the pool is wrapped so a boot ABORT (seed / crashForward / listen failure) ends the
  //    pool instead of leaking it (no half-initialized boot serves; no dangling pg connection).
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    const db = drizzle(pool);
    const eventStore = createEventStore({ db, secretValues: collectSecretValues(env) });
    const { gateway, gatewayForOverride, toolExecutorSeams } = resolveGateway(env, overrides);
    const listRunIdsBound = (): Promise<readonly string[]> => listRunIds(db);
    const newId = (): string => randomUUID();

    // 3.5 Conditional seed step (§17 migrate → SEED → start): restore a committed replay fixture when
    //     DOPPL_SEED_FIXTURE=<runId> is set (the demo fallback source). AFTER the db handle exists + BEFORE
    //     crashForward — the seeded run is TERMINAL, so crashForward leaves it untouched. A missing/invalid/
    //     malformed fixture THROWS → bootApp rejects (pool ended below) → the API never serves a half-seeded
    //     demo. Absent → no-op (a normal live boot seeds nothing).
    const seedFixtureRunId = overrides.seedFixtureRunId ?? env.DOPPL_SEED_FIXTURE;
    if (seedFixtureRunId !== undefined && seedFixtureRunId.trim() !== '') {
      const fixtureDir = overrides.fixtureDir ?? env.DOPPL_FIXTURE_DIR ?? DEFAULT_FIXTURE_DIR;
      await seedDemo({ db, dir: fixtureDir, runId: seedFixtureRunId });
    }

    // 4. crash-forward AWAITED before the server can accept work (§5 / P3.13): orphaned non-terminal runs are
    //    forward-failed to their §3-legal terminal so the single-active-run guard starts from a clean slate.
    await crashForward({ eventStore, listRunIds: listRunIdsBound });

    // 5. The operator-stop channel (PD.3): the route latches via `request`; the worker polls via `checker`.
    const operatorStop = createOperatorStopRegistry();

    // 6. The §11 fire-and-forget run trigger — the only `onRunConfigured` (createStartRun composes the worker).
    const infra: StartRunInfra = {
      config,
      modelGateway: gateway,
      // FB.2 — the per-run override factory (live boot only); absent on the recorded/replay path.
      ...(gatewayForOverride !== undefined ? { gatewayForOverride } : {}),
      // TU.5 — the live tool seams (live boot only); absent on the recorded/replay path (rule #7).
      ...(toolExecutorSeams !== undefined ? { toolExecutorSeams } : {}),
      eventStore,
      checkRegistry: CHECK_RUNNER_REGISTRY,
      listRunIds: listRunIdsBound,
      newId,
      // The worker polls this latch at each generation boundary → drain-then-terminalize run.stopped (§5).
      operatorStopFor: operatorStop.checker,
      // onSettled ALWAYS drops the run's stop latch (bounds the registry), then forwards the optional test hook.
      onSettled: (runId: string): void => {
        operatorStop.clear(runId);
        overrides.onSettled?.(runId);
      },
      ...(overrides.onError !== undefined ? { onError: overrides.onError } : {}),
    };

    // The route cap-maxima == the boot ceiling (`config.caps` — what the worker clamps to, rule #1), so a
    // recorded run.configured cannot execute above-ceiling (recorded == executed cannot drift via a
    // runConfig.caps / config.caps divergence). Closes selection P5 carry-forward (a) route-max residual.
    const defaultConfig: RunConfig = { ...config.runConfig, caps: config.caps };

    const app = buildServer({
      store: eventStore,
      db,
      defaultConfig,
      // FB.2 — the frozen per-role override allowlist the POST /runs 422 check clamps to (rule #1/#6).
      modelRouteOverrideAllowlist: MODEL_ROUTE_OVERRIDE_ALLOWLIST,
      newId,
      onRunConfigured: createStartRun(infra),
      requestStop: operatorStop.request,
      // PD.5a — expose the boot prepared-problem catalog at GET /problem-sets (read-only; PD.5b reads it).
      problemSets: config.problemSets,
      corsAllowedOrigins: parseAllowedOrigins(env.CORS_ALLOWED_ORIGINS),
    });

    await app.listen({ host, port });

    // PD.19 — a clear startup line so `pnpm start` isn't silent (the Fastify logger is disabled →
    // `app.log` is a no-op). console.log is a process-stdout signal, NOT a run_event (rule #2); it
    // carries host:port only (no secret — rule #4). boundPort handles PORT-from-env AND the ephemeral
    // port 0 (tests) via the actual bound address.
    const boundAddr = app.server.address();
    const boundPort = typeof boundAddr === 'object' && boundAddr !== null ? boundAddr.port : port;
    const displayHost = host === '0.0.0.0' ? 'localhost' : host;
    console.log(`Doppl API listening on http://${displayHost}:${boundPort}`);

    const close = async (): Promise<void> => {
      await app.close();
      await pool.end();
    };
    return { app, close };
  } catch (err) {
    // A boot abort (seed / crashForward / listen failure) must NOT leak the pg pool — end it, then rethrow so
    // the guarded runner surfaces the error + exits (no server serves a half-initialized boot).
    await pool.end();
    throw err;
  }
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
