import type { EventStore, RunEventRow } from '../event-store';

/**
 * The replay-only read surface (KEY SAFETY RULE #7). Replay reconstructs a run PURELY from the
 * persisted, ordered `run_events`: this reader reads via the event store's `readByRun` (the ordered
 * read) and NOTHING else — no model / web / embedding provider is reachable from here. The
 * `schemaVersion ≤ current` gate is enforced downstream in the fold (`buildProjection`, reused via
 * `buildReplaySummary`), not duplicated here, so the gate runs on the replay path without a second copy.
 */
export interface ReplayReader {
  /** Read a run's persisted, ordered events (the only input replay is allowed to consume). */
  read(runId: string): Promise<RunEventRow[]>;
}

export function createReplayReader(store: Pick<EventStore, 'readByRun'>): ReplayReader {
  return {
    read(runId: string): Promise<RunEventRow[]> {
      return store.readByRun(runId);
    },
  };
}
