import { describe, expect, test } from 'vitest';
import { mapLimit, pLimit } from '../../../../src/runtime/concurrency/pLimit';

/**
 * pLimit — a bounded-concurrency pool: never more than `n` tasks in flight, every task runs, results in
 * call order, a rejection isolates to its own call. The foundation for the energy-free verifier/scorer
 * parallelization (rule #8 — concurrency is execution-strategy only; the emitted events + their
 * advisory-locked sequence are unchanged, rule #2/#7).
 */
describe('pLimit — bounded concurrency pool', () => {
  test('never exceeds the concurrency ceiling', async () => {
    const limit = pLimit(2);
    let active = 0;
    let peak = 0;
    const task = (): Promise<void> => {
      active += 1;
      peak = Math.max(peak, active);
      return new Promise<void>((resolve) =>
        setTimeout(() => {
          active -= 1;
          resolve();
        }, 5),
      );
    };
    await Promise.all(Array.from({ length: 8 }, () => limit(task)));
    expect(peak).toBe(2); // 8 tasks, ceiling 2 → never more than 2 concurrent
    expect(limit.activeCount()).toBe(0);
    expect(limit.pendingCount()).toBe(0);
  });

  test('runs every task and resolves values in call order', async () => {
    const limit = pLimit(3);
    const out = await Promise.all([1, 2, 3, 4, 5].map((n) => limit(() => Promise.resolve(n * 10))));
    expect(out).toEqual([10, 20, 30, 40, 50]);
  });

  test('a rejection isolates to its own call — others still complete (allSettled)', async () => {
    const limit = pLimit(2);
    const settled = await Promise.allSettled([
      limit(() => Promise.resolve('a')),
      limit(() => Promise.reject(new Error('boom'))),
      limit(() => Promise.resolve('c')),
    ]);
    expect(settled.map((s) => s.status)).toEqual(['fulfilled', 'rejected', 'fulfilled']);
  });

  test('a synchronously-throwing fn rejects + releases its slot (pool keeps draining)', async () => {
    const limit = pLimit(1);
    const a = await limit(() => Promise.resolve('a')).catch(() => 'caught');
    const b = await limit(() => {
      throw new Error('sync');
    }).catch(() => 'caught');
    const c = await limit(() => Promise.resolve('c'));
    expect([a, b, c]).toEqual(['a', 'caught', 'c']);
    expect(limit.activeCount()).toBe(0);
  });

  test('rejects a non-positive / non-integer concurrency', () => {
    expect(() => pLimit(0)).toThrow();
    expect(() => pLimit(-1)).toThrow();
    expect(() => pLimit(1.5)).toThrow();
  });

  test('mapLimit preserves input order regardless of completion order', async () => {
    // item 0 finishes LAST (longest delay) yet must occupy results[0].
    const out = await mapLimit(
      [30, 5, 10],
      3,
      (ms, i) => new Promise<string>((resolve) => setTimeout(() => resolve(`${i}:${ms}`), ms)),
    );
    expect(out).toEqual(['0:30', '1:5', '2:10']);
  });
});
