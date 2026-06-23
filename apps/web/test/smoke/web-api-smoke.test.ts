import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer as netCreateServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { createServer, type ViteDevServer } from 'vite';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { LineageGraphProjection, RunEventEnvelope } from '@doppl/contracts';
import { createRunClient } from '../../src/data/runClient';

/**
 * PD.14 + PD.15 — the REAL web→proxy→API smoke (ARCHITECTURE.md §11/§12/§17, the lead/user Finding). The thing
 * the Playwright e2e always MOCKED — so a wrong origin / wrong `/api` prefix silently 404'd in the real
 * app. This boots the REAL stack creds-free (testcontainer PG + the seeded API as a CHILD PROCESS — no
 * `apps/api` import, rule #6 — + Vite programmatically with the dev proxy) and fetches the dashboard's
 * data THROUGH the proxy: the seeded run lists, the lineage carries the real `status:'selected'` winner,
 * and the SSE stream delivers incrementally (unbuffered). NOT a mock — real API responses.
 *
 * Gated opt-in (`DOPPL_WEB_API_SMOKE=1`, set by `pnpm test:smoke:web-api`) so the fast unit gate +
 * keyless CI stay green without Docker (mirrors apps/api's live/integration opt-in, LESSONS §25/§94).
 * Creds-free: placeholder provider keys keep §15 boot fail-fast intact; the recorded gateway + the
 * terminal seeded run never call a provider (rule #7).
 */

const SMOKE_ENABLED = process.env.DOPPL_WEB_API_SMOKE === '1';

// The committed demo-of-record fixture (PD.8a) — a terminal run with a selected winner.
const RUN_ID = 'demo-recorded-001';

const WEB_DIR = fileURLToPath(new URL('../../', import.meta.url));
const API_DIR = fileURLToPath(new URL('../../../api', import.meta.url));
const FIXTURE_DIR = fileURLToPath(new URL('../../../../fixtures/replay', import.meta.url));
const VITE_CONFIG = fileURLToPath(new URL('../../vite.config.ts', import.meta.url));

/** Grab an ephemeral free port on loopback (avoids a hardcoded :3000 collision for the spawned API/Vite). */
async function getFreePort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const srv = netCreateServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr !== null ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

/** Creds-free seeded-recorded boot env for the spawned API (mirrors apps/api demo-e2e `smokeEnv`). */
function apiEnv(databaseUrl: string, port: number): Record<string, string | undefined> {
  return {
    ...process.env,
    OPENROUTER_API_KEY: 'or-placeholder-not-used',
    OPENAI_API_KEY: 'oai-placeholder-not-used',
    DATABASE_URL: databaseUrl,
    DOPPL_GATEWAY: 'recorded',
    DOPPL_SEED_FIXTURE: RUN_ID,
    DOPPL_FIXTURE_DIR: FIXTURE_DIR,
    HOST: '127.0.0.1',
    PORT: String(port),
  };
}

/** Poll the spawned API's root route until it answers 2xx (boot = migrate → seed → crashForward → listen). */
async function waitForApi(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/runs`);
      if (res.ok) return;
    } catch {
      // ECONNREFUSED while the API is still booting — retry until the deadline.
    }
    if (Date.now() > deadline) throw new Error(`API did not become ready within ${timeoutMs}ms`);
    await new Promise((r) => setTimeout(r, 400));
  }
}

describe.skipIf(!SMOKE_ENABLED)('PD.14 real web→proxy→API smoke (§11/§12/§17)', () => {
  let container: StartedPostgreSqlContainer | undefined;
  let apiProc: ChildProcess | undefined;
  let vite: ViteDevServer | undefined;
  let vitePort = 0;
  let apiStderr = '';

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    const pgUri = container.getConnectionUri();
    const apiPort = await getFreePort();
    vitePort = await getFreePort();

    // Spawn the seeded API as a CHILD PROCESS (HTTP-only; no apps/api import → rule #6 clean). main.ts
    // boots loadConfig → migrate → seed(demo-recorded-001) → crashForward → listen.
    apiProc = spawn('pnpm', ['-C', API_DIR, 'start'], {
      env: apiEnv(pgUri, apiPort),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    apiProc.stderr?.on('data', (d: Buffer) => {
      apiStderr += String(d);
    });
    const earlyExit = new Promise<never>((_, reject) => {
      apiProc!.once('exit', (code) =>
        reject(new Error(`API process exited early (code ${code}).\nstderr:\n${apiStderr}`)),
      );
    });
    await Promise.race([waitForApi(apiPort, 120_000), earlyExit]);
    apiProc.removeAllListeners('exit'); // ready — drop the early-exit guard so afterAll can kill cleanly.

    // Start Vite programmatically with the dev proxy pointed at the spawned API's ephemeral port.
    process.env.VITE_API_PROXY_TARGET = `http://127.0.0.1:${apiPort}`;
    vite = await createServer({
      configFile: VITE_CONFIG,
      root: WEB_DIR,
      logLevel: 'warn',
      server: { port: vitePort, strictPort: true, host: '127.0.0.1' },
    });
    await vite.listen();
  }, 180_000);

  afterAll(async () => {
    delete process.env.VITE_API_PROXY_TARGET;
    await vite?.close();
    if (apiProc && apiProc.exitCode === null) {
      apiProc.kill('SIGTERM');
    }
    await container?.stop();
  });

  // spec(§11/§12) — a REST read through the proxy reaches the real API: `/api/runs` (prefix-stripped to
  // `/runs`, origin-redirected) returns the seeded run from real data, and `/api/runs/:id/lineage`
  // carries the real `status:'selected'` winner node (PD.11 bridge) — the demo HEADLINE (lineage +
  // surviving idea) renders from real responses through the proxy.
  //
  // NOTE: we assert the ACTUAL API shapes here. `/runs` returns `{ runs: [{runId,…}] }`. The lineage/
  // candidate render path uses the frozen projections (built in-memory, no null-row drift) and parses
  // cleanly — so the headline works. The reconciled web data-client consumption is the next test.
  test('dashboard_loads_seeded_run_through_real_api', async () => {
    const runsRes = await fetch(`http://127.0.0.1:${vitePort}/api/runs`);
    expect(runsRes.status).toBe(200);
    const runsBody = (await runsRes.json()) as { runs?: Array<{ runId: string }> };
    expect(runsBody.runs?.some((r) => r.runId === RUN_ID)).toBe(true);

    const lineageRes = await fetch(`http://127.0.0.1:${vitePort}/api/runs/${RUN_ID}/lineage`);
    expect(lineageRes.status).toBe(200);
    const lineage = LineageGraphProjection.parse(await lineageRes.json());
    expect(lineage.runId).toBe(RUN_ID);
    expect(lineage.nodes.some((n) => n.type === 'candidate' && n.status === 'selected')).toBe(true);
  });

  // PD.15 (§11/§12) — the REAL web data-client consumes the reconciled API shapes THROUGH the proxy with
  // NO PayloadValidationError: listRuns `{runs}`, getRun current-state wrapper, getEvents `{runId,events}`
  // (null-free envelopes via the omit-null serializer + the `?since=` cursor), getReplay summary. Uses the
  // actual `runClient` (global fetch) against the booted API — consumer↔producer agreement end-to-end.
  test('reconciled_rest_endpoints_through_proxy', async () => {
    const client = createRunClient({ baseUrl: `http://127.0.0.1:${vitePort}/api` });

    const runs = await client.listRuns();
    expect(runs.some((r) => r.runId === RUN_ID)).toBe(true);

    const run = await client.getRun(RUN_ID);
    expect(run.runId).toBe(RUN_ID);

    // getEvents returns frozen RunEventEnvelope[] — the client parses them, so a single null-bearing
    // envelope would throw here (proves the API omit-null fix end-to-end via the real consumer).
    const events = await client.getEvents(RUN_ID);
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => e.runId === RUN_ID)).toBe(true);

    const replay = await client.getReplay(RUN_ID);
    expect(replay.runId).toBe(RUN_ID);
  });

  // PD.16 (§11/§12/§17) — the operator START + STOP round-trip through the proxy against the real API:
  // the reconciled runClient consumes POST /runs → {runId} and POST /runs/:id/stop → the stop wrapper.
  // The recorded gateway can't drive a fresh run to completion, so we assert the WIRING (a real runId +
  // the stop wrapper echoing it), NOT a terminal status (avoids a worker race). startDemoRun is the
  // headline operator interaction (type a problem → Start); the seeded run is terminal so a new run starts.
  test('smoke_operator_start_stop_through_proxy', async () => {
    const client = createRunClient({ baseUrl: `http://127.0.0.1:${vitePort}/api` });

    const started = await client.startDemoRun({
      seed: 'PD.16 smoke probe — a hard, well-scoped problem',
    });
    expect(typeof started.runId).toBe('string');
    expect(started.runId.length).toBeGreaterThan(0);

    const stopped = await client.stopRun(started.runId);
    expect(stopped.runId).toBe(started.runId);
  });

  // spec(§11/§12 live window) — the SSE stream proxies UNBUFFERED: `/api/runs/:id/stream` delivers events
  // incrementally (≥2 separate `data:` frames while the stream stays open), not one buffered blob. (A
  // buffering proxy would deliver nothing until the upstream closes — which a terminal run never does —
  // so this would time out; receiving frames proves the proxy flushes.)
  test('sse_stream_proxies_unbuffered', async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await fetch(`http://127.0.0.1:${vitePort}/api/runs/${RUN_ID}/stream`, {
        headers: { accept: 'text/event-stream' },
        signal: controller.signal,
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/event-stream');

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      const frames: string[] = [];
      let buf = '';
      while (frames.length < 2) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const block = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const dataLine = block.split('\n').find((l) => l.startsWith('data:'));
          if (dataLine) frames.push(dataLine.slice('data:'.length).trim());
        }
      }
      controller.abort(); // stop reading the (idle-open) stream.

      expect(frames.length).toBeGreaterThanOrEqual(2); // incremental (unbuffered), not one blob
      // PD.15 (demo-critical, failing-then-green): every real frame now PARSES against the FROZEN
      // RunEventEnvelope. Pre-fix the DB-`null` optionals threw → the web's per-frame parse dropped every
      // live event (PD.14 had RELAXED this to a structural check precisely BECAUSE of the nulls). This is
      // the literal `live_sse_flows_null_bearing_events_web_from_api` assertion.
      for (const frame of frames) {
        const envelope = RunEventEnvelope.parse(JSON.parse(frame));
        expect(envelope.runId).toBe(RUN_ID);
      }
    } finally {
      clearTimeout(timer);
    }
  });
});
