import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { handleKernelHttpRequest } from '../../../src/kernel/server/server.ts';

// A committed test vault (a real flow node + real stock copied from agarden — inputs, not
// fabricated generation). The model output is the prompt-aware mock-fetch transport stub below:
// these tests verify HTTP plumbing — routing, auth, secret redaction, SSE, replay — not model
// intelligence. `/kernel/runs` is hermetic against the test vault; dashboard routes run the
// approved agarden case (the dashboard case registry pins agarden paths).
const TEST_VAULT = 'test/captured/fsd/vault';
const TEST_CASE_PATH = `${TEST_VAULT}/flow/fsd-ownership-unwind-0caef8e3/fsd-ownership-unwind-0caef8e3.md`;
const AGARDEN_FSD_CASE = '../agarden/flow/fsd-ownership-unwind-0caef8e3/fsd-ownership-unwind-0caef8e3.md';

// A prompt-aware model reply: returns valid JSON for whichever generation call the prompt is,
// so it is immune to how many calls the engine makes. Candidate ids are fixed so the fused
// child id is deterministic; the critic scores every candidate the prompt names.
function modelReply(prompt: string): string {
  if (prompt.includes('held-out judge')) {
    return JSON.stringify({
      axes: [
        { axis: 'Novelty', score: 3, reasoning: 'r' },
        { axis: 'Grounding', score: 3, reasoning: 'r' },
        { axis: 'Falsifiability', score: 2, reasoning: 'r' },
        { axis: 'Cost-efficiency', score: 2, reasoning: 'r' },
        { axis: 'Relevance', score: 3, reasoning: 'r' },
      ],
      temporal: false,
    });
  }
  if (prompt.includes('verdicts array')) {
    const named = prompt.match(/Candidates: ([^\n]+)/)?.[1] ?? 'cand_alpha';
    const ids = named.split(',').map((value) => value.trim()).filter(Boolean);
    return JSON.stringify({
      verdicts: ids.map((candidateId, index) => ({
        candidateId,
        criticId: 'grounding',
        score: 92 - index,
        pressure: 'p',
        revisionMandate: 'm',
      })),
    });
  }
  if (prompt.includes('candidates array')) {
    return JSON.stringify({
      candidates: [
        { id: 'cand_alpha', agenomeId: 'ag_blindside', title: 'Alpha', summary: 's', mechanism: 'm', claimedDelta: 'd', citedKnowledge: [] },
        { id: 'cand_beta', agenomeId: 'ag_first_principles', title: 'Beta', summary: 's', mechanism: 'm', claimedDelta: 'd', citedKnowledge: [] },
      ],
    });
  }
  return JSON.stringify({
    candidate: { id: 'cand_clean', agenomeId: 'ag_clean_control', title: 'Clean', summary: 's', mechanism: 'm', claimedDelta: 'd', citedKnowledge: [] },
  });
}

function mockOpenRouter() {
  const calls: Array<{ headers: Record<string, string>; body: Record<string, unknown> }> = [];
  return {
    calls,
    async fetch(_url: string, init: { headers: Record<string, string>; body: string }) {
      calls.push({ headers: init.headers, body: JSON.parse(init.body) as Record<string, unknown> });
      const content = modelReply(init.body);
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'test-request-id' },
        async json() {
          return { choices: [{ message: { content } }] };
        },
      };
    },
  };
}

test('kernel HTTP server reports health', async () => {
  const response = await handleKernelHttpRequest({ method: 'GET', url: '/health' });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { ok: true, service: 'doppl-kernel' });
});

test('kernel HTTP server serves a visible production page without secrets', async () => {
  const response = await handleKernelHttpRequest(
    { method: 'GET', url: '/' },
    { env: { KERNEL_API_KEY: 'dashboard-test-key' } },
  );
  assert.equal(response.status, 200);
  assert.equal(response.contentType, 'text/html; charset=utf-8');
  assert.match(response.bodyText, /Doppl React Flow dashboard/);
  assert.match(response.bodyText, /id="root"/);
  assert.doesNotMatch(response.bodyText, /dashboard-test-key/);
});

test('kernel dashboard source is built on React Flow', async () => {
  const app = await readFile('web/src/App.tsx', 'utf8');
  const shell = await readFile('web/src/layout/DashboardShell.tsx', 'utf8');
  const lineage = await readFile('web/src/lineage/LineageGraph.tsx', 'utf8');
  assert.match(app, /DashboardShell/);
  assert.match(shell, /FinalIdeaPanel/);
  assert.match(lineage, /@xyflow\/react/);
  assert.match(lineage, /<ReactFlow/);
  assert.doesNotMatch(app + shell + lineage, /sk-or-v1/);
});

test('kernel HTTP server rejects missing dashboard assets', async () => {
  const response = await handleKernelHttpRequest({ method: 'GET', url: '/dashboard/assets/missing.js' });
  assert.equal(response.status, 404);
});

test('kernel HTTP server rejects runs without a generation provider', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'doppl-http-no-provider-'));
  const response = await handleKernelHttpRequest({
    method: 'POST',
    url: '/kernel/runs',
    body: JSON.stringify({
      runId: 'run_http_no_provider',
      casePath: TEST_CASE_PATH,
      vault: TEST_VAULT,
      generations: 1,
      budget: 1,
      outDir: path.join(root, 'vault'),
      proofBoardDir: path.join(root, 'proof-board'),
    }),
  });
  assert.equal(response.status, 400);
  assert.match(String(response.body.error), /generationProviders are required/);
});

test('kernel HTTP server runs live model requests with a server-side key', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'doppl-http-live-'));
  const openRouter = mockOpenRouter();
  const response = await handleKernelHttpRequest(
    {
      method: 'POST',
      url: '/kernel/runs',
      body: JSON.stringify({
        runId: 'run_http_live',
        casePath: TEST_CASE_PATH,
        vault: TEST_VAULT,
        generations: 1,
        budget: 1,
        liveModel: true,
        model: 'fixture-model',
        outDir: path.join(root, 'vault'),
        proofBoardDir: path.join(root, 'proof-board'),
      }),
    },
    { env: { DOPPL_LIVE_PROVIDER: 'openrouter', OPENROUTER_API_KEY: 'test-key' }, fetch: openRouter.fetch },
  );
  assert.equal(response.status, 200);
  assert.equal(response.body.candidates, 2);
  assert.ok(openRouter.calls.length >= 4);
  assert.equal(openRouter.calls[0]!.headers.Authorization, 'Bearer test-key');
  assert.ok(response.body.files.some((file: string) => file.endsWith('model-calls.jsonl')));
  assert.doesNotMatch(JSON.stringify(response.body), /test-key/);
});

test('kernel HTTP server replays a recorded run without a fresh model call', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'doppl-http-replay-'));
  const outDir = path.join(root, 'vault');
  const openRouter = mockOpenRouter();
  // First a live source run records its real model calls to the vault.
  const source = await handleKernelHttpRequest(
    {
      method: 'POST',
      url: '/kernel/runs',
      body: JSON.stringify({ runId: 'run_replay_source', casePath: TEST_CASE_PATH, vault: TEST_VAULT, generations: 1, budget: 1, liveModel: true, model: 'fixture-model', outDir, proofBoardDir: path.join(root, 'proof-board-source') }),
    },
    { env: { DOPPL_LIVE_PROVIDER: 'openrouter', OPENROUTER_API_KEY: 'k' }, fetch: openRouter.fetch },
  );
  assert.equal(source.status, 200);
  const sourceCalls = openRouter.calls.length;

  // Replaying that run makes no fresh model call and reproduces the same survivor.
  const replay = await handleKernelHttpRequest({
    method: 'POST',
    url: '/kernel/runs',
    body: JSON.stringify({ runId: 'run_replay_target', casePath: TEST_CASE_PATH, vault: TEST_VAULT, generations: 1, budget: 1, replayRunId: 'run_replay_source', outDir, proofBoardDir: path.join(root, 'proof-board-replay') }),
  });
  assert.equal(replay.status, 200);
  assert.equal(replay.body.runId, 'run_replay_target');
  assert.equal(replay.body.candidates, source.body.candidates);
  assert.equal(openRouter.calls.length, sourceCalls, 'replay made no fresh model call');
});

test('kernel HTTP server requires an API key when configured', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'doppl-http-auth-'));
  const openRouter = mockOpenRouter();
  const unauthorized = await handleKernelHttpRequest(
    {
      method: 'POST',
      url: '/kernel/runs',
      body: JSON.stringify({ runId: 'run_http_auth_missing', outDir: path.join(root, 'u'), proofBoardDir: path.join(root, 'up') }),
    },
    { env: { KERNEL_API_KEY: 'kernel-test-key' } },
  );
  const authorized = await handleKernelHttpRequest(
    {
      method: 'POST',
      url: '/kernel/runs',
      headers: { authorization: 'Bearer kernel-test-key' },
      body: JSON.stringify({
        runId: 'run_http_auth_ok',
        casePath: TEST_CASE_PATH,
        vault: TEST_VAULT,
        generations: 1,
        budget: 1,
        liveModel: true,
        model: 'fixture-model',
        outDir: path.join(root, 'vault'),
        proofBoardDir: path.join(root, 'proof-board'),
      }),
    },
    { env: { KERNEL_API_KEY: 'kernel-test-key', DOPPL_LIVE_PROVIDER: 'openrouter', OPENROUTER_API_KEY: 'k' }, fetch: openRouter.fetch },
  );
  assert.equal(unauthorized.status, 401);
  assert.deepEqual(unauthorized.body, { error: 'unauthorized' });
  assert.equal(authorized.status, 200);
  assert.equal(authorized.body.runId, 'run_http_auth_ok');
});

test('kernel HTTP server reads exported run indexes and artifacts', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'doppl-http-read-'));
  const outDir = path.join(root, 'vault');
  const openRouter = mockOpenRouter();
  await handleKernelHttpRequest(
    {
      method: 'POST',
      url: '/kernel/runs',
      body: JSON.stringify({ runId: 'run_http_readback', casePath: TEST_CASE_PATH, vault: TEST_VAULT, generations: 1, budget: 1, liveModel: true, model: 'fixture-model', outDir, proofBoardDir: path.join(root, 'proof-board') }),
    },
    { env: { DOPPL_LIVE_PROVIDER: 'openrouter', OPENROUTER_API_KEY: 'k' }, fetch: openRouter.fetch },
  );
  const indexResponse = await handleKernelHttpRequest({ method: 'GET', url: `/kernel/runs/run_http_readback?outDir=${encodeURIComponent(outDir)}` });
  const artifactResponse = await handleKernelHttpRequest({ method: 'GET', url: `/kernel/runs/run_http_readback/artifacts/problem-recovery.md?outDir=${encodeURIComponent(outDir)}` });
  assert.equal(indexResponse.status, 200);
  assert.equal(indexResponse.body.runId, 'run_http_readback');
  assert.equal(indexResponse.body.problemRecovery.path, 'problem-recovery.md');
  assert.equal(artifactResponse.status, 200);
  assert.equal(artifactResponse.body.artifactPath, 'problem-recovery.md');
});

test('kernel HTTP server exposes canonical run events, SSE stream, and run health', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'doppl-http-events-'));
  const outDir = path.join(root, 'vault');
  const openRouter = mockOpenRouter();
  await handleKernelHttpRequest(
    {
      method: 'POST',
      url: '/kernel/runs',
      body: JSON.stringify({ runId: 'run_http_events', casePath: TEST_CASE_PATH, vault: TEST_VAULT, generations: 1, budget: 1, liveModel: true, model: 'fixture-model', outDir, proofBoardDir: path.join(root, 'proof-board') }),
    },
    { env: { DOPPL_LIVE_PROVIDER: 'openrouter', OPENROUTER_API_KEY: 'k' }, fetch: openRouter.fetch },
  );
  const eventsResponse = await handleKernelHttpRequest({ method: 'GET', url: `/kernel/runs/run_http_events/events?outDir=${encodeURIComponent(outDir)}&after=1` });
  const streamResponse = await handleKernelHttpRequest({ method: 'GET', url: `/kernel/runs/run_http_events/stream?outDir=${encodeURIComponent(outDir)}` });
  const healthResponse = await handleKernelHttpRequest({ method: 'GET', url: `/kernel/runs/run_http_events/health?outDir=${encodeURIComponent(outDir)}` });
  assert.equal(eventsResponse.status, 200);
  assert.equal(eventsResponse.body.runId, 'run_http_events');
  assert.ok(eventsResponse.body.events.every((event: { sequence: number }) => event.sequence > 1));
  assert.equal(streamResponse.status, 200);
  assert.equal(streamResponse.contentType, 'text/event-stream; charset=utf-8');
  assert.match(streamResponse.bodyText, /data: .*"type":"run.completed"/);
  assert.equal(healthResponse.status, 200);
  assert.equal(healthResponse.body.status, 'completed');
});

test('kernel dashboard route runs an approved case live without exposing secrets', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'doppl-http-dashboard-live-'));
  const openRouter = mockOpenRouter();
  const response = await handleKernelHttpRequest(
    {
      method: 'POST',
      url: '/kernel/dashboard/runs',
      body: JSON.stringify({ runId: 'dashboard_live', casePath: AGARDEN_FSD_CASE, liveModel: true, model: 'fixture-model', outDir: path.join(root, 'vault'), proofBoardDir: path.join(root, 'proof-board') }),
    },
    { env: { DOPPL_ENABLE_LIVE_LLM: 'true', DOPPL_LIVE_PROVIDER: 'openrouter', OPENROUTER_API_KEY: 'server-side-model-key' }, fetch: openRouter.fetch },
  );
  assert.equal(response.status, 200);
  assert.equal(response.body.runMode, 'live');
  assert.ok(response.body.candidates.length >= 2);
  assert.ok(openRouter.calls[0]!.headers.Authorization, 'Bearer server-side-model-key');
  assert.doesNotMatch(JSON.stringify(response.body), /server-side-model-key/);
});

test('kernel dashboard route runs without spending the hosted key until consent is given', async () => {
  // A key is present but DOPPL_ENABLE_LIVE_LLM is not set: no consent to spend. The run must still
  // succeed (cascade falls to the free local floor) and must never send the hosted key.
  const root = await mkdtemp(path.join(tmpdir(), 'doppl-http-dashboard-live-disabled-'));
  const openRouter = mockOpenRouter();
  const response = await handleKernelHttpRequest(
    {
      method: 'POST',
      url: '/kernel/dashboard/runs',
      body: JSON.stringify({ runId: 'dashboard_live_disabled', casePath: AGARDEN_FSD_CASE, liveModel: true, model: 'fixture-model', outDir: path.join(root, 'vault'), proofBoardDir: path.join(root, 'proof-board') }),
    },
    { env: { OPENROUTER_API_KEY: 'server-side-model-key' }, fetch: openRouter.fetch },
  );
  assert.equal(response.status, 200);
  assert.equal(response.body.runMode, 'live');
  // No call carried the hosted key — spending was withheld without consent.
  assert.ok(openRouter.calls.every((call) => call.headers.Authorization !== 'Bearer server-side-model-key'));
  assert.doesNotMatch(JSON.stringify(response.body), /server-side-model-key/);
});

test('kernel dashboard route requires a live demo token when configured', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'doppl-http-dashboard-token-'));
  const openRouter = mockOpenRouter();
  const denied = await handleKernelHttpRequest(
    {
      method: 'POST',
      url: '/kernel/dashboard/runs',
      body: JSON.stringify({ runId: 'dashboard_token_denied', casePath: AGARDEN_FSD_CASE, liveModel: true, model: 'fixture-model', outDir: path.join(root, 'v'), proofBoardDir: path.join(root, 'p') }),
    },
    { env: { DOPPL_ENABLE_LIVE_LLM: 'true', DOPPL_REQUIRE_LIVE_DEMO_TOKEN: 'true', DOPPL_LIVE_DEMO_TOKEN: 'live-demo-token', DOPPL_LIVE_PROVIDER: 'openrouter', OPENROUTER_API_KEY: 'server-side-model-key' }, fetch: openRouter.fetch },
  );
  assert.equal(denied.status, 403);
  assert.match(String(denied.body.error), /live demo token/i);
  assert.equal(openRouter.calls.length, 0);
  assert.doesNotMatch(JSON.stringify(denied.body), /server-side-model-key|live-demo-token/);
});

test('kernel dashboard route replays a model-backed run from recorded calls', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'doppl-http-dashboard-replay-'));
  const outDir = path.join(root, 'vault');
  const openRouter = mockOpenRouter();
  const source = await handleKernelHttpRequest(
    {
      method: 'POST',
      url: '/kernel/dashboard/runs',
      body: JSON.stringify({ runId: 'dashboard_replay_source', casePath: AGARDEN_FSD_CASE, liveModel: true, model: 'fixture-model', generations: 1, outDir, proofBoardDir: path.join(root, 'proof-board-source') }),
    },
    { env: { DOPPL_ENABLE_LIVE_LLM: 'true', DOPPL_LIVE_PROVIDER: 'openrouter', OPENROUTER_API_KEY: 'server-side-model-key' }, fetch: openRouter.fetch },
  );
  assert.equal(source.status, 200);
  assert.equal(source.body.runMode, 'live');

  const replay = await handleKernelHttpRequest(
    {
      method: 'POST',
      url: '/kernel/dashboard/runs',
      body: JSON.stringify({ runId: 'dashboard_replay_target', casePath: AGARDEN_FSD_CASE, replayRunId: 'dashboard_replay_source', generations: 1, outDir, proofBoardDir: path.join(root, 'proof-board-replay') }),
    },
    {
      env: { DOPPL_LIVE_PROVIDER: 'openrouter', OPENROUTER_API_KEY: 'server-side-model-key' },
      async fetch() {
        throw new Error('replay should not make a fresh model call');
      },
    },
  );
  assert.equal(replay.status, 200);
  assert.equal(replay.body.runMode, 'replay');
  assert.equal(replay.body.replaySourceRunId, 'dashboard_replay_source');
  assert.doesNotMatch(JSON.stringify(replay.body), /server-side-model-key/);
});

test('kernel dashboard route rejects unknown fitness lenses and schedules', async () => {
  const env = { DOPPL_ENABLE_LIVE_LLM: 'true', DOPPL_LIVE_PROVIDER: 'openrouter', OPENROUTER_API_KEY: 'k' };
  const badLens = await handleKernelHttpRequest(
    { method: 'POST', url: '/kernel/dashboard/runs', body: JSON.stringify({ runId: 'bad_lens', casePath: AGARDEN_FSD_CASE, liveModel: true, model: 'm', fitnessLens: 'magic' }) },
    { env },
  );
  const badSchedule = await handleKernelHttpRequest(
    { method: 'POST', url: '/kernel/dashboard/runs', body: JSON.stringify({ runId: 'bad_schedule', casePath: AGARDEN_FSD_CASE, liveModel: true, model: 'm', fitnessSchedule: 'sideways' }) },
    { env },
  );
  assert.equal(badLens.status, 400);
  assert.match(String(badLens.body.error), /fitnessLens/);
  assert.equal(badSchedule.status, 400);
  assert.match(String(badSchedule.body.error), /fitnessSchedule/);
});

test('kernel dashboard route lists recent exported runs and keyless event stream', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'doppl-http-dashboard-history-'));
  const outDir = path.join(root, 'vault');
  const openRouter = mockOpenRouter();
  await handleKernelHttpRequest(
    {
      method: 'POST',
      url: '/kernel/dashboard/runs',
      body: JSON.stringify({ runId: 'dashboard_history', casePath: AGARDEN_FSD_CASE, liveModel: true, model: 'fixture-model', outDir, proofBoardDir: path.join(root, 'proof-board') }),
    },
    { env: { DOPPL_ENABLE_LIVE_LLM: 'true', DOPPL_LIVE_PROVIDER: 'openrouter', OPENROUTER_API_KEY: 'server-only-key' }, fetch: openRouter.fetch },
  );
  const history = await handleKernelHttpRequest({ method: 'GET', url: `/kernel/dashboard/runs?outDir=${encodeURIComponent(outDir)}` });
  const stream = await handleKernelHttpRequest(
    { method: 'GET', url: `/kernel/dashboard/runs/dashboard_history/stream?outDir=${encodeURIComponent(outDir)}` },
    { env: { KERNEL_API_KEY: 'server-only-key' } },
  );
  assert.equal(history.status, 200);
  assert.equal(history.body.runs[0].runId, 'dashboard_history');
  assert.equal(stream.status, 200);
  assert.equal(stream.contentType, 'text/event-stream; charset=utf-8');
  assert.doesNotMatch(stream.bodyText, /server-only-key/);
});
