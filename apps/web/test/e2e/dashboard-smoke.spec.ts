import { expect, test } from '@playwright/test';

/**
 * P7.15 — the §16 happy-path smoke (the single must-pass UI gate; NOT exhaustive). One spec drives the
 * REAL mounted App (P7.14 Dashboard) through the demo narrative: launcher Start → mocked REST/SSE serve a
 * fixture run → lineage renders → a live SSE event folds (activity feed advances) → the final-idea proof
 * panel renders with its proof sections for the selected winner → ModeBanner shows LIVE.
 *
 * The data-client is MOCKED via `page.route('**\/api/**')` (REST fixtures + a synthetic text/event-stream)
 * — no live backend (that lands at the demo→cody merge). Deterministic: fixed fixtures + locator waits,
 * never arbitrary sleeps. Fixtures are frozen-contract-shaped (served as raw JSON).
 */

const run = {
  id: 'run_1',
  seed: 'demo seed',
  enabledSubtypes: ['cross_domain_transfer', 'zeitgeist_synthesis'],
  caps: {
    maxPopulation: 10,
    maxGenerations: 5,
    energyBudget: 1000,
    maxSpawnDepth: 3,
    maxToolCalls: 100,
    wallClockTimeoutMs: 600_000,
  },
  status: 'configured',
  startedAt: '2026-06-20T12:00:00.000Z',
};

const lineage = {
  runId: 'run_1',
  nodes: [
    { id: 'g0', type: 'generation', label: 'Generation 0', dataRef: 'gen_0' },
    { id: 'a0', type: 'agenome', label: 'Agenome 0', status: 'active', dataRef: 'agn_1' },
    { id: 'c0', type: 'candidate', label: 'Winner idea', status: 'selected', dataRef: 'cand_1' },
  ],
  edges: [
    { id: 'e0', source: 'g0', target: 'a0', type: 'spawned' },
    { id: 'e1', source: 'a0', target: 'c0', type: 'produced' },
  ],
  sequenceThrough: 20,
};

const candidate = {
  id: 'cand_1',
  runId: 'run_1',
  generationId: 'gen_0',
  agenomeId: 'agn_1',
  title: 'Immune-inspired cold-start recommender',
  summary: 'Apply affinity maturation to surface niche items for new users.',
  claims: ['CF underperforms on cold-start'],
  evidenceRefs: [{ kind: 'prior_art', label: 'AIRS 2003' }],
  status: 'selected',
  subtype: 'cross_domain_transfer',
  subtypePayload: {
    sourceDomain: 'immunology',
    sourceTechnique: 'clonal selection',
    targetDomain: 'recommender systems',
    targetProblem: 'cold-start personalization',
    transferMapping: 'antigens→items',
    expectedMechanism: 'affinity maturation surfaces niche items',
  },
};

const health = {
  runId: 'run_1',
  currentGeneration: 0,
  candidatesInFlight: 1,
  lastEventAt: '2026-06-20T12:00:05.000Z',
  capsConsumed: { maxGenerations: 0 },
};

function envelope(id: string, sequence: number, type: string, extra: Record<string, unknown>) {
  return {
    id,
    runId: 'run_1',
    type,
    sequence,
    occurredAt: `2026-06-20T12:00:${String(sequence).padStart(2, '0')}.000Z`,
    actor: 'runtime',
    payload: {},
    schemaVersion: 2,
    ...extra,
  };
}

// REST events seed — the winner's fitness/critic/check/energy + a candidate.created carrying trace ids.
const events = [
  envelope('ev1', 1, 'candidate.created', {
    candidateId: 'cand_1',
    generationId: 'gen_0',
    langfuseTraceId: 'tr_1',
    langfuseObservationId: 'ob_1',
    payload: candidate,
  }),
  envelope('ev2', 2, 'fitness.scored', {
    candidateId: 'cand_1',
    generationId: 'gen_0',
    payload: {
      id: 'fit_1',
      candidateId: 'cand_1',
      total: 0.84,
      components: { critic: 0.7, novelty: 0.6 },
      policyVersion: 'scoring-v1',
      explanation: 'aggregate',
    },
  }),
  envelope('ev3', 3, 'critic.reviewed', {
    candidateId: 'cand_1',
    payload: {
      id: 'crev_1',
      candidateId: 'cand_1',
      mandate: 'feasibility',
      scores: { rigor: 0.8 },
      critique: 'plausible transfer',
      confidence: 0.82,
      evidenceRefs: [],
    },
  }),
  envelope('ev4', 4, 'check.completed', {
    candidateId: 'cand_1',
    payload: {
      id: 'chk_1',
      candidateId: 'cand_1',
      checkType: 'math_check',
      status: 'passed',
      evidenceRefs: [],
    },
  }),
  envelope('ev5', 5, 'energy.spent', {
    agenomeId: 'agn_1',
    payload: {
      id: 'en_1',
      runId: 'run_1',
      agenomeId: 'agn_1',
      eventType: 'llm',
      estimate: 120,
      actual: 120,
      unit: 'doppl_energy',
      reason: 'generation',
    },
  }),
];

// The SSE stream emits a LIVE op-start marker (seq 6) with NO completion → the lineage activity feed
// shows it as in-flight after the stream delivers (proving live fold, not the seed).
const liveMarker = envelope('ev6', 6, 'critic.review_started', {
  candidateId: 'cand_1',
  payload: {},
});
const sseBody = `data: ${JSON.stringify(liveMarker)}\n\n`;

test('dashboard happy path: start → live events fold → final-idea links resolve', async ({
  page,
}) => {
  // One unambiguous handler keyed on exact pathname + method — avoids glob-overlap/anchoring surprises.
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    // PD.16 — POST /runs returns the command shape `{ runId }` (not a full Run); startRun consumes it.
    if (path === '/api/runs' && method === 'POST')
      return route.fulfill({ json: { runId: run.id } });
    // PD.17 — RunListPanel calls listRuns on mount; the real API + the PD.15 client use the `{runs}`
    // wrapper, so the GET /runs mock returns `{ runs: [] }` (the panel renders its empty state cleanly).
    if (path === '/api/runs') return route.fulfill({ json: { runs: [] } });
    if (path === '/api/runs/run_1/lineage') return route.fulfill({ json: lineage });
    if (path.startsWith('/api/runs/run_1/events')) return route.fulfill({ json: events });
    if (path === '/api/runs/run_1/candidates/cand_1') return route.fulfill({ json: candidate });
    if (path === '/api/runs/run_1/health') return route.fulfill({ json: health });
    if (path === '/api/runs/run_1/stop')
      return route.fulfill({ json: { ...run, status: 'stopped' } });
    if (path.startsWith('/api/runs/run_1/stream')) {
      return route.fulfill({ contentType: 'text/event-stream', body: sseBody });
    }
    return route.fulfill({ status: 404, json: { error: 'unmocked', path } });
  });

  await page.goto('/');

  // 1. app loads — the shell + ModeBanner + the run-launcher are visible.
  await expect(page.getByRole('heading', { name: /run observatory/i })).toBeVisible();
  await expect(page.getByText(/LIVE/)).toBeVisible(); // ModeBanner live indicator (AC2)
  const launcher = page.getByLabel('Run configuration');
  await expect(launcher).toBeVisible();

  // 4 (start). Configure + start the run → the shell observes run_1.
  await launcher.getByLabel(/seed prompt/i).fill('cross-domain transfer demo');
  await launcher.getByRole('button', { name: /start run/i }).click();

  // 2. run loads — the lineage graph renders the served fixture (the selected-winner node).
  await expect(page.getByLabel('Lineage graph')).toBeVisible();
  await expect(page.getByText('Winner idea')).toBeVisible();

  // 3. live events fold — the SSE marker advances the lineage activity feed (post-event locator, no sleep).
  await expect(page.getByTestId('lineage-activity')).toContainText(/review/i);

  // 4. final-idea proof links resolve — the winner + its proof sections render for the selected winner.
  const finalIdea = page.getByLabel('Final surviving idea');
  await expect(
    finalIdea.getByRole('heading', { name: /immune-inspired cold-start/i }),
  ).toBeVisible();
  await expect(finalIdea.getByText('critic reviews', { exact: true })).toBeVisible();
  await expect(finalIdea.getByText('subtype checks', { exact: true })).toBeVisible();
  await expect(finalIdea.getByText('fitness', { exact: true })).toBeVisible();
  await expect(finalIdea.getByText('energy', { exact: true })).toBeVisible();

  // 5. PD.7 — the transfer-evidence rung is labeled for the run mode (live here) + the winner's
  //    prior-art evidenceRef resolves in-tier via the shared EvidenceRefLink.
  await expect(finalIdea.getByText(/live allowlisted \(non-executing\)/i)).toBeVisible();
  await expect(finalIdea.getByText('AIRS 2003')).toBeVisible();
});
