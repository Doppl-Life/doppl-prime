// @vitest-environment happy-dom
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OperatorPromptPanel } from '../../../../src/components/demo/OperatorPromptPanel';
import type { ProblemSet } from '../../../../src/data/operatorPromptClient';

/**
 * PD.5b — OperatorPromptPanel BEHAVIOR (the wiring the form/client unit tests + the e2e don't pin in CI
 * when Playwright browsers are unavailable, apps/web L§10): mount→getProblemSets fetch + render options,
 * freeform submit→startDemoRun({seed})→onStarted(run), empty submit→validation-blocked. Mirrors
 * RunConfigPanel.test.tsx (testing-library + a fake runClient).
 */

const DEMO_DIR = resolve(process.cwd(), 'src/components/demo');
const CATALOG: ProblemSet[] = [
  { id: 'demo-1', title: 'Cross-domain transfer demo', prompt: 'Find a cross-domain transfer.' },
];
// PD.16 — POST /runs returns the command shape `{ runId }` (not a full Run); the panel passes it through.
const STARTED = { runId: 'run_demo' };

afterEach(() => cleanup());

function fakeClient(catalog: ProblemSet[] = CATALOG) {
  const starts: { partial: { seed: string }; opts: { idempotencyKey?: string } | undefined }[] = [];
  return {
    client: {
      getProblemSets: () => Promise.resolve(catalog),
      startDemoRun: (partial: { seed: string }, opts?: { idempotencyKey?: string }) => {
        starts.push({ partial, opts });
        return Promise.resolve(STARTED);
      },
    },
    starts,
  };
}

describe('OperatorPromptPanel — demo operator-prompt panel (PD.5b behavior)', () => {
  // mount → fetch the catalog → render the prepared options.
  it('test_fetches_catalog_on_mount', async () => {
    const { client } = fakeClient();
    render(<OperatorPromptPanel runClient={client} />);
    await waitFor(() =>
      expect(screen.getByRole('option', { name: /cross-domain transfer demo/i })).toBeTruthy(),
    );
  });

  // §17 freeform path — type a prompt, submit → startDemoRun POSTs exactly {seed} + an idempotency key,
  // and the started run is handed to the shell via onStarted.
  it('test_freeform_submit_starts_demo_run', async () => {
    const { client, starts } = fakeClient();
    const onStarted = vi.fn();
    render(<OperatorPromptPanel runClient={client} onStarted={onStarted} />);
    fireEvent.click(screen.getByLabelText(/freeform prompt/i));
    fireEvent.change(screen.getByLabelText(/problem prompt/i), { target: { value: 'Design X' } });
    fireEvent.click(screen.getByRole('button', { name: /start demo run/i }));
    await waitFor(() => expect(starts).toHaveLength(1));
    expect(starts[0]?.partial).toEqual({ seed: 'Design X' }); // partial — only the seed
    expect(starts[0]?.opts?.idempotencyKey).toBeTruthy();
    expect(onStarted).toHaveBeenCalledWith(STARTED);
  });

  // fail-closed — an empty freeform submit is blocked (accessible alert), no run started.
  it('test_empty_submit_blocked', async () => {
    const { client, starts } = fakeClient();
    render(<OperatorPromptPanel runClient={client} />);
    // let the mount fetch settle first (no pending async at teardown).
    await waitFor(() => screen.getByRole('option', { name: /cross-domain transfer demo/i }));
    fireEvent.click(screen.getByLabelText(/freeform prompt/i));
    fireEvent.click(screen.getByRole('button', { name: /start demo run/i }));
    expect(screen.getByRole('alert').textContent).toBeTruthy();
    expect(starts).toHaveLength(0);
  });

  // adherence (apps/web L§3) + forbidden #6 — var() tokens only (no raw hex/px) + no apps/api import.
  it('test_no_raw_hex_or_px_and_no_apps_api', () => {
    const files = readdirSync(DEMO_DIR).filter((n) => n.endsWith('.ts') || n.endsWith('.tsx'));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const src = readFileSync(`${DEMO_DIR}/${f}`, 'utf8');
      expect(src, `${f} raw hex`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(src, `${f} raw px`).not.toMatch(/\b\d+px\b/);
      expect(src).not.toMatch(/from\s+['"][^'"]*apps\/api/);
    }
  });
});
