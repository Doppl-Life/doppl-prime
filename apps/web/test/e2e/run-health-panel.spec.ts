import { expect, test } from '@playwright/test';

/**
 * PD.6 — the continue-vs-switch health surfacing, end-to-end (mirrors dashboard-smoke; data-client mocked
 * via page.route). Deterministic: rather than a flaky real-time stall, the mocked GET /runs/:id/health
 * serves a STALE last-event-at (far in the past) → the RunHealthPanel renders the colorblind-safe stale
 * badge ("consider switching to replay") once the run is observed. Per apps/web L§10 the spec IS the
 * deliverable (runs when Playwright browsers install, else doc'd-as-CI).
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
    { id: 'c0', type: 'candidate', label: 'Winner idea', status: 'selected', dataRef: 'cand_1' },
  ],
  edges: [{ id: 'e1', source: 'g0', target: 'c0', type: 'produced' }],
  sequenceThrough: 20,
};

// A STALE health signal — lastEventAt far in the past (well beyond the ~10s threshold).
const staleHealth = {
  runId: 'run_1',
  generationCount: 2,
  candidatesInFlight: 1,
  lastEventAt: '2020-01-01T00:00:00.000Z',
  capsConsumed: { generations: { consumed: 2, ceiling: 5 } },
};

test('run-health panel surfaces the stale continue-vs-switch flag', async ({ page }) => {
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path === '/api/problem-sets') return route.fulfill({ json: { problemSets: [] } });
    if (path === '/api/runs' && method === 'POST') return route.fulfill({ json: run });
    if (path === '/api/runs') return route.fulfill({ json: [] });
    if (path === '/api/runs/run_1/lineage') return route.fulfill({ json: lineage });
    if (path.startsWith('/api/runs/run_1/events')) return route.fulfill({ json: [] });
    if (path === '/api/runs/run_1/health') return route.fulfill({ json: staleHealth });
    if (path.startsWith('/api/runs/run_1/stream')) {
      return route.fulfill({ contentType: 'text/event-stream', body: '' });
    }
    return route.fulfill({ status: 404, json: { error: 'unmocked', path } });
  });

  await page.goto('/');

  // start a run via the full-control launcher (RunConfigPanel) so the shell observes run_1.
  const launcher = page.getByLabel('Run configuration');
  await launcher.getByLabel(/seed prompt/i).fill('demo problem');
  await launcher.getByRole('button', { name: /start run/i }).click();

  // the run-health panel renders the served (stale) signal + the colorblind-safe stale flag.
  const healthPanel = page.getByLabel('Run health');
  await expect(healthPanel).toBeVisible();
  await expect(healthPanel.getByText(/stale/i)).toBeVisible();
  await expect(healthPanel.getByText(/replay/i)).toBeVisible();
  // ModeBanner is the live/replay mode indicator (reused as-is).
  await expect(page.getByText(/LIVE/)).toBeVisible();
});
