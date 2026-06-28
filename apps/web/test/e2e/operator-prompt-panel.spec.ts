import { expect, test } from '@playwright/test';

/**
 * PD.5b — the §17 operator-prompt happy path (cross-stack smoke; mirrors dashboard-smoke). Drives the
 * REAL mounted OperatorPromptPanel through both demo entry points: pick a PREPARED problem (from a mocked
 * GET /problem-sets) OR type a FREEFORM prompt → submit → the partial {seed} POST /runs starts the run →
 * the shell observes it and the live view renders (lineage + ModeBanner LIVE). Data-client MOCKED via
 * page.route('**\/api/**') (REST fixtures + a synthetic text/event-stream) — no live backend. Per
 * apps/web L§10 the spec IS the deliverable (runs when Playwright browsers install, else doc'd-as-CI).
 */

const problemSets = {
  problemSets: [
    {
      id: 'demo-1',
      title: 'Cross-domain transfer demo',
      prompt: 'Find a technique from one domain that solves a problem in another.',
    },
  ],
};

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

const health = {
  runId: 'run_1',
  generationCount: 0,
  candidatesInFlight: 1,
  lastEventAt: '2026-06-20T12:00:05.000Z',
  capsConsumed: { generations: { consumed: 0, ceiling: 5 } },
};

async function mockApi(page: import('@playwright/test').Page) {
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path === '/api/problem-sets') return route.fulfill({ json: problemSets });
    if (path === '/api/runs' && method === 'POST') return route.fulfill({ json: run });
    if (path === '/api/runs') return route.fulfill({ json: [] });
    if (path === '/api/runs/run_1/lineage') return route.fulfill({ json: lineage });
    if (path.startsWith('/api/runs/run_1/events')) return route.fulfill({ json: [] });
    if (path === '/api/runs/run_1/health') return route.fulfill({ json: health });
    if (path.startsWith('/api/runs/run_1/stream')) {
      return route.fulfill({ contentType: 'text/event-stream', body: '' });
    }
    return route.fulfill({ status: 404, json: { error: 'unmocked', path } });
  });
}

test('operator prepared problem → submit → run live', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');

  const panel = page.getByLabel('Operator prompt');
  await expect(panel).toBeVisible();
  // prepared is the default source; on mount the catalog loads and the first problem auto-selects
  // (an <option> inside a collapsed <select> is not "visible" — assert the select's value instead).
  await expect(panel.getByRole('combobox')).toHaveValue('demo-1');
  await panel.getByRole('button', { name: /start demo run/i }).click();

  // the shell observes the started run → the live lineage renders the served fixture.
  await expect(page.getByLabel('Lineage graph')).toBeVisible();
  await expect(page.getByText('Winner idea')).toBeVisible();
  await expect(page.getByText(/LIVE/)).toBeVisible();
});

test('operator freeform prompt → submit → run live', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');

  const panel = page.getByLabel('Operator prompt');
  await panel.getByLabel(/freeform prompt/i).click();
  await panel.getByLabel(/problem prompt/i).fill('Design a low-cost off-grid water filter.');
  await panel.getByRole('button', { name: /start demo run/i }).click();

  await expect(page.getByLabel('Lineage graph')).toBeVisible();
  await expect(page.getByText('Winner idea')).toBeVisible();
  await expect(page.getByText(/LIVE/)).toBeVisible();
});
