import { describe, expect, it } from 'vitest';
import type { RunEventEnvelope } from '@doppl/contracts';
import { foldAtStep } from '../../../src/routes/replayScrubber';
import { emptyFoldState, foldEvents } from '../../../src/data/sseStream';
import { makeEvent } from '../../fixtures/events';

const events: RunEventEnvelope[] = [
  makeEvent(1, 'run.started'),
  makeEvent(2, 'generation.started'),
  makeEvent(3, 'candidate.created', { candidateId: 'c1' }),
  makeEvent(4, 'fitness.scored', { generationId: 'gen_0' }),
  makeEvent(5, 'run.completed'),
];

describe('foldAtStep — pure prefix fold over persisted events (FV.8)', () => {
  // spec(§12): foldAtStep(events,n) == foldEvents(events.slice(0,n)); n=0 → empty fold, n=len → full fold.
  it('test_fold_at_step_prefix', () => {
    for (let n = 0; n <= events.length; n++) {
      expect(foldAtStep(events, n)).toEqual(foldEvents(events.slice(0, n)));
    }
    expect(foldAtStep(events, 0)).toEqual(emptyFoldState); // n=0 → empty
    expect(foldAtStep(events, events.length)).toEqual(foldEvents(events)); // n=len → full
    // out-of-range n clamps to [0, len] (defensive)
    expect(foldAtStep(events, 99)).toEqual(foldEvents(events));
    expect(foldAtStep(events, -3)).toEqual(emptyFoldState);
  });

  // spec(rule #7 determinism): same (events,n) → equal FoldState; the input is never mutated.
  it('test_fold_at_step_pure_deterministic', () => {
    const before = [...events];
    const a = foldAtStep(events, 3);
    const b = foldAtStep(events, 3);
    expect(a).toEqual(b); // deterministic
    expect(a.events).toHaveLength(3);
    expect(events).toEqual(before); // input untouched
    expect(events).toHaveLength(before.length);
  });
});
