// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Run, RunConfig } from '../../../src/data/contracts';
import { FallbackLadderPanel } from '../../../src/components/demo/FallbackLadderPanel';
import type { RungDescriptor } from '../../../src/data/fallbackLadderClient';

/**
 * PD.12 — FallbackLadderPanel (ARCHITECTURE.md §12/§17): the operator's 3-rung demo fallback UI. On mount
 * it fetches GET /demo/fallback-ladder (injected runClient — no apps/api import, no direct fetch); renders
 * the 3 rungs (low-cap-live · prepared · replay); the operator selects a rung; Start posts the active
 * rung's config (low-cap-live → startRun with the lowered caps over the prepared base · prepared → the
 * prepared runConfig · replay → onReplay(replayRunId)). Read-only over the route + the one POST command
 * (rule #2); encodes each rung with shape+label, never color alone (§12).
 */

afterEach(() => cleanup());

const PREPARED_CONFIG: RunConfig = {
  seed: 'prepared scenario',
  enabledSubtypes: ['cross_domain_transfer'],
  caps: {
    maxPopulation: 20,
    maxGenerations: 10,
    energyBudget: 100_000,
    maxSpawnDepth: 5,
    maxToolCalls: 200,
    wallClockTimeoutMs: 600_000,
  },
  modelProfile: 'default',
  scoringPolicyVersion: 'scoring-v1',
  rngSeed: 0,
};
const LOW_CAPS = { ...PREPARED_CONFIG.caps, maxPopulation: 3, maxGenerations: 2 };

const RUNGS: RungDescriptor[] = [
  { kind: 'low-cap-live', mode: 'live', caps: LOW_CAPS },
  { kind: 'prepared', mode: 'live', runConfig: PREPARED_CONFIG },
  { kind: 'replay', mode: 'replay', replayRunId: 'demo-recorded-001' },
];

function makeClient(rungs: RungDescriptor[] | Error = RUNGS) {
  const startedRun = { id: 'run_started' } as unknown as Run;
  return {
    getFallbackLadder: vi.fn(() =>
      rungs instanceof Error ? Promise.reject(rungs) : Promise.resolve(rungs),
    ),
    startRun: vi.fn<(config: RunConfig, opts?: { idempotencyKey?: string }) => Promise<Run>>(() =>
      Promise.resolve(startedRun),
    ),
  };
}

describe('FallbackLadderPanel — operator 3-rung demo fallback (spec §12/§17)', () => {
  // §17 — fetches + renders all 3 rungs (low-cap-live · prepared · replay), each labeled.
  it('fallback_ladder_panel_renders_three_rungs', async () => {
    render(<FallbackLadderPanel runClient={makeClient()} onReplay={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/low-cap-live/i)).toBeTruthy());
    expect(screen.getByText(/prepared/i)).toBeTruthy();
    expect(screen.getByText(/replay/i)).toBeTruthy();
  });

  // §17 — selecting the prepared rung + Start POSTs the prepared runConfig (the full config verbatim).
  it('fallback_ladder_panel_starts_prepared_rung', async () => {
    const client = makeClient();
    render(<FallbackLadderPanel runClient={client} onReplay={vi.fn()} />);
    await waitFor(() => screen.getByText(/prepared/i));
    fireEvent.click(screen.getByRole('button', { name: /select prepared/i }));
    fireEvent.click(screen.getByRole('button', { name: /^start/i }));
    await waitFor(() => expect(client.startRun).toHaveBeenCalledTimes(1));
    expect(client.startRun.mock.calls[0]![0]).toEqual(PREPARED_CONFIG);
  });

  // §17/§5 — the low-cap-live rung Starts with the LOWERED caps over the prepared base (the lowered demo run).
  it('fallback_ladder_panel_starts_low_cap_live_with_lowered_caps', async () => {
    const client = makeClient();
    render(<FallbackLadderPanel runClient={client} onReplay={vi.fn()} />);
    await waitFor(() => screen.getByText(/low-cap-live/i));
    fireEvent.click(screen.getByRole('button', { name: /select low-cap-live/i }));
    fireEvent.click(screen.getByRole('button', { name: /^start/i }));
    await waitFor(() => expect(client.startRun).toHaveBeenCalledTimes(1));
    const posted = client.startRun.mock.calls[0]![0] as RunConfig;
    expect(posted.caps.maxPopulation).toBe(3); // lowered caps applied
    expect(posted.caps.maxGenerations).toBe(2);
  });

  // §17 — the replay rung does NOT POST a run; it hands the replay runId to the shell (mounts the replay).
  it('fallback_ladder_panel_replay_rung_mounts_replay', async () => {
    const client = makeClient();
    const onReplay = vi.fn();
    render(<FallbackLadderPanel runClient={client} onReplay={onReplay} />);
    await waitFor(() => screen.getByText(/replay/i));
    fireEvent.click(screen.getByRole('button', { name: /select replay/i }));
    fireEvent.click(screen.getByRole('button', { name: /^start/i }));
    await waitFor(() => expect(onReplay).toHaveBeenCalledWith('demo-recorded-001'));
    expect(client.startRun).not.toHaveBeenCalled(); // replay mounts, never POSTs a new run
  });
});
