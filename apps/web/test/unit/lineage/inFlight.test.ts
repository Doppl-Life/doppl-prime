import { describe, expect, it } from 'vitest';
import { deriveInFlight } from '../../../src/lineage/inFlight';
import { makeEvent } from '../../fixtures/events';

describe('deriveInFlight — pure op-start↔completion fold (the P7.2-deferred in-flight derivation)', () => {
  // spec(§4/§12): an operation-start marker with no paired completion marks its entity working; the
  // completion clears it; the activity feed lists start→finish.
  it('test_inflight_marks_node_on_unpaired_marker', () => {
    const started = [makeEvent(1, 'critic.review_started', { candidateId: 'cand_0' })];
    const s1 = deriveInFlight(started);
    expect(s1.workingEntityIds.has('cand_0')).toBe(true);
    expect(s1.feed).toHaveLength(1);
    expect(s1.feed[0]).toMatchObject({
      entityId: 'cand_0',
      operation: 'review',
      status: 'active',
      startSequence: 1,
    });

    const paired = [...started, makeEvent(2, 'critic.reviewed', { candidateId: 'cand_0' })];
    const s2 = deriveInFlight(paired);
    expect(s2.workingEntityIds.has('cand_0')).toBe(false); // completion cleared it
    expect(s2.feed).toHaveLength(1);
    expect(s2.feed[0]).toMatchObject({ status: 'finished', endSequence: 2 });
  });

  // judge.review_started has NO sv2 completion (judge.reviewed is sv3/P0.16) → stays in-flight; this
  // is the documented sv2 behavior, folded into the sv3 demo→cody reconcile.
  it('test_inflight_judge_has_no_sv2_completion', () => {
    const s = deriveInFlight([makeEvent(1, 'judge.review_started', { candidateId: 'cand_0' })]);
    expect(s.workingEntityIds.has('cand_0')).toBe(true);
    expect(s.feed[0]).toMatchObject({ operation: 'judge', status: 'active' });
  });

  // spec(§12): once the run has TERMINATED, nothing is in flight — an operation start left unpaired (no
  // completion event was ever emitted) is stale, not live, so the working set is cleared (no perpetual
  // "working…" on a finished run). Replay-safe: the terminal event must be present in the prefix.
  it('test_inflight_cleared_when_run_terminated', () => {
    const open = [makeEvent(1, 'critic.review_started', { candidateId: 'cand_0' })];
    expect(deriveInFlight(open).workingEntityIds.has('cand_0')).toBe(true); // live: still working
    const terminated = [...open, makeEvent(2, 'run.completed')];
    expect(deriveInFlight(terminated).workingEntityIds.size).toBe(0); // run ended → nothing working
  });

  // spec(§4 sequence sole ordering): the derivation is a pure fold over `sequence` — input array order
  // and `occurredAt` are irrelevant, so replay reproduces the identical liveness (no wall-clock).
  it('test_inflight_replay_equivalent', () => {
    const stream = [
      makeEvent(1, 'critic.review_started', { candidateId: 'cand_0' }),
      makeEvent(2, 'check.started', { candidateId: 'cand_0' }),
      makeEvent(3, 'critic.reviewed', { candidateId: 'cand_0' }),
      makeEvent(4, 'check.completed', { candidateId: 'cand_0' }),
      makeEvent(5, 'novelty.scoring_started', { candidateId: 'cand_0' }),
    ];
    const forward = deriveInFlight(stream);
    // scrambled array order → identical (sequence is the sole ordering key).
    const scrambled = deriveInFlight([stream[4]!, stream[0]!, stream[3]!, stream[1]!, stream[2]!]);
    expect(scrambled).toEqual(forward);
    // occurredAt inverted (descending) while sequence ascending → still identical.
    const inverted = stream.map((e) => ({
      ...e,
      occurredAt: `2026-06-20T12:00:${String(60 - e.sequence).padStart(2, '0')}.000Z`,
    }));
    expect(deriveInFlight(inverted)).toEqual(forward);
    // review + check finished; scoring left unpaired → cand_0 still working.
    expect(forward.workingEntityIds.has('cand_0')).toBe(true);
    expect(forward.feed.filter((f) => f.status === 'finished')).toHaveLength(2);
  });
});
