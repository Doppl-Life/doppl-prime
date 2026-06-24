// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { S1LauncherScreen } from '../../../src/routes/S1LauncherScreen';
import type { RunClient } from '../../../src/data/runClient';
import type { ProblemSet } from '../../../src/data/operatorPromptClient';

afterEach(() => cleanup());

const STARTED = { runId: 'run_new' };
const PROBLEM_SETS: ProblemSet[] = [
  {
    id: 'ps_1',
    title: 'Last-mile vaccine delivery',
    prompt: 'Find a non-obvious transfer for vaccine logistics.',
  },
  {
    id: 'ps_2',
    title: 'Urban heat islands',
    prompt: 'Cool a dense city block without active power.',
  },
];

function fakeClient(over: Partial<RunClient> = {}): RunClient {
  return {
    getProblemSets: vi.fn(() => Promise.resolve(PROBLEM_SETS)),
    getCapMaxima: vi.fn(() => Promise.reject(new Error('test: static ceiling'))),
    startRun: vi.fn(() => Promise.resolve(STARTED)),
    ...over,
  } as unknown as RunClient;
}

describe('S1LauncherScreen — S1 run launcher (FV.3)', () => {
  // spec(§11/§12): getProblemSets on mount → a quick-pick per prepared problem; picking one prefills the seed.
  it('test_loads_problem_sets_and_pick_prefills_seed', async () => {
    const client = fakeClient();
    render(<S1LauncherScreen runClient={client} onStarted={vi.fn()} />);
    expect(client.getProblemSets).toHaveBeenCalled();
    const pick = await screen.findByRole('button', { name: 'Last-mile vaccine delivery' });
    fireEvent.click(pick);
    const seed = (await screen.findByLabelText(/seed prompt/i)) as HTMLTextAreaElement;
    await waitFor(() => expect(seed.value).toBe(PROBLEM_SETS[0]!.prompt));
  });

  // FV.3 — the FB run-controls are present on the launcher (the operator picker + the diverge/converge dial).
  it('test_fb_controls_render', async () => {
    render(<S1LauncherScreen runClient={fakeClient()} onStarted={vi.fn()} />);
    expect(await screen.findByLabelText('breakthrough')).toBeTruthy(); // a mutagen operator (FB.3)
    expect(screen.getByLabelText(/diverge converge dial/i)).toBeTruthy(); // the dial (FB.4)
  });

  // spec(DS honesty): an empty/failed problem-sets fetch still allows a freeform start (never a dead screen).
  it('test_freeform_start_when_no_problem_sets', async () => {
    const client = fakeClient({ getProblemSets: vi.fn(() => Promise.resolve([])) });
    const onStarted = vi.fn();
    render(<S1LauncherScreen runClient={client} onStarted={onStarted} />);
    const seed = (await screen.findByLabelText(/seed prompt/i)) as HTMLTextAreaElement;
    fireEvent.change(seed, { target: { value: 'a freeform problem to evolve' } });
    fireEvent.click(screen.getByRole('button', { name: /start/i }));
    await waitFor(() => expect(client.startRun).toHaveBeenCalled());
    expect(onStarted).toHaveBeenCalledWith(STARTED);
  });
});
