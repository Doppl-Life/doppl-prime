import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  validCandidateIdeaCrossDomain,
  validModelRoute,
  validRun,
  validRunConfig,
} from '@doppl/contracts';
import type { LineageGraphProjection } from '@doppl/contracts';
import {
  createRunClient,
  PayloadValidationError,
  TransportError,
} from '../../../src/data/runClient';
import { multiNodeLineage, malformedLineage } from '../../fixtures/lineage';

/**
 * A recording fake `fetch` (the injected transport double). Returns the queued body for the next
 * call and records the (url, init) it was invoked with — no network, fully deterministic.
 */
function fakeFetch(body: unknown, status = 200) {
  const calls: {
    url: string;
    init: { method?: string; body?: string; headers?: Record<string, string> } | undefined;
  }[] = [];
  const fn = (
    url: string,
    init?: { method?: string; body?: string; headers?: Record<string, string> },
  ) => {
    calls.push({ url, init });
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    });
  };
  return Object.assign(fn, { calls });
}

const BASE = 'http://localhost:3000';
const DATA_DIR = fileURLToPath(new URL('../../../src/data', import.meta.url));

describe('runClient — read-only REST seam', () => {
  // spec(§12): every projection read is parsed through its Zod schema before it reaches view state.
  it('test_parses_valid_projection_through_zod', async () => {
    const fetch = fakeFetch(multiNodeLineage);
    const client = createRunClient({ baseUrl: BASE, fetch });
    const lineage: LineageGraphProjection = await client.getLineage('run_1');
    expect(lineage).toEqual(multiNodeLineage);
    expect(fetch.calls[0]?.url).toBe(`${BASE}/runs/run_1/lineage`);
  });

  // spec(§12)/rule #9: an unvalidated/malformed server payload surfaces as a TYPED error, never a
  // raw throw or corrupt view state.
  it('test_invalid_payload_surfaces_typed_error', async () => {
    const fetch = fakeFetch(malformedLineage);
    const client = createRunClient({ baseUrl: BASE, fetch });
    await expect(client.getLineage('run_1')).rejects.toBeInstanceOf(PayloadValidationError);
    await expect(client.getLineage('run_1')).rejects.toMatchObject({
      kind: 'payload_validation_error',
      endpoint: expect.stringContaining('/lineage'),
    });
  });

  // spec(§11): the client surface offers ONLY the contract endpoints + the two idempotent commands —
  // no arbitrary URL/method is representable (no generic request/get escape hatch). 7 GET + 2 POST;
  // GET /runs/:id/health is DEFERRED to P7.14 (no frozen contract for the health signal yet).
  it('test_client_exposes_only_contract_endpoints', () => {
    const client = createRunClient({ baseUrl: BASE, fetch: fakeFetch(null) });
    expect(Object.keys(client).sort()).toEqual(
      [
        'getCandidate',
        'getEvents',
        'getFallbackLadder',
        'getLineage',
        'getProblemSets',
        'getReplay',
        'getRun',
        'getRunHealth',
        'listModelRoutes',
        'listRuns',
        'startDemoRun',
        'startRun',
        'stopRun',
      ].sort(),
    );
  });

  // spec(§11): the two mutating commands hit the correct method+path and validate the Run response;
  // repeated stop is client-side safe (idempotency is the API's terminal-state guard, not re-implemented).
  it('test_commands_post_and_validate_run', async () => {
    const startFetch = fakeFetch(validRun);
    const client = createRunClient({ baseUrl: BASE, fetch: startFetch });
    const started = await client.startRun({
      seed: 'scenario-alpha',
      enabledSubtypes: ['cross_domain_transfer', 'zeitgeist_synthesis'],
      caps: validRun.caps,
      modelProfile: 'mvp-openrouter',
      scoringPolicyVersion: 'scoring-v1',
      rngSeed: 42,
    });
    expect(started).toEqual(validRun);
    expect(startFetch.calls[0]?.url).toBe(`${BASE}/runs`);
    expect(startFetch.calls[0]?.init?.method).toBe('POST');

    const stopFetch = fakeFetch(validRun);
    const c2 = createRunClient({ baseUrl: BASE, fetch: stopFetch });
    await c2.stopRun('run_1');
    await c2.stopRun('run_1');
    expect(stopFetch.calls).toHaveLength(2);
    expect(stopFetch.calls[0]?.url).toBe(`${BASE}/runs/run_1/stop`);
    expect(stopFetch.calls[0]?.init?.method).toBe('POST');
  });

  // spec(§11): startRun forwards an idempotency key as an Idempotency-Key header so the API can dedup
  // a duplicate submit (the client never re-implements the dedup).
  it('test_start_run_sends_idempotency_key', async () => {
    const fetch = fakeFetch(validRun);
    const client = createRunClient({ baseUrl: BASE, fetch });
    await client.startRun(validRunConfig, { idempotencyKey: 'idem-123' });
    expect(fetch.calls[0]?.init?.headers?.['Idempotency-Key']).toBe('idem-123');
  });

  // spec(§14 carry-forward: IDs are opaque/untrusted bytes — never concatenated raw into a path).
  it('test_encodes_opaque_id_path_segments', async () => {
    const fetch = fakeFetch(validCandidateIdeaCrossDomain);
    const client = createRunClient({ baseUrl: BASE, fetch });
    await client.getCandidate('a/b?c', 'x/y');
    expect(fetch.calls[0]?.url).toBe(`${BASE}/runs/a%2Fb%3Fc/candidates/x%2Fy`);
  });

  // spec(rule #9)/forbidden #6: the data layer imports NOTHING from apps/api.
  it('test_no_apps_api_import', () => {
    const files = readdirSync(DATA_DIR).filter((f) => f.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const src = readFileSync(`${DATA_DIR}/${f}`, 'utf8');
      expect(src).not.toMatch(/from\s+['"][^'"]*apps\/api/);
      expect(src).not.toMatch(/@doppl\/api/);
    }
  });

  // spec(rule #4)/forbidden #5: no provider key / secret is fetched or referenced in the client.
  it('test_no_provider_secret_in_client_source', () => {
    const files = readdirSync(DATA_DIR).filter((f) => f.endsWith('.ts'));
    for (const f of files) {
      const src = readFileSync(`${DATA_DIR}/${f}`, 'utf8');
      expect(src).not.toMatch(/process\.env/);
      expect(src).not.toMatch(/Authorization/i);
      expect(src).not.toMatch(/api[_-]?key/i);
    }
  });

  // spec(§12): list endpoints validate each element (array schema) — a model-routes read is typed.
  it('test_list_model_routes_validates_array', async () => {
    const fetch = fakeFetch([validModelRoute]);
    const client = createRunClient({ baseUrl: BASE, fetch });
    const routes = await client.listModelRoutes();
    expect(routes).toEqual([validModelRoute]);
    expect(fetch.calls[0]?.url).toBe(`${BASE}/model-routes`);
  });

  // spec(§11): a non-2xx response is a distinct TYPED transport error — never parsed as a projection,
  // so a transport/auth failure is not mislabeled as a payload-validation failure.
  it('test_non_ok_response_surfaces_typed_transport_error', async () => {
    const fetch = fakeFetch({ error: 'boom' }, 500);
    const client = createRunClient({ baseUrl: BASE, fetch });
    await expect(client.getLineage('run_1')).rejects.toBeInstanceOf(TransportError);
    await expect(client.getLineage('run_1')).rejects.toMatchObject({
      kind: 'transport_error',
      status: 500,
    });
  });

  // spec(§11): the false-accept guard — a non-2xx body that happens to satisfy the schema (e.g. a 404
  // returning []) must surface as a transport error, NOT be accepted as a valid empty projection.
  it('test_non_ok_empty_array_not_accepted_as_projection', async () => {
    const fetch = fakeFetch({ runs: [] }, 404);
    const client = createRunClient({ baseUrl: BASE, fetch });
    await expect(client.listRuns()).rejects.toBeInstanceOf(TransportError);
  });

  // ---- PD.15: the client consumes the REAL API response-shapes (the PD.14 Finding fix, option C) ----

  // spec(§11): GET /runs returns `{ runs: [summary] }` (not a bare Run[]) — the client unwraps it; a
  // summary's `status` may be null (a run with no current-state status), a WEB-local shape (not frozen).
  it('runclient_listRuns_consumes_runs_wrapper', async () => {
    const fetch = fakeFetch({
      runs: [
        { runId: 'run_1', status: 'completed', sequenceThrough: 12 },
        { runId: 'run_2', status: null, sequenceThrough: 0 },
      ],
    });
    const client = createRunClient({ baseUrl: BASE, fetch });
    const runs = await client.listRuns();
    expect(runs.map((r) => r.runId)).toEqual(['run_1', 'run_2']);
    expect(runs[1]?.status).toBeNull();
    expect(fetch.calls[0]?.url).toBe(`${BASE}/runs`);
  });

  // spec(§11/§12): GET /runs/:id returns the current-state wrapper `{ runId, sequenceThrough, state }`.
  it('runclient_getRun_consumes_current_state_wrapper', async () => {
    const body = { runId: 'run_1', sequenceThrough: 5, state: { runs: {}, candidateIdeas: {} } };
    const fetch = fakeFetch(body);
    const client = createRunClient({ baseUrl: BASE, fetch });
    const run = await client.getRun('run_1');
    expect(run.runId).toBe('run_1');
    expect(run.sequenceThrough).toBe(5);
    expect(fetch.calls[0]?.url).toBe(`${BASE}/runs/run_1`);
  });

  // spec(§11/§4): GET /runs/:id/events returns `{ runId, events: [...] }` — the client unwraps `.events`
  // (null-free envelopes, post the API omit-null serializer) AND sends the canonical `?since=` cursor.
  it('runclient_getEvents_unwraps_events_and_sends_since', async () => {
    const env = {
      id: 'ev1',
      runId: 'run_1',
      type: 'run.configured',
      sequence: 0,
      occurredAt: '2026-06-20T12:00:00.000Z',
      actor: 'operator',
      payload: {},
      schemaVersion: 5,
    };
    const fetch = fakeFetch({ runId: 'run_1', events: [env] });
    const client = createRunClient({ baseUrl: BASE, fetch });
    const events = await client.getEvents('run_1', { sinceSequence: 3 });
    expect(events).toHaveLength(1);
    expect(events[0]?.id).toBe('ev1');
    expect(fetch.calls[0]?.url).toBe(`${BASE}/runs/run_1/events?since=3`);
  });

  it('runclient_getEvents_no_cursor_omits_param', async () => {
    const fetch = fakeFetch({ runId: 'run_1', events: [] });
    const client = createRunClient({ baseUrl: BASE, fetch });
    await client.getEvents('run_1');
    expect(fetch.calls[0]?.url).toBe(`${BASE}/runs/run_1/events`);
  });

  // spec(§11): GET /runs/:id/replay returns the replay-summary object `{ runId, sequenceThrough, state }`
  // (not a bare envelope[]) — the client consumes the summary shape (the replay view is not yet wired).
  it('runclient_getReplay_consumes_summary_shape', async () => {
    const body = { runId: 'run_1', sequenceThrough: 9, state: { runs: {}, candidateIdeas: {} } };
    const fetch = fakeFetch(body);
    const client = createRunClient({ baseUrl: BASE, fetch });
    const replay = await client.getReplay('run_1');
    expect(replay.runId).toBe('run_1');
    expect(replay.sequenceThrough).toBe(9);
    expect(fetch.calls[0]?.url).toBe(`${BASE}/runs/run_1/replay`);
  });
});
