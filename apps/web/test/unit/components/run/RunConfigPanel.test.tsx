// @vitest-environment happy-dom
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RunConfig } from '@doppl/contracts';
import { RunConfigPanel } from '../../../../src/components/run/RunConfigPanel';
import {
  DEFAULT_FORM,
  type RunConfigFormValues,
} from '../../../../src/components/run/runConfigForm';

const RUN_DIR = resolve(process.cwd(), 'src/components/run');
// PD.16 — POST /runs returns the command shape { runId }, not a full Run; the panel passes it through.
const STARTED = { runId: 'run_started' };

const validForm = (): RunConfigFormValues => ({
  ...DEFAULT_FORM,
  seed: 'Find a non-obvious technique transfer for last-mile vaccine delivery.',
});

afterEach(() => cleanup()); // unmount between tests so screen queries don't see prior renders

/** A fake runClient exposing only startRun, recording (config, opts) per call. */
function fakeStartClient() {
  const calls: { config: RunConfig; opts: { idempotencyKey?: string } | undefined }[] = [];
  return {
    client: {
      startRun: (config: RunConfig, opts?: { idempotencyKey?: string }) => {
        calls.push({ config, opts });
        return Promise.resolve(STARTED);
      },
    },
    calls,
  };
}

describe('RunConfigPanel — operator run-config panel', () => {
  // spec(§11): Start issues the idempotent POST /runs (startRun) with an idempotency key, reflects
  // the returned run identity; a duplicate submit does NOT start a second run.
  it('test_start_issues_idempotent_post_runs', async () => {
    const { client, calls } = fakeStartClient();
    const onStarted = vi.fn();
    render(<RunConfigPanel runClient={client} onStarted={onStarted} initialValues={validForm()} />);
    const start = screen.getByRole('button', { name: /start/i });
    fireEvent.click(start);
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.opts?.idempotencyKey).toBeTruthy();
    expect(onStarted).toHaveBeenCalledWith(STARTED);
    // duplicate submit (post-start) doesn't create a second run.
    fireEvent.click(start);
    expect(calls).toHaveLength(1);
  });

  // spec(§12): invalid settings produce inline, programmatically-associated field errors + block submit.
  it('test_invalid_settings_inline_accessible_errors', () => {
    const { client, calls } = fakeStartClient();
    render(<RunConfigPanel runClient={client} initialValues={{ ...validForm(), seed: '' }} />);
    fireEvent.click(screen.getByRole('button', { name: /start/i }));
    const seedInput = screen.getByLabelText(/seed prompt/i);
    expect(seedInput.getAttribute('aria-invalid')).toBe('true');
    const describedBy = seedInput.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy ?? '')?.textContent).toBeTruthy();
    expect(calls).toHaveLength(0); // submission blocked
  });

  // spec(_adherence): no raw hex / no raw px in the component (tokens via var() only).
  it('test_no_raw_hex_or_px', () => {
    const files = readdirSync(RUN_DIR).filter((n) => n.endsWith('.ts') || n.endsWith('.tsx'));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const src = readFileSync(`${RUN_DIR}/${f}`, 'utf8');
      expect(src, `${f} contains a raw hex color`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(src, `${f} contains a raw px value`).not.toMatch(/\b\d+px\b/);
    }
  });

  // spec(rule #9): the panel imports nothing from apps/api.
  it('test_no_apps_api_import', () => {
    const files = readdirSync(RUN_DIR).filter((n) => n.endsWith('.ts') || n.endsWith('.tsx'));
    for (const f of files) {
      const src = readFileSync(`${RUN_DIR}/${f}`, 'utf8');
      expect(src).not.toMatch(/from\s+['"][^'"]*apps\/api/);
      expect(src).not.toMatch(/@doppl\/api/);
    }
  });
});
