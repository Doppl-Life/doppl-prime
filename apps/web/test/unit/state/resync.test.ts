import { describe, expect, it, vi } from 'vitest';
import { foldEvents, emptyViewState } from '../../../src/state/reducer';
import { assertValidCursor, pollOnce, resyncFromRest } from '../../../src/state/resync';
import { fakeRunClient, makeEvent } from '../../fixtures/events';

const ALL = [
  makeEvent(0, 'run.started'),
  makeEvent(1, 'candidate.created', { candidateId: 'cand_1' }),
  makeEvent(2, 'critic.reviewed', { candidateId: 'cand_1' }),
  makeEvent(3, 'fitness.scored', { candidateId: 'cand_1' }),
];

describe('resync — sequence-keyed resume + polling fallback', () => {
  // spec(§11): after applying through sequence N, a resync fetch-after-N + apply reaches the same
  // state as an uninterrupted stream / fresh full load.
  it('test_resync_from_last_event_id_reaches_same_state', async () => {
    const fresh = foldEvents(ALL);
    const interrupted = foldEvents(ALL.slice(0, 2)); // through sequence 1
    const client = fakeRunClient((_runId, opts) =>
      ALL.filter((e) => e.sequence > (opts?.sinceSequence ?? -1)),
    );
    const resynced = await resyncFromRest(client, 'run_1', interrupted);
    expect(resynced).toEqual(fresh);
    expect(client.calls[0]?.opts?.sinceSequence).toBe(1); // fetched AFTER the watermark
  });

  // spec(§11): when streaming stalls/fails, a poll via runClient applies new events without losing
  // already-applied state.
  it('test_polling_fallback_preserves_state', async () => {
    const applied = foldEvents(ALL.slice(0, 2)); // through sequence 1
    const client = fakeRunClient(() => [ALL[2]!]); // poll surfaces sequence 2
    const polled = await pollOnce(client, 'run_1', applied);
    expect(polled.lastSequence).toBe(2);
    expect(polled.entities['run_1']?.status).toBe('run.started'); // prior state preserved
    expect(polled.entities['cand_1']?.status).toBe('critic.reviewed'); // new event applied
  });

  // spec(defense-in-depth, P7.1 [low]): a non-integer / negative resync cursor is rejected BEFORE
  // any fetch.
  it('test_since_sequence_cursor_numeric_guarded', async () => {
    expect(() => assertValidCursor(-1)).toThrow();
    expect(() => assertValidCursor(1.5)).toThrow();
    expect(() => assertValidCursor(Number.NaN)).toThrow();
    const getEvents = vi.fn(() => ALL);
    const client = fakeRunClient(getEvents);
    const corrupt = { ...emptyViewState, lastSequence: -5 };
    await expect(resyncFromRest(client, 'run_1', corrupt)).rejects.toThrow();
    expect(getEvents).not.toHaveBeenCalled();
  });
});
