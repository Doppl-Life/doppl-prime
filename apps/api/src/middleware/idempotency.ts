/**
 * Idempotency-key dedup for the REST write path (ARCHITECTURE.md §11). Maps an operator-supplied
 * `Idempotency-Key` to the run it created, so a repeated POST /runs with the same key returns the
 * SAME run rather than starting a second one.
 *
 * MVP: in-memory, single-process (fits §5 "single in-process worker"). A persisted / event-keyed
 * dedup (for a hosted/multi-process deployment) is a recorded carry-forward hardening, not this slice.
 */
export interface IdempotencyStore {
  get(key: string): string | undefined;
  set(key: string, runId: string): void;
}

export function createIdempotencyStore(): IdempotencyStore {
  const map = new Map<string, string>();
  return {
    get: (key) => map.get(key),
    set: (key, runId) => {
      // first-writer-stable: a key binds to the run it first created.
      if (!map.has(key)) map.set(key, runId);
    },
  };
}
