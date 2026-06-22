import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { handleKernelHttpRequest } from '../src/server.ts';
import { loadCaseStudy } from '../src/case-loader.ts';
import { createDefaultModelGenerationPrompts } from '../src/generation-providers.ts';
import { createJsonKnowledgeGateway } from '../src/knowledge-gateway.ts';
import { type ModelCallRecord, writeModelCallRecords } from '../src/model-gateway.ts';

async function writeReplayCalls(filePath: string, runId: string, model: string): Promise<void> {
  const caseStudy = await loadCaseStudy('case-studies/fsd-ownership-unwind/problem-statement.md');
  const gateway = await createJsonKnowledgeGateway(
    'kernel/fixtures/fsd-ownership-unwind/knowledge-packet.json',
  );
  const knowledgePacket = await gateway.selectPacket({
    runId,
    targetCase: caseStudy.id,
    maxItems: 4,
  });
  const prompts = createDefaultModelGenerationPrompts();
  const problemRecovery = {
    title: 'HTTP Replay Recovery',
    recoveredProblem:
      'Autonomous driving changes the reason households own idle cars, shifting value toward fleet inventory.',
    hiddenConstraint: 'The fork is whether autonomous miles become pure service capacity.',
    falsifier: 'Private autonomous car purchases keep rising while fleet miles remain marginal.',
  };
  const candidates = [
    {
      id: 'http_replay_a',
      agenomeId: 'ag_blindside',
      title: 'Insurance Transfer Clock',
      summary: 'Use liability transfer as the earliest signal of ownership unwind.',
      mechanism: 'Track when insurers and OEMs price the vehicle, not the driver, as the risk subject.',
      claimedDelta: 'Moves the thesis earlier than visible sales declines.',
      citedKnowledge: ['K1', 'K2'],
    },
    {
      id: 'http_replay_b',
      agenomeId: 'ag_first_principles',
      title: 'Residual Stress Ledger',
      summary: 'Follow residual-value exposure through leases, floorplan loans, and auto ABS.',
      mechanism: 'Map who holds depreciation risk as autonomous utilization rises.',
      claimedDelta: 'Turns adoption into a balance-sheet watchlist.',
      citedKnowledge: ['K1'],
    },
  ];
  const completedProblemRecovery = {
    id: `recovery_${caseStudy.id}`,
    caseId: caseStudy.id,
    ...problemRecovery,
    citedKnowledge: knowledgePacket.items.map((item) => item.citeHandle),
  };
  const completedCandidates = candidates.map((candidate) => ({
    ...candidate,
    caseId: caseStudy.id,
    generation: 0,
  }));
  const records: ModelCallRecord[] = [
    {
      id: 'call_http_replay_problem',
      runId,
      purpose: 'problem_recovery',
      provider: 'test-replay',
      model,
      prompt: prompts.problemRecovery({ runId, caseStudy, knowledgePacket }),
      outputText: JSON.stringify(problemRecovery),
      metadata: {},
    },
    {
      id: 'call_http_replay_candidates',
      runId,
      purpose: 'candidate_generation',
      provider: 'test-replay',
      model,
      prompt: prompts.candidateGeneration({
        runId,
        caseStudy,
        problemRecovery: completedProblemRecovery,
        knowledgePacket,
        generation: 0,
      }),
      outputText: JSON.stringify({ candidates }),
      metadata: {},
    },
    {
      id: 'call_http_replay_critics',
      runId,
      purpose: 'critic_judgment',
      provider: 'test-replay',
      model,
      prompt: prompts.criticJudgment({
        runId,
        caseStudy,
        problemRecovery: completedProblemRecovery,
        candidates: completedCandidates,
        knowledgePacket,
      }),
      outputText: JSON.stringify({
        verdicts: [
          {
            candidateId: 'http_replay_a',
            criticId: 'grounding',
            score: 88,
            pressure: 'Liability transfer is externally observable.',
            revisionMandate: 'Name the filings that prove risk transfer.',
          },
          {
            candidateId: 'http_replay_b',
            criticId: 'grounding',
            score: 72,
            pressure: 'Residual exposure is measurable but closer to the obvious thesis.',
            revisionMandate: 'Pick the first counterparty likely to break.',
          },
        ],
      }),
      metadata: {},
    },
  ];
  await writeModelCallRecords(filePath, records);
}

function createOpenRouterFetch(outputs: string[]) {
  const calls: Array<{ headers: Record<string, string>; body: Record<string, unknown> }> = [];
  return {
    calls,
    async fetch(_url: string, init: { headers: Record<string, string>; body: string }) {
      calls.push({ headers: init.headers, body: JSON.parse(init.body) as Record<string, unknown> });
      const outputText = outputs.shift();
      if (!outputText) throw new Error('unexpected extra model call');
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'test-request-id' },
        async json() {
          return { choices: [{ message: { content: outputText } }] };
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

test('kernel HTTP server serves a visible production page', async () => {
  const response = await handleKernelHttpRequest({ method: 'GET', url: '/' });

  assert.equal(response.status, 200);
  assert.equal(response.contentType, 'text/html; charset=utf-8');
  assert.match(response.bodyText, /Doppl Kernel/);
  assert.match(response.bodyText, /\/health/);
  assert.match(response.bodyText, /\/kernel\/runs/);
});

test('kernel HTTP server runs a fixture kernel request', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'doppl-http-kernel-'));
  const response = await handleKernelHttpRequest({
    method: 'POST',
    url: '/kernel/runs',
    body: JSON.stringify({
      runId: 'run_http_fixture',
      generations: 1,
      budget: 1,
      outDir: path.join(root, 'vault'),
      proofBoardDir: path.join(root, 'proof-board'),
    }),
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.runId, 'run_http_fixture');
  assert.equal(response.body.caseId, 'fsd-ownership-unwind');
  assert.equal(response.body.generations, 1);
  assert.equal(response.body.budget.usedUnits, 1);
  assert.match(response.body.proofBoard, /proof-board\/index\.html$/);
  assert.ok(response.body.files.some((file: string) => file.endsWith('run-index.json')));
});

test('kernel HTTP server runs from replayed model calls', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'doppl-http-replay-'));
  const modelCallsPath = path.join(root, 'model-calls.jsonl');
  await writeReplayCalls(modelCallsPath, 'run_http_replay', 'fixture-model');

  const response = await handleKernelHttpRequest({
    method: 'POST',
    url: '/kernel/runs',
    body: JSON.stringify({
      runId: 'run_http_replay',
      generations: 1,
      budget: 1,
      model: 'fixture-model',
      replayModelCallsPath: modelCallsPath,
      outDir: path.join(root, 'vault'),
      proofBoardDir: path.join(root, 'proof-board'),
    }),
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.runId, 'run_http_replay');
  assert.equal(response.body.child, 'child_http_replay_a_http_replay_b');
  assert.equal(response.body.candidates, 2);
  assert.ok(response.body.files.some((file: string) => file.endsWith('model-calls.jsonl')));
});

test('kernel HTTP server runs live model requests with a server-side key', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'doppl-http-live-'));
  const fakeOpenRouter = createOpenRouterFetch([
    JSON.stringify({
      title: 'HTTP Live Recovery',
      recoveredProblem:
        'Autonomous service miles change car ownership from a household asset to fleet capacity.',
      hiddenConstraint: 'The first break appears where risk and utilization accounting move together.',
      falsifier: 'Households keep buying private autonomous vehicles at current replacement rates.',
    }),
    JSON.stringify({
      candidates: [
        {
          id: 'http_live_a',
          agenomeId: 'ag_blindside',
          title: 'Risk Subject Flip',
          summary: 'Watch when the insured subject becomes the autonomous vehicle operator.',
          mechanism: 'Compare insurer filings and OEM liability assumptions by state.',
          claimedDelta: 'Finds ownership unwind before car sales move.',
          citedKnowledge: ['K1', 'K2'],
        },
        {
          id: 'http_live_b',
          agenomeId: 'ag_first_principles',
          title: 'Utilization Carry Trade',
          summary: 'Compare idle private depreciation with fleet utilization economics.',
          mechanism: 'Track who finances high-utilization inventory and who holds residual risk.',
          claimedDelta: 'Turns the thesis into a financing spread.',
          citedKnowledge: ['K1'],
        },
      ],
    }),
    JSON.stringify({
      verdicts: [
        {
          candidateId: 'http_live_a',
          criticId: 'grounding',
          score: 91,
          pressure: 'Risk subject changes are observable and early.',
          revisionMandate: 'Specify the filings that define the flip.',
        },
        {
          candidateId: 'http_live_b',
          criticId: 'grounding',
          score: 83,
          pressure: 'Utilization economics are strong but less directly observable.',
          revisionMandate: 'Name the financing spread and source.',
        },
      ],
    }),
  ]);

  const response = await handleKernelHttpRequest(
    {
      method: 'POST',
      url: '/kernel/runs',
      body: JSON.stringify({
        runId: 'run_http_live',
        generations: 1,
        budget: 1,
        liveModel: true,
        model: 'fixture-model',
        outDir: path.join(root, 'vault'),
        proofBoardDir: path.join(root, 'proof-board'),
      }),
    },
    {
      env: { OPENROUTER_API_KEY: 'test-key' },
      fetch: fakeOpenRouter.fetch,
    },
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.child, 'child_http_live_a_http_live_b');
  assert.equal(fakeOpenRouter.calls.length, 3);
  assert.equal(fakeOpenRouter.calls[0]!.headers.Authorization, 'Bearer test-key');
  assert.ok(response.body.files.some((file: string) => file.endsWith('model-calls.jsonl')));
});

test('kernel HTTP server requires an API key when configured', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'doppl-http-auth-'));
  const unauthorized = await handleKernelHttpRequest(
    {
      method: 'POST',
      url: '/kernel/runs',
      body: JSON.stringify({
        runId: 'run_http_auth_missing',
        outDir: path.join(root, 'unauthorized-vault'),
        proofBoardDir: path.join(root, 'unauthorized-proof-board'),
      }),
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
        generations: 1,
        budget: 1,
        outDir: path.join(root, 'vault'),
        proofBoardDir: path.join(root, 'proof-board'),
      }),
    },
    { env: { KERNEL_API_KEY: 'kernel-test-key' } },
  );

  assert.equal(unauthorized.status, 401);
  assert.deepEqual(unauthorized.body, { error: 'unauthorized' });
  assert.equal(authorized.status, 200);
  assert.equal(authorized.body.runId, 'run_http_auth_ok');
});

test('kernel HTTP server reads exported run indexes and artifacts', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'doppl-http-read-'));
  const outDir = path.join(root, 'vault');
  await handleKernelHttpRequest({
    method: 'POST',
    url: '/kernel/runs',
    body: JSON.stringify({
      runId: 'run_http_readback',
      generations: 1,
      budget: 1,
      outDir,
      proofBoardDir: path.join(root, 'proof-board'),
    }),
  });

  const indexResponse = await handleKernelHttpRequest({
    method: 'GET',
    url: `/kernel/runs/run_http_readback?outDir=${encodeURIComponent(outDir)}`,
  });
  const artifactResponse = await handleKernelHttpRequest({
    method: 'GET',
    url: `/kernel/runs/run_http_readback/artifacts/problem-recovery.md?outDir=${encodeURIComponent(outDir)}`,
  });

  assert.equal(indexResponse.status, 200);
  assert.equal(indexResponse.body.runId, 'run_http_readback');
  assert.equal(indexResponse.body.caseId, 'fsd-ownership-unwind');
  assert.equal(indexResponse.body.problemRecovery.path, 'problem-recovery.md');
  assert.equal(artifactResponse.status, 200);
  assert.equal(artifactResponse.body.artifactPath, 'problem-recovery.md');
  assert.match(artifactResponse.body.content, /Recover The Ownership Premise/);
});
