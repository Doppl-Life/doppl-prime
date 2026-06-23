import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
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
  const response = await handleKernelHttpRequest(
    { method: 'GET', url: '/' },
    { env: { KERNEL_API_KEY: 'dashboard-test-key' } },
  );

  assert.equal(response.status, 200);
  assert.equal(response.contentType, 'text/html; charset=utf-8');
  assert.match(response.bodyText, /Doppl React Flow dashboard/);
  assert.match(response.bodyText, /id="root"/);
  assert.doesNotMatch(response.bodyText, /dashboard-test-key/);
  assert.doesNotMatch(response.bodyText, /DOPPL_DASHBOARD_API_KEY/);
  assert.doesNotMatch(response.bodyText, /id="lineage-graph"/);
});

test('kernel dashboard source is built on React Flow', async () => {
  const source = await readFile('kernel/web/src/App.jsx', 'utf8');

  assert.match(source, /@xyflow\/react/);
  assert.match(source, /<ReactFlow/);
  assert.doesNotMatch(source, /<MiniMap/);
  assert.match(source, /nodesDraggable=\{false\}/);
  assert.match(source, /nodesConnectable=\{false\}/);
  assert.match(source, /draggable: false/);
  assert.match(source, /fitness-metrics/);
  assert.match(source, /Pareto frontier/);
  assert.match(source, /proposalRating/);
  assert.match(source, /fitnessLens/);
  assert.match(source, /Fitness lens/);
  assert.match(source, /fitnessSchedule/);
  assert.match(source, /Fitness schedule/);
  assert.match(source, /scheduleComparisons/);
  assert.match(source, /Schedule comparison/);
  assert.match(source, /agenomes/);
  assert.match(source, /Agenome persona/);
  assert.match(source, /case-studies\/glp1-snack-demand-destruction\/problem-statement\.md/);
  assert.match(source, /case-studies\/ai-overviews-zero-click-publishing\/problem-statement\.md/);
  assert.doesNotMatch(source, /DOPPL_DASHBOARD_API_KEY/);
  assert.doesNotMatch(source, /sk-or-v1/);
});

test('kernel dashboard styles keep graph controls readable without a minimap', async () => {
  const styles = await readFile('kernel/web/src/styles.css', 'utf8');

  assert.match(styles, /\.react-flow__controls-button/);
  assert.match(styles, /background: #31d4ff/);
  assert.match(styles, /color: #04111c/);
  assert.match(styles, /\.fitness-metrics/);
  assert.match(styles, /\.schedule-panel/);
  assert.match(styles, /\.schedule-list/);
  assert.doesNotMatch(styles, /\.react-flow-minimap/);
});

test('kernel HTTP server rejects missing dashboard assets', async () => {
  const response = await handleKernelHttpRequest({
    method: 'GET',
    url: '/dashboard/assets/missing.js',
  });

  assert.equal(response.status, 404);
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

test('kernel HTTP server runs a requested case study path with live model requests', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'doppl-http-case-live-'));
  const fakeOpenRouter = createOpenRouterFetch([
    JSON.stringify({
      title: 'GLP-1 Recovery',
      recoveredProblem:
        'GLP-1 drugs lower the reward budget behind impulse categories, not just snack preferences.',
      hiddenConstraint: 'The demand unit is household reward-seeking, not the treated person meal.',
      falsifier: 'Impulse purchases stay flat in treated households after controlling for income.',
    }),
    JSON.stringify({
      candidates: [
        {
          id: 'glp_reward_budget',
          agenomeId: 'ag_blindside',
          title: 'Reward Budget Ledger',
          summary: 'Track the household-level reward budget across food, alcohol, and nicotine.',
          mechanism: 'Compare treated-household basket shrinkage across impulse categories.',
          claimedDelta: 'Finds demand destruction beyond reformulated snacks.',
          citedKnowledge: ['K1', 'K2'],
        },
        {
          id: 'glp_channel_exposure',
          agenomeId: 'ag_first_principles',
          title: 'Channel Exposure Map',
          summary: 'Rank retailers by exposure to grazing trips and impulse checkout baskets.',
          mechanism: 'Measure revenue share from unplanned basket add-ons.',
          claimedDelta: 'Turns the thesis into an operator watchlist.',
          citedKnowledge: ['K1'],
        },
      ],
    }),
    JSON.stringify({
      verdicts: [
        {
          candidateId: 'glp_reward_budget',
          criticId: 'grounding',
          score: 93,
          pressure: 'The mechanism explains multiple impulse categories.',
          revisionMandate: 'Name the household panel split.',
        },
        {
          candidateId: 'glp_channel_exposure',
          criticId: 'grounding',
          score: 81,
          pressure: 'The channel readout is useful but downstream.',
          revisionMandate: 'Add a retailer cohort definition.',
        },
      ],
    }),
  ]);

  const response = await handleKernelHttpRequest(
    {
      method: 'POST',
      url: '/kernel/runs',
      body: JSON.stringify({
        runId: 'run_glp1_live',
        casePath: 'case-studies/glp1-snack-demand-destruction/problem-statement.md',
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

  const indexResponse = await handleKernelHttpRequest({
    method: 'GET',
    url: `/kernel/runs/run_glp1_live?outDir=${encodeURIComponent(path.join(root, 'vault'))}`,
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.caseId, 'glp1-snack-demand-destruction');
  assert.equal(response.body.child, 'child_glp_reward_budget_glp_channel_exposure');
  assert.equal(indexResponse.status, 200);
  assert.equal(indexResponse.body.caseTitle, 'Problem Statement: GLP-1 and the Packaged-Food Demand Regime');
});

test('kernel dashboard route runs approved cases without exposing the kernel API key', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'doppl-http-dashboard-case-'));
  const fakeOpenRouter = createOpenRouterFetch([]);

  const response = await handleKernelHttpRequest(
    {
      method: 'POST',
      url: '/kernel/dashboard/runs',
      body: JSON.stringify({
        runId: 'dashboard_glp1_fixture',
        casePath: 'case-studies/glp1-snack-demand-destruction/problem-statement.md',
        model: 'fixture-model',
        outDir: path.join(root, 'vault'),
        proofBoardDir: path.join(root, 'proof-board'),
      }),
    },
    {
      env: {
        KERNEL_API_KEY: 'must-not-be-in-browser',
        OPENROUTER_API_KEY: 'server-side-model-key',
      },
      fetch: fakeOpenRouter.fetch,
    },
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.runId, 'dashboard_glp1_fixture');
  assert.equal(response.body.caseId, 'glp1-snack-demand-destruction');
  assert.match(response.body.child.id, /cand_reward_budget_ledger_stability_probe_g3/);
  assert.notEqual(response.body.child.id, 'child_cand_reward_budget_ledger_cand_food_noise_tripwire');
  assert.match(response.body.child.summary, /reward budget/i);
  assert.match(response.body.candidates[0].summary, /reward/i);
  assert.match(response.body.candidates[0].mechanism, /panel/i);
  assert.equal(response.body.candidates.length, 12);
  assert.equal(new Set(response.body.candidates.map((candidate: { id: string }) => candidate.id)).size, 12);
  assert.equal(response.body.criticVerdicts.length, 45);
  assert.equal(response.body.fitnessRecords.length, 15);
  assert.equal(response.body.fitnessRecords[0].selection.frontier.pareto, true);
  assert.equal(response.body.fitnessRecords[0].selection.frontier.rank, 1);
  assert.equal(typeof response.body.fitnessRecords[0].selection.proposalRating.judge, 'number');
  assert.equal(response.body.fitnessRecords[0].selection.lens.name, 'none');
  assert.equal(response.body.knowledgePacket.items.length, 3);
  assert.match(response.body.dashboardArtifact, /reward system behind impulse eating occasions/);
  assert.ok(Array.isArray(response.body.dashboardEvents));
  assert.ok(response.body.dashboardEvents.length > 0);
  assert.equal(fakeOpenRouter.calls.length, 0);
});

test('kernel dashboard route applies an approved fitness lens without exposing secrets', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'doppl-http-dashboard-lens-'));
  const response = await handleKernelHttpRequest(
    {
      method: 'POST',
      url: '/kernel/dashboard/runs',
      body: JSON.stringify({
        runId: 'dashboard_lens_fixture',
        casePath: 'case-studies/fsd-ownership-unwind/problem-statement.md',
        fitnessLens: 'feasibility',
        generations: 1,
        outDir: path.join(root, 'vault'),
        proofBoardDir: path.join(root, 'proof-board'),
      }),
    },
    {
      env: {
        KERNEL_API_KEY: 'must-not-be-in-browser',
        OPENROUTER_API_KEY: 'server-side-model-key',
      },
    },
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.fitnessRecords[0].selection.lens.name, 'feasibility');
  assert.ok(response.body.fitnessRecords[0].selection.lens.multiplier <= 1);
  assert.doesNotMatch(JSON.stringify(response.body), /server-side-model-key/);
});

test('kernel dashboard route applies an approved fitness schedule', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'doppl-http-dashboard-schedule-'));
  const response = await handleKernelHttpRequest({
    method: 'POST',
    url: '/kernel/dashboard/runs',
    body: JSON.stringify({
      runId: 'dashboard_schedule_fixture',
      casePath: 'case-studies/fsd-ownership-unwind/problem-statement.md',
      fitnessSchedule: 'converge',
      generations: 1,
      outDir: path.join(root, 'vault'),
      proofBoardDir: path.join(root, 'proof-board'),
    }),
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.fitnessRecords[0].selection.dial, 'converge');
  assert.equal(response.body.fitnessRecords[0].selection.weights.grounding, 0.72);
});

test('kernel dashboard route rejects unknown fitness lenses', async () => {
  const response = await handleKernelHttpRequest({
    method: 'POST',
    url: '/kernel/dashboard/runs',
    body: JSON.stringify({
      runId: 'dashboard_bad_lens',
      fitnessLens: 'magic',
    }),
  });

  assert.equal(response.status, 400);
  assert.match(String(response.body.error), /fitnessLens/);
});

test('kernel dashboard route rejects unknown fitness schedules', async () => {
  const response = await handleKernelHttpRequest({
    method: 'POST',
    url: '/kernel/dashboard/runs',
    body: JSON.stringify({
      runId: 'dashboard_bad_schedule',
      fitnessSchedule: 'sideways',
    }),
  });

  assert.equal(response.status, 400);
  assert.match(String(response.body.error), /fitnessSchedule/);
});

test('kernel dashboard route lists recent exported runs without an API key', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'doppl-http-dashboard-history-'));
  const outDir = path.join(root, 'vault');
  await handleKernelHttpRequest({
    method: 'POST',
    url: '/kernel/dashboard/runs',
    body: JSON.stringify({
      runId: 'dashboard_history_fixture',
      casePath: 'case-studies/fsd-ownership-unwind/problem-statement.md',
      outDir,
      proofBoardDir: path.join(root, 'proof-board'),
    }),
  });

  const response = await handleKernelHttpRequest({
    method: 'GET',
    url: `/kernel/dashboard/runs?outDir=${encodeURIComponent(outDir)}`,
  });

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(response.body.runs));
  assert.equal(response.body.runs[0].runId, 'dashboard_history_fixture');
  assert.equal(response.body.runs[0].caseId, 'fsd-ownership-unwind');
  assert.match(response.body.runs[0].child, /cand_liability_clock_stability_probe_g3/);
});

test('kernel dashboard route runs all approved real case fixtures with unique results', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'doppl-http-dashboard-all-cases-'));
  const outDir = path.join(root, 'vault');
  const cases = [
    {
      caseId: 'fsd-ownership-unwind',
      casePath: 'case-studies/fsd-ownership-unwind/problem-statement.md',
      expectedRecovery: /autonomy removes the human-driver reason/i,
    },
    {
      caseId: 'glp1-snack-demand-destruction',
      casePath: 'case-studies/glp1-snack-demand-destruction/problem-statement.md',
      expectedRecovery: /reward system behind impulse eating occasions/i,
    },
    {
      caseId: 'ai-overviews-zero-click-publishing',
      casePath: 'case-studies/ai-overviews-zero-click-publishing/problem-statement.md',
      expectedRecovery: /answer layers remove the click itself/i,
    },
    {
      caseId: 'starship-launch-cost-collapse',
      casePath: 'case-studies/starship-launch-cost-collapse/problem-statement.md',
      expectedRecovery: /launch-cost collapse re-prices every downstream constraint/i,
    },
  ];

  const childIds: string[] = [];
  const recoveryTexts: string[] = [];
  for (const caseStudy of cases) {
    const response = await handleKernelHttpRequest({
      method: 'POST',
      url: '/kernel/dashboard/runs',
      body: JSON.stringify({
        runId: `${caseStudy.caseId}_dashboard_fixture_test`,
        casePath: caseStudy.casePath,
        generations: 2,
        budget: 2,
        outDir,
        proofBoardDir: path.join(root, 'proof-board'),
      }),
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.caseId, caseStudy.caseId);
    assert.match(response.body.child.id, /_stability_probe_g1_/);
    assert.equal(response.body.candidates.length, 6);
    assert.equal(new Set(response.body.candidates.map((candidate: { id: string }) => candidate.id)).size, 6);
    assert.equal(response.body.evolution.length, 2);
    assert.notDeepEqual(response.body.evolution[0].candidateIds, response.body.evolution[1].candidateIds);
    assert.ok(response.body.evolution[1].candidateIds.includes(response.body.evolution[0].childId));
    assert.match(String(response.body.dashboardArtifact), caseStudy.expectedRecovery);
    assert.ok(Array.isArray(response.body.dashboardEvents));
    assert.ok(response.body.dashboardEvents.some((event: { runId?: string }) => event.runId));
    childIds.push(response.body.child.id);
    recoveryTexts.push(String(response.body.dashboardArtifact));
  }

  assert.equal(new Set(childIds).size, cases.length);
  assert.equal(new Set(recoveryTexts).size, cases.length);
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

test('kernel HTTP server exposes canonical run events, SSE stream, and run health', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'doppl-http-events-'));
  const outDir = path.join(root, 'vault');
  await handleKernelHttpRequest({
    method: 'POST',
    url: '/kernel/runs',
    body: JSON.stringify({
      runId: 'run_http_events',
      generations: 1,
      budget: 1,
      outDir,
      proofBoardDir: path.join(root, 'proof-board'),
    }),
  });

  const eventsResponse = await handleKernelHttpRequest({
    method: 'GET',
    url: `/kernel/runs/run_http_events/events?outDir=${encodeURIComponent(outDir)}&after=1`,
  });
  const streamResponse = await handleKernelHttpRequest({
    method: 'GET',
    url: `/kernel/runs/run_http_events/stream?outDir=${encodeURIComponent(outDir)}`,
  });
  const healthResponse = await handleKernelHttpRequest({
    method: 'GET',
    url: `/kernel/runs/run_http_events/health?outDir=${encodeURIComponent(outDir)}`,
  });

  assert.equal(eventsResponse.status, 200);
  assert.equal(eventsResponse.body.runId, 'run_http_events');
  assert.ok(Array.isArray(eventsResponse.body.events));
  assert.ok(eventsResponse.body.events.every((event: { sequence: number }) => event.sequence > 1));
  assert.ok(
    eventsResponse.body.events.every(
      (event: { id?: string; runId?: string; actor?: string; schemaVersion?: number }) =>
        event.id && event.runId === 'run_http_events' && event.actor && event.schemaVersion === 1,
    ),
  );
  assert.equal(streamResponse.status, 200);
  assert.equal(streamResponse.contentType, 'text/event-stream; charset=utf-8');
  assert.match(streamResponse.bodyText, /^id: 0/m);
  assert.match(streamResponse.bodyText, /data: .*"type":"run.completed"/);
  assert.equal(healthResponse.status, 200);
  assert.deepEqual(healthResponse.body.status, 'completed');
  assert.equal(healthResponse.body.runId, 'run_http_events');
  assert.equal(healthResponse.body.candidatesInFlight, 0);
  assert.ok(Number(healthResponse.body.sequenceThrough) > 0);
});

test('kernel dashboard exposes keyless event stream without exposing API key', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'doppl-http-dashboard-stream-'));
  const outDir = path.join(root, 'vault');
  await handleKernelHttpRequest({
    method: 'POST',
    url: '/kernel/dashboard/runs',
    body: JSON.stringify({
      runId: 'dashboard_stream_fixture',
      casePath: 'case-studies/fsd-ownership-unwind/problem-statement.md',
      outDir,
      proofBoardDir: path.join(root, 'proof-board'),
    }),
  });

  const protectedResponse = await handleKernelHttpRequest(
    {
      method: 'GET',
      url: `/kernel/runs/dashboard_stream_fixture/stream?outDir=${encodeURIComponent(outDir)}`,
    },
    { env: { KERNEL_API_KEY: 'server-only-key' } },
  );
  const dashboardResponse = await handleKernelHttpRequest(
    {
      method: 'GET',
      url: `/kernel/dashboard/runs/dashboard_stream_fixture/stream?outDir=${encodeURIComponent(outDir)}`,
    },
    { env: { KERNEL_API_KEY: 'server-only-key' } },
  );

  assert.equal(protectedResponse.status, 401);
  assert.equal(dashboardResponse.status, 200);
  assert.equal(dashboardResponse.contentType, 'text/event-stream; charset=utf-8');
  assert.match(dashboardResponse.bodyText, /data: .*"runId":"dashboard_stream_fixture"/);
  assert.doesNotMatch(dashboardResponse.bodyText, /server-only-key/);
});
