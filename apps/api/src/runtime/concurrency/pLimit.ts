/**
 * pLimit — a tiny bounded-concurrency pool (no dependency). `pLimit(n)` returns a callable `limit(fn)`
 * that defers `fn` until fewer than `n` tasks are in flight, so a batch of provider calls never exceeds
 * `n` concurrently. It is a PURE scheduling primitive: every scheduled task runs (deterministic
 * completion), execution order is not assumed, and there is no timer / RNG / clock.
 *
 * Used to parallelize the ENERGY-FREE verifier + scorer fan-out (the council/judge/checks/novelty stages
 * debit no `energy.spent` — rule #8 — so running them concurrently is an execution-strategy change only:
 * the emitted events and their advisory-lock-serialized per-run `sequence` are unchanged, rule #2; replay
 * re-reads the persisted log regardless of live execution order, rule #7). The concurrency CEILING is the
 * caller's lever for provider-rate-limit politeness and (for energy-debiting stages) cap headroom.
 */
export type Limiter = {
  <T>(fn: () => Promise<T>): Promise<T>;
  /** Tasks currently in flight (introspection — sizing + tests). */
  activeCount(): number;
  /** Tasks queued behind the concurrency ceiling (introspection — sizing + tests). */
  pendingCount(): number;
};

export function pLimit(concurrency: number): Limiter {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error(`pLimit: concurrency must be a positive integer, got ${String(concurrency)}`);
  }

  let active = 0;
  const queue: Array<() => void> = [];

  const next = (): void => {
    if (active >= concurrency) return;
    const start = queue.shift();
    if (start === undefined) return;
    active += 1;
    start();
  };

  const run = <T>(fn: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const settle = (after: () => void): void => {
        active -= 1;
        next();
        after();
      };
      queue.push(() => {
        // The task is invoked AFTER `next()` has reserved a slot (`active += 1`), so a `fn` that throws
        // synchronously is still caught via the promise chain and releases its slot.
        void Promise.resolve()
          .then(fn)
          .then(
            (value) => settle(() => resolve(value)),
            (error: unknown) => settle(() => reject(error)),
          );
      });
      next();
    });

  return Object.assign(run, {
    activeCount: () => active,
    pendingCount: () => queue.length,
  });
}

/**
 * mapLimit — convenience: run `fn` over every item with at most `concurrency` in flight, preserving
 * input ORDER in the returned array (results[i] corresponds to items[i] regardless of completion order).
 * A rejection propagates (like `Promise.all`); use `pLimit` + `Promise.allSettled` directly when partial
 * failures must be tolerated.
 */
export function mapLimit<I, O>(
  items: readonly I[],
  concurrency: number,
  fn: (item: I, index: number) => Promise<O>,
): Promise<O[]> {
  const limit = pLimit(concurrency);
  return Promise.all(items.map((item, index) => limit(() => fn(item, index))));
}
