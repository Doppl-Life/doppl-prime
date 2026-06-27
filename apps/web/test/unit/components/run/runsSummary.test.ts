import { describe, expect, it } from 'vitest';
import type { RunSummary } from '../../../../src/data/runClient';
import {
  computeKpis,
  countByFilter,
  dayBucketLabel,
  failedBeforeGenerating,
  filterRuns,
  groupRunsByDay,
  isDefaultSort,
  nextSort,
  normalize,
  relativeTime,
  runFitness,
  sortRuns,
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

  it('runFitness prefers the winner, falls back to the last generation, else null', () => {
    expect(runFitness(run({ winnerFitness: 0.8, fitnessByGeneration: [0.3, 0.5] }))).toBe(0.8);
    expect(runFitness(run({ winnerFitness: null, fitnessByGeneration: [0.3, 0.6] }))).toBe(0.6);
    expect(runFitness(run({ winnerFitness: null, fitnessByGeneration: [] }))).toBeNull();
  });

  it('nextSort toggles direction on the active key and adopts a default dir on a new key', () => {
    expect(nextSort({ key: 'time', dir: 'desc' }, 'time')).toEqual({ key: 'time', dir: 'asc' });
    expect(nextSort({ key: 'time', dir: 'asc' }, 'time')).toEqual({ key: 'time', dir: 'desc' });
    expect(nextSort({ key: 'time', dir: 'desc' }, 'problem')).toEqual({
      key: 'problem',
      dir: 'asc',
    }); // text defaults ascending
    expect(nextSort({ key: 'time', dir: 'desc' }, 'cands')).toEqual({ key: 'cands', dir: 'desc' });
  });

  it('isDefaultSort recognizes only the natural newest-first order', () => {
    expect(isDefaultSort({ key: 'time', dir: 'desc' })).toBe(true);
    expect(isDefaultSort({ key: 'time', dir: 'asc' })).toBe(false);
    expect(isDefaultSort({ key: 'cands', dir: 'desc' })).toBe(false);
  });

  it('sortRuns orders by the chosen key + direction without mutating the input', () => {
    const runs = [
      run({ runId: 'a', candidates: 20, problem: 'Banana', createdAt: '2026-06-25T10:00:00.000Z' }),
      run({ runId: 'b', candidates: 76, problem: 'Apple', createdAt: '2026-06-27T10:00:00.000Z' }),
      run({ runId: 'c', candidates: 51, problem: 'Cherry', createdAt: '2026-06-26T10:00:00.000Z' }),
    ];
    const frozen = JSON.stringify(runs);
    expect(sortRuns(runs, { key: 'cands', dir: 'desc' }).map((r) => r.runId)).toEqual([
      'b',
      'c',
      'a',
    ]);
    expect(sortRuns(runs, { key: 'cands', dir: 'asc' }).map((r) => r.runId)).toEqual([
      'a',
      'c',
      'b',
    ]);
    expect(sortRuns(runs, { key: 'problem', dir: 'asc' }).map((r) => r.runId)).toEqual([
      'b',
      'a',
      'c',
    ]);
    expect(sortRuns(runs, { key: 'time', dir: 'desc' }).map((r) => r.runId)).toEqual([
      'b',
      'c',
      'a',
    ]);
    expect(JSON.stringify(runs)).toBe(frozen); // input untouched (sorts a copy)
  });
});
