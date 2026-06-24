import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { debounce } from '../../../src/lib/debounce';

/**
 * PD.20 — `debounce` bounds the live-projection re-fetch rate during an SSE event burst (no hammering):
 * rapid calls coalesce into ONE trailing invocation; `cancel()` drops a pending invocation (the
 * Dashboard cancels on unmount / observed-run switch — no setState-after-unmount, no leak).
 */
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('debounce', () => {
  it('coalesces rapid calls into one trailing invocation', () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d();
    d();
    d();
    expect(fn).not.toHaveBeenCalled(); // not fired during the burst
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1); // one trailing call
  });

  it('cancel() drops a pending invocation', () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d();
    d.cancel();
    vi.advanceTimersByTime(500);
    expect(fn).not.toHaveBeenCalled();
  });

  it('re-arms after firing', () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d();
    vi.advanceTimersByTime(100);
    d();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
