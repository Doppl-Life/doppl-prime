import { describe, expect, it } from 'vitest';
import type { RunSummary } from '../../../../src/data/runClient';
import {
  computeKpis,
  countByFilter,
  dayBucketLabel,
  failedBeforeGenerating,
  filterRuns,
  groupRunsByDay,
  normalize,
  relativeTime,
  timeOfDay,
} from '../../../../src/components/run/runsSummary';

const run = (over: Partial<RunSummary>): RunSummary => ({
  runId: 'id',
  status: 'completed',
  sequenceThrough: 1,
  createdAt: '2026-06-26T10:00:00.000Z',
  problem: 'Smooth ER patient flow',
  finalIdeaTitle: 'Yield-managed triage',
  finalIdeaSummary: 'summary',
  generations: 5,
  candidates: 40,
  reproductions: 8,
  culls: 4,
  mutations: 3,
  ...over,
});

const NOW = new Date('2026-06-27T12:00:00.000Z').getTime();

describe('runsSummary', () => {
  it('failedBeforeGenerating is true only for a terminal-failed run with no winner', () => {
    expect(failedBeforeGenerating(run({ status: 'failed', finalIdeaTitle: null }))).toBe(true);
    expect(failedBeforeGenerating(run({ status: 'cancelled', finalIdeaTitle: '' }))).toBe(true);
    // has a winner → not a "before generating" failure
    expect(failedBeforeGenerating(run({ status: 'failed', finalIdeaTitle: 'Idea' }))).toBe(false);
    // still running → not a failure
    expect(failedBeforeGenerating(run({ status: 'running', finalIdeaTitle: null }))).toBe(false);
  });

  it('filterRuns matches status buckets and free-text query', () => {
    const runs = [
      run({ runId: 'a', status: 'running' }),
      run({ runId: 'b', status: 'completed', problem: 'Reduce wait times' }),
      run({ runId: 'c', status: 'failed' }),
    ];
    expect(filterRuns(runs, 'running', '').map((r) => r.runId)).toEqual(['a']);
    expect(filterRuns(runs, 'failed', '').map((r) => r.runId)).toEqual(['c']);
    expect(filterRuns(runs, 'all', 'wait').map((r) => r.runId)).toEqual(['b']);
    expect(filterRuns(runs, 'complete', 'nomatch')).toHaveLength(0);
  });

  it('countByFilter tallies each bucket', () => {
    const runs = [
      run({ status: 'running' }),
      run({ status: 'completed' }),
      run({ status: 'completed' }),
      run({ status: 'failed' }),
    ];
    expect(countByFilter(runs)).toEqual({ all: 4, running: 1, complete: 2, failed: 1 });
  });

  it('computeKpis derives totals, success rate, avg candidates, and running count', () => {
    const runs = [
      run({ status: 'running', candidates: 0 }),
      run({ status: 'completed', candidates: 40 }),
      run({ status: 'completed', candidates: 60 }),
      run({ status: 'failed', candidates: 0 }),
    ];
    const k = computeKpis(runs);
    expect(k.total).toBe(4);
    expect(k.running).toBe(1);
    // decided = 3 (2 completed + 1 failed); success = 2/3 → 67%
    expect(k.successRatePct).toBe(67);
    // avg over producing (completed) runs only: (40 + 60) / 2 = 50
    expect(k.avgCandidates).toBe(50);
  });

  it('relativeTime buckets recent timestamps and falls back to a date past a week', () => {
    expect(relativeTime(null, NOW)).toBe('—');
    expect(relativeTime('2026-06-27T11:59:30.000Z', NOW)).toBe('just now');
    expect(relativeTime('2026-06-27T11:30:00.000Z', NOW)).toBe('30m ago');
    expect(relativeTime('2026-06-27T09:00:00.000Z', NOW)).toBe('3h ago');
    expect(relativeTime('2026-06-25T12:00:00.000Z', NOW)).toBe('2d ago');
  });

  it('dayBucketLabel classifies today/yesterday and groups runs into ordered buckets', () => {
    expect(dayBucketLabel('2026-06-27T08:00:00.000Z', NOW)).toBe('Today');
    expect(dayBucketLabel('2026-06-26T08:00:00.000Z', NOW)).toBe('Yesterday');
    expect(dayBucketLabel(null, NOW)).toBe('Undated');

    const groups = groupRunsByDay(
      [
        run({ runId: 'r1', createdAt: '2026-06-27T09:00:00.000Z' }),
        run({ runId: 'r2', createdAt: '2026-06-27T08:00:00.000Z' }),
        run({ runId: 'r3', createdAt: '2026-06-26T08:00:00.000Z' }),
      ],
      NOW,
    );
    expect(groups.map((g) => g.label)).toEqual(['Today', 'Yesterday']);
    expect(groups[0]!.rows.map((r) => r.index)).toEqual([1, 2]); // global 1-based index preserved
    expect(groups[1]!.rows[0]!.index).toBe(3);
  });

  it('timeOfDay and normalize behave at the edges', () => {
    expect(timeOfDay(null)).toBe('—');
    expect(normalize(0, 0)).toBe(0); // no capacity → empty, never NaN/Infinity
    expect(normalize(40, 80)).toBe(0.5);
    expect(normalize(200, 80)).toBe(1); // clamped to 1
  });
});
