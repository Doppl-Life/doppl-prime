import { describe, expect, test } from 'vitest';
import { validRun } from '@doppl/contracts';
import { createRunClient, PayloadValidationError, TransportError } from '../../../src/data/runClient';

/**
 * PD.5b — the runClient demo methods: getProblemSets (validates GET /problem-sets against the web-local
 * ProblemSet mirror) + startDemoRun (POSTs a PARTIAL {seed} to /runs; the api deep-merges defaults). Same
 * injected-transport / validate-at-boundary discipline as the rest of runClient (apps/web L§1).
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
const CATALOG = [
  { id: 'demo-1', title: 'Cross-domain transfer demo', prompt: 'Find a cross-domain transfer.' },
];

describe('runClient demo methods (PD.5b — GET /problem-sets + partial-{seed} POST /runs)', () => {
  // L§1 — getProblemSets validates the {problemSets:[...]} envelope against the web-local ProblemSet mirror
  // and returns the array; an invalid payload → PayloadValidationError; non-2xx → TransportError.
  test('get_problem_sets_validates_payload', async () => {
    const fetch = fakeFetch({ problemSets: CATALOG });
    const client = createRunClient({ baseUrl: BASE, fetch });
    expect(await client.getProblemSets()).toEqual(CATALOG);
    expect(fetch.calls[0]?.url).toBe(`${BASE}/problem-sets`);

    // a catalog entry missing required fields (title/prompt) → typed validation error.
    const badClient = createRunClient({
      baseUrl: BASE,
      fetch: fakeFetch({ problemSets: [{ id: 'x' }] }),
    });
    await expect(badClient.getProblemSets()).rejects.toBeInstanceOf(PayloadValidationError);

    // a non-2xx response → transport error (never parsed as a catalog).
    const errClient = createRunClient({ baseUrl: BASE, fetch: fakeFetch({ problemSets: CATALOG }, 500) });
    await expect(errClient.getProblemSets()).rejects.toBeInstanceOf(TransportError);
  });

  // §17 — startDemoRun POSTs the PARTIAL body {seed} to /runs (the api deep-merges defaults; the panel
  // never sends caps), forwards the Idempotency-Key, and returns the validated Run.
  test('start_demo_run_posts_partial_seed', async () => {
    const fetch = fakeFetch(validRun);
    const client = createRunClient({ baseUrl: BASE, fetch });
    const run = await client.startDemoRun({ seed: 'Design X' }, { idempotencyKey: 'idem-9' });
    expect(run).toEqual(validRun);
    expect(fetch.calls[0]?.url).toBe(`${BASE}/runs`);
    expect(fetch.calls[0]?.init?.method).toBe('POST');
    expect(JSON.parse(fetch.calls[0]?.init?.body ?? '{}')).toEqual({ seed: 'Design X' }); // partial — only seed
    expect(fetch.calls[0]?.init?.headers?.['Idempotency-Key']).toBe('idem-9');
  });
});
