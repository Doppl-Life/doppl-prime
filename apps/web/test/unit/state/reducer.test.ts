import { describe, expect, it } from 'vitest';
import { applyEvent, emptyViewState, foldEvents } from '../../../src/state/reducer';
import { FAILURE_EVENT_FIXTURE_TYPES, makeEvent } from '../../fixtures/events';

describe('run-store reducer — sequence-keyed view-state fold', () => {
  // spec(§12): events fold into view state keyed by sequence; each entity reflects its latest event.
  it('test_folds_events_keyed_by_sequence', () => {
    const state = foldEvents([
      makeEvent(0, 'run.started'),
      makeEvent(1, 'candidate.created', { candidateId: 'cand_1' }),
      makeEvent(2, 'critic.reviewed', { candidateId: 'cand_1' }),
    ]);
    expect(state.lastSequence).toBe(2);
    expect(state.entities['run_1']?.status).toBe('run.started');
    expect(state.entities['cand_1']?.status).toBe('critic.reviewed'); // latest event wins
    expect(state.entities['cand_1']?.kind).toBe('candidate');
  });

  // spec(§12): folding is idempotent by sequence — re-applying a seen sequence is a no-op; folding
  // the same events twice equals folding once (no double-count).
  it('test_refold_idempotent_by_sequence', () => {
    const events = [
      makeEvent(0, 'run.started'),
      makeEvent(1, 'candidate.created', { candidateId: 'cand_1' }),
    ];
    const once = foldEvents(events);
    const twice = foldEvents(events, once);
    expect(twice).toEqual(once);
    expect(foldEvents([...events, ...events])).toEqual(once);
    // re-applying a single already-seen envelope returns the same state reference.
    expect(applyEvent(once, events[0]!)).toBe(once);
  });

  // spec(REQ-O-002): each of the 7 failure / terminal event types is retained + surfaced, not dropped.
  it('test_failure_events_retained_and_surfaced', () => {
    const events = FAILURE_EVENT_FIXTURE_TYPES.map((type, i) => makeEvent(i, type));
    const state = foldEvents(events);
    expect(state.failures.map((f) => f.type)).toEqual([...FAILURE_EVENT_FIXTURE_TYPES]);
    // a non-failure event is not added to the failures list.
    const withOk = foldEvents([makeEvent(7, 'fitness.scored', { candidateId: 'cand_1' })], state);
    expect(withOk.failures).toHaveLength(FAILURE_EVENT_FIXTURE_TYPES.length);
  });

  // spec(§12): fold is mode-independent — foldEvents takes no mode and produces no `mode` field, so
  // live-sourced and replay-sourced events fold identically (mode is carried by the store, not folded).
  it('test_live_and_replay_fold_identically', () => {
    const events = [
      makeEvent(0, 'run.started'),
      makeEvent(1, 'generation.started', { generationId: 'gen_1' }),
      makeEvent(2, 'candidate.created', { candidateId: 'cand_1' }),
    ];
    const a = foldEvents(events);
    const b = foldEvents(events);
    expect(a).toEqual(b);
    expect(Object.keys(a)).not.toContain('mode');
    expect(emptyViewState.lastSequence).toBeNull();
  });
});
