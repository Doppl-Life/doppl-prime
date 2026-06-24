// @vitest-environment happy-dom
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RunCaps, RunConfig } from '@doppl/contracts';
import { RunConfigPanel } from '../../../../src/components/run/RunConfigPanel';
import {
  DEFAULT_FORM,
  type RunConfigFormValues,
} from '../../../../src/components/run/runConfigForm';

const RUN_DIR = resolve(process.cwd(), 'src/components/run');
// PD.16 — POST /runs returns the command shape { runId }, not a full Run; the panel passes it through.
const STARTED = { runId: 'run_started' };
// PD.18 — a low .env cap ceiling (GET /config/caps) that clamps the over-ceiling DEFAULT_FORM caps.
const LOW_MAXIMA: RunCaps = {
  maxPopulation: 12,
  maxGenerations: 6,
  energyBudget: 1000,
  maxSpawnDepth: 4,
  maxToolCalls: 80,
  wallClockTimeoutMs: 480_000,
};

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
      // PD.18 — default to a failed maxima fetch → the static CAP_CEILING fallback (keeps these tests'
      // ceiling behavior unchanged + no mount state-update). The clamp test injects a resolving one.
      getCapMaxima: () => Promise.reject(new Error('test: no maxima')),
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

  // PD.18 — the form fetches GET /config/caps on mount + clamps its cap inputs (max + value) to the REAL
  // maxima, so a low .env ceiling no longer leaves an over-ceiling default that 422s on submit.
  it('run_config_form_clamps_to_fetched_maxima', async () => {
    const client = {
      startRun: () => Promise.resolve(STARTED),
      getCapMaxima: () => Promise.resolve(LOW_MAXIMA),
    };
    render(<RunConfigPanel runClient={client} />);
    const pop = (await screen.findByLabelText(/population/i)) as HTMLInputElement;
    await waitFor(() => expect(pop.value).toBe('12')); // DEFAULT_FORM 18 → 12 (clamped to the fetched max)
    expect(pop.getAttribute('max')).toBe('12');
    const energy = screen.getByLabelText(/energy budget/i) as HTMLInputElement;
    expect(energy.value).toBe('1000'); // 12000 → 1000
  });

  // PD.18 — a failed maxima fetch falls back to the static CAP_CEILING (the form never blocks).
  it('run_config_form_falls_back_on_fetch_failure', async () => {
    const client = {
      startRun: () => Promise.resolve(STARTED),
      getCapMaxima: () => Promise.reject(new Error('network')),
    };
    render(<RunConfigPanel runClient={client} />);
    const pop = (await screen.findByLabelText(/population/i)) as HTMLInputElement;
    await waitFor(() => expect(pop.getAttribute('max')).toBe('20')); // static fallback
    expect(pop.value).toBe('18'); // DEFAULT_FORM value unchanged (no clamp)
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

  // FV.3 — the FB run-controls thread into the started RunConfig: a selected mutagen operator + an engaged
  // diverge/converge dial reach startRun (recorded == what the operator set). Both bias GENERATION only.
  it('test_fb_controls_thread_into_started_run', async () => {
    const { client, calls } = fakeStartClient();
    render(<RunConfigPanel runClient={client} initialValues={validForm()} />);
    fireEvent.click(screen.getByLabelText('breakthrough')); // select an operator
    fireEvent.click(screen.getByLabelText('polymath'));
    const dial = screen.getByLabelText(/diverge converge dial/i);
    fireEvent.change(dial, { target: { value: '0.6' } }); // engage the dial (diverge)
    fireEvent.click(screen.getByRole('button', { name: /start/i }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.config.generationOperators).toEqual(['breakthrough', 'polymath']);
    expect(calls[0]?.config.generationBias).toBeCloseTo(0.6, 10);
  });

  // FV.3 — a default (untouched) launcher start carries NO FB controls (byte-identical to a pre-FB run);
  // the dial + operators are opt-in (rule #6 — a default run exposes no generation bias).
  it('test_default_start_omits_fb_controls', async () => {
    const { client, calls } = fakeStartClient();
    render(<RunConfigPanel runClient={client} initialValues={validForm()} />);
    fireEvent.click(screen.getByRole('button', { name: /start/i }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.config.generationOperators).toBeUndefined();
    expect(calls[0]?.config.generationBias).toBeUndefined();
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
