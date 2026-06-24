import {
  buildProjection,
  type ProjectionReducer,
  type RunEventRow,
  type WatermarkedProjection,
} from './projection-builder';
import { emptyCurrentState, type CurrentState } from './reducers/state';
import { lifecycleReducer } from './reducers/lifecycle';
import { entitiesReducer } from './reducers/entities';
import { lineageReducer } from './reducers/lineage';
import { winnerReducer } from './reducers/winner';

/**
 * The concrete current-state projection (ARCHITECTURE.md §9), built ON TOP of P6.1's `buildProjection`
 * — a reducer is INJECTED into the generic ordered fold; this module never re-folds by hand. It
 * composes the per-concern reducers (lifecycle status · high-traffic entity rows · lineage edges +
 * cull) into one reducer over the closed `RunEventType` stream. Rows are keyed by id + set (idempotent
 * re-fold); it imports no model/web/embedding provider (rule #7 — folds purely from the persisted log).
 */

export type {
  CurrentState,
  RunRow,
  GenerationRow,
  AgenomeRow,
  LineageEdgeRow,
} from './reducers/state';
export { emptyCurrentState } from './reducers/state';

const REDUCERS: ReadonlyArray<ProjectionReducer<CurrentState>> = [
  lifecycleReducer,
  entitiesReducer,
  lineageReducer,
  // PD.11 — appended LAST so the candidate row is materialized when `run.completed.finalIdeaRef` folds.
  winnerReducer,
];

/** The composed current-state reducer: every per-concern reducer runs per event; irrelevant events
 * fold to a no-op (each reducer returns state unchanged for types it doesn't handle). */
export function currentStateReducer(state: CurrentState, event: RunEventRow): CurrentState {
  return REDUCERS.reduce((acc, reducer) => reducer(acc, event), state);
}

/** Convenience: fold a run's events into a watermark-tagged current-state via P6.1's `buildProjection`. */
export function buildCurrentState(
  events: readonly RunEventRow[],
): WatermarkedProjection<CurrentState> {
  return buildProjection(events, currentStateReducer, emptyCurrentState());
}
