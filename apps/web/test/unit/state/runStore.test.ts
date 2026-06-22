import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createSseStream } from '../../../src/data/sseStream';
import { createRunStore } from '../../../src/state/runStore';
import { FakeEventSource, fakeRunClient, makeEvent } from '../../fixtures/events';

const STATE_DIR = fileURLToPath(new URL('../../../src/state', import.meta.url));

const ALL = [
  makeEvent(0, 'run.started'),
  makeEvent(1, 'candidate.created', { candidateId: 'cand_1' }),
];

describe('runStore — non-authoritative live store over the reducer', () => {
  // spec(§12)/rule #2: the store folds injected sseStream deltas into view state; dropping the stream
  // and resyncing via runClient reaches the same state (SSE is non-authoritative delivery only).
  it('test_store_applies_sse_deltas_non_authoritative', async () => {
    const client = fakeRunClient(() => ALL);
    const store = createRunStore({ runId: 'run_1', runClient: client });

    let source!: FakeEventSource;
    createSseStream({
      url: 'http://x/runs/run_1/stream',
      eventSourceFactory: (u) => (source = new FakeEventSource(u)),
      onEvent: store.applyEvent,
    });
    for (const e of ALL) source.emit(e);
    expect(store.getState().lastSequence).toBe(1);

    // Drop the stream; a fresh store that resyncs from REST reaches the identical view state.
    const fresh = createRunStore({ runId: 'run_1', runClient: client });
    await fresh.resync();
    expect(fresh.getState()).toEqual(store.getState());
  });

  // spec(§12): the store carries a live|replay mode for downstream indicators WITHOUT changing the
  // fold — two stores over the same events have identical view state but distinct mode.
  it('test_store_carries_mode_without_changing_fold', () => {
    const client = fakeRunClient(() => ALL);
    const live = createRunStore({ runId: 'run_1', runClient: client, mode: 'live' });
    const replay = createRunStore({ runId: 'run_1', runClient: client, mode: 'replay' });
    for (const e of ALL) {
      live.applyEvent(e);
      replay.applyEvent(e);
    }
    expect(live.getMode()).toBe('live');
    expect(replay.getMode()).toBe('replay');
    expect(live.getState()).toEqual(replay.getState());
  });

  // spec(§12): subscribers are notified on state change (the panels subscribe to the store).
  it('test_subscribers_notified_on_change', () => {
    const client = fakeRunClient(() => ALL);
    const store = createRunStore({ runId: 'run_1', runClient: client });
    const seen: number[] = [];
    const unsubscribe = store.subscribe((s) => seen.push(s.lastSequence ?? -1));
    store.applyEvent(ALL[0]!);
    store.applyEvent(ALL[1]!);
    unsubscribe();
    store.applyEvent(makeEvent(2, 'run.completed'));
    expect(seen).toEqual([0, 1]); // no notification after unsubscribe
  });

  // spec(rule #9): the state layer imports nothing from apps/api.
  it('test_store_no_apps_api_import', () => {
    const files = readdirSync(STATE_DIR).filter((f) => f.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const src = readFileSync(`${STATE_DIR}/${f}`, 'utf8');
      expect(src).not.toMatch(/from\s+['"][^'"]*apps\/api/);
      expect(src).not.toMatch(/@doppl\/api/);
    }
  });
});
