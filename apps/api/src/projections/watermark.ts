/**
 * In-memory per-runId watermark cache (P6.1, D4). A cached projection
 * is returned when the caller's watermark check confirms no new events
 * have arrived since it was built. Otherwise the cache entry is
 * invalidated and the caller rebuilds.
 *
 * The cache is keyed by `runId` and stores `{ sequenceThrough, value }`.
 * Callers pass a `currentSequence` (typically the head sequence of the
 * persisted log) so the cache can decide whether to serve cached or
 * rebuild. A cache miss returns `undefined`; a cache hit returns the
 * stored value.
 */

export interface CachedEntry<T> {
  sequenceThrough: number;
  value: T;
}

export interface WatermarkCache<T> {
  /** Returns the cached value when its watermark >= currentSequence; otherwise undefined. */
  get(runId: string, currentSequence: number): T | undefined;
  /** Stores a value with its sequenceThrough watermark. */
  put(runId: string, sequenceThrough: number, value: T): void;
  /** Invalidates one runId. */
  invalidate(runId: string): void;
  /** Invalidates everything. */
  clear(): void;
  /** Inspect the current size — primarily for tests. */
  size(): number;
}

export function createWatermarkCache<T>(): WatermarkCache<T> {
  const store = new Map<string, CachedEntry<T>>();
  return {
    get(runId, currentSequence) {
      const entry = store.get(runId);
      if (!entry) return undefined;
      if (entry.sequenceThrough < currentSequence) {
        store.delete(runId);
        return undefined;
      }
      return entry.value;
    },
    put(runId, sequenceThrough, value) {
      store.set(runId, { sequenceThrough, value });
    },
    invalidate(runId) {
      store.delete(runId);
    },
    clear() {
      store.clear();
    },
    size() {
      return store.size;
    },
  };
}
