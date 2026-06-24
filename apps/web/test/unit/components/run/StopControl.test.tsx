// @vitest-environment happy-dom
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RunEventType } from '@doppl/contracts';
import { StopControl } from '../../../../src/components/run/StopControl';
import type { StopRunResult } from '../../../../src/data/runClient';
import { createRunStore } from '../../../../src/state/runStore';
import { foldEvents } from '../../../../src/state/reducer';
import { makeEvent } from '../../../fixtures/events';

const RUN_DIR = resolve(process.cwd(), 'src/components/run');
const RUN_ID = 'run_1';
// PD.16 — POST /runs/:id/stop returns the command wrapper (202 {runId,stopRequested}), not a full Run.
const STOPPED: StopRunResult = { runId: RUN_ID, stopRequested: true };

afterEach(() => cleanup()); // unmount between tests so screen queries don't see prior renders

/** A run store seeded with the given run-level event types (folded in order). The store's own
 *  runClient is irrelevant — StopControl only reads getState/subscribe + issues its OWN stopRun. */
function makeStore(types: RunEventType[]) {
  const events = types.map((t, i) => makeEvent(i, t));
  return createRunStore({ runId: RUN_ID, runClient: {} as never, initial: foldEvents(events) });
}

/** A deferred stopRun fake: records calls, lets the test resolve/reject the in-flight command. */
function deferredStopClient() {
  const calls: string[] = [];
  let pending: { resolve: (r: StopRunResult) => void; reject: (e: unknown) => void } | null = null;
  const stopRun = vi.fn((runId: string) => {
    calls.push(runId);
    return new Promise<StopRunResult>((resolve, reject) => {
      pending = { resolve, reject };
    });
  });
  return {
    client: { stopRun },
    calls,
    rejectLast: async (e: unknown = new Error('network')) => {
      await act(async () => {
        pending?.reject(e);
        await Promise.resolve();
      });
    },
  };
}

const btn = () => screen.getByRole('button');

describe('StopControl — operator run-stop control', () => {
  // spec(§11): clicking Stop issues the idempotent POST /runs/:id/stop via runClient.stopRun ONCE
  // per click intent; the handler doesn't re-implement the dedup/terminal guard (the API owns it).
  it('test_stop_issues_idempotent_post_stop', async () => {
    const stopRun = vi.fn(() => Promise.resolve(STOPPED));
    const onStopped = vi.fn();
    render(
      <StopControl
        runId={RUN_ID}
        store={makeStore(['run.started'])}
        runClient={{ stopRun }}
        onStopped={onStopped}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /stop run/i }));
    await waitFor(() => expect(stopRun).toHaveBeenCalledTimes(1));
    expect(stopRun).toHaveBeenCalledWith(RUN_ID);
    await waitFor(() => expect(onStopped).toHaveBeenCalledWith(STOPPED));
  });

  // spec(§11): the control disables + relabels ONLY from store state — the run-terminal event types
  // {run.completed,run.failed,run.stopped}; a non-terminal status keeps it enabled "Stop run".
  it('test_terminal_state_disables_from_store', () => {
    const stopRun = vi.fn(() => Promise.resolve(STOPPED));
    for (const term of ['run.completed', 'run.stopped', 'run.failed'] as const) {
      const { unmount } = render(
        <StopControl
          runId={RUN_ID}
          store={makeStore(['run.started', term])}
          runClient={{ stopRun }}
        />,
      );
      expect((btn() as HTMLButtonElement).disabled, term).toBe(true);
      expect(btn().textContent, term).not.toMatch(/^stop run$/i); // relabeled to the terminal state
      unmount();
    }
    render(
      <StopControl runId={RUN_ID} store={makeStore(['run.configured'])} runClient={{ stopRun }} />,
    );
    const enabled = screen.getByRole('button', { name: /stop run/i });
    expect((enabled as HTMLButtonElement).disabled).toBe(false);
  });

  // spec(_never-optimistic): after a click, before any run.stopped event folds in, the control does
  // NOT show terminal — only a local "Stopping…" disabled state; the authoritative terminal arrives
  // ONLY when the folded run.stopped event advances the store.
  it('test_no_optimistic_terminal', async () => {
    const d = deferredStopClient();
    const store = makeStore(['run.started']);
    render(<StopControl runId={RUN_ID} store={store} runClient={d.client} />);
    fireEvent.click(screen.getByRole('button', { name: /stop run/i }));
    await waitFor(() => expect(btn().textContent).toMatch(/stopping/i));
    expect((btn() as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText(/run stopped/i)).toBeNull(); // not terminal yet (no folded event)
    // the authoritative terminal flips the control only on the folded run.stopped event.
    act(() => store.applyEvent(makeEvent(5, 'run.stopped')));
    await waitFor(() => expect(btn().textContent).toMatch(/run stopped/i));
  });

  // spec(REQ-O-003): a click when already terminal, or a second click while a stop is in flight,
  // does not error and does not issue a second/contradictory command.
  it('test_repeated_click_after_terminal_safe', async () => {
    const stopRun = vi.fn(() => Promise.resolve(STOPPED));
    const { unmount } = render(
      <StopControl
        runId={RUN_ID}
        store={makeStore(['run.started', 'run.stopped'])}
        runClient={{ stopRun }}
      />,
    );
    fireEvent.click(btn()); // already terminal → no-op, no throw
    expect(stopRun).not.toHaveBeenCalled();
    unmount();

    const d = deferredStopClient();
    render(<StopControl runId={RUN_ID} store={makeStore(['run.started'])} runClient={d.client} />);
    fireEvent.click(screen.getByRole('button', { name: /stop run/i }));
    await waitFor(() => expect(d.calls).toHaveLength(1));
    fireEvent.click(btn()); // now "Stopping…" + disabled → no second command
    expect(d.calls).toHaveLength(1);
  });

  // spec(REQ-F-012/REQ-O-002): issuing stop does not clear/mutate the store's failures[] or entities
  // — preserved partial evidence remains (asserted by reference-equality — the control never writes).
  it('test_stop_is_non_destructive', async () => {
    const stopRun = vi.fn(() => Promise.resolve(STOPPED));
    const store = makeStore(['run.started']);
    act(() => {
      store.applyEvent(makeEvent(1, 'candidate.created', { candidateId: 'cand_1' }));
      store.applyEvent(makeEvent(2, 'provider_call_failed'));
    });
    const before = store.getState();
    expect(before.failures).toHaveLength(1);
    render(<StopControl runId={RUN_ID} store={store} runClient={{ stopRun }} />);
    fireEvent.click(screen.getByRole('button', { name: /stop run/i }));
    await waitFor(() => expect(stopRun).toHaveBeenCalledTimes(1));
    const after = store.getState();
    expect(after.failures).toBe(before.failures); // same ref — untouched
    expect(after.entities).toBe(before.entities); // same ref — untouched
  });

  // spec(§12): a rejected stopRun surfaces an inline, programmatically-associated error (not color-
  // alone); the control stays retry-safe and a retry re-issues the idempotent command.
  it('test_command_failure_accessible_error_retry_safe', async () => {
    const d = deferredStopClient();
    render(<StopControl runId={RUN_ID} store={makeStore(['run.started'])} runClient={d.client} />);
    fireEvent.click(screen.getByRole('button', { name: /stop run/i }));
    await waitFor(() => expect(d.calls).toHaveLength(1));
    await d.rejectLast();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBeTruthy();
    expect(btn().getAttribute('aria-describedby')).toBe(alert.id); // programmatically associated
    expect((btn() as HTMLButtonElement).disabled).toBe(false); // retry-safe
    fireEvent.click(btn());
    await waitFor(() => expect(d.calls).toHaveLength(2)); // retry re-issues the idempotent command
  });

  // spec(rule #6): the control imports nothing from apps/api.
  it('test_no_apps_api_import', () => {
    const files = readdirSync(RUN_DIR).filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const src = readFileSync(`${RUN_DIR}/${f}`, 'utf8');
      expect(src, f).not.toMatch(/from\s+['"][^'"]*apps\/api/);
      expect(src, f).not.toMatch(/@doppl\/api/);
    }
  });
});
