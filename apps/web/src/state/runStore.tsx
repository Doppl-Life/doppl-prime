import {
  type Dispatch,
  type JSX,
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";
import { type RunClient, createRunClient } from "../data/runClient.js";
import { type SseStreamHandle, createSseStream } from "../data/sseStream.js";
import {
  type RunStoreAction,
  type RunStoreState,
  initialRunStoreState,
  runStoreReducer,
} from "./reducer.js";

/**
 * Run store provider + hooks (P7.2). Owns the single typed state shape
 * for the active run, the SSE subscription, and the polling/replay
 * fallback wiring. Components consume state via `useRunStore()` (full
 * state + dispatch) or one of the selector hooks for the panels they
 * power.
 *
 * The provider only opens an SSE stream when a runId is set via
 * `useRunStore().setRunId(...)`. Switching to a different runId closes
 * the previous stream and resets the store.
 */

export interface RunStoreContextValue {
  state: RunStoreState;
  dispatch: Dispatch<RunStoreAction>;
  client: RunClient;
}

const RunStoreContext = createContext<RunStoreContextValue | null>(null);

export interface RunStoreProviderProps {
  children: ReactNode;
  baseUrl?: string;
  /** Inject a client for tests. */
  client?: RunClient;
  /** Optional initial state override (tests). */
  initialState?: RunStoreState;
  /** Disable the SSE auto-subscription (tests). */
  disableLiveStream?: boolean;
}

export function RunStoreProvider(props: RunStoreProviderProps): JSX.Element {
  const client = useMemo(
    () => props.client ?? createRunClient({ baseUrl: props.baseUrl ?? "" }),
    [props.client, props.baseUrl],
  );
  const [state, dispatch] = useReducer(runStoreReducer, props.initialState ?? initialRunStoreState);
  const streamRef = useRef<SseStreamHandle | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: state.sequenceThrough is read for the initial cursor only; live cursor advances through the event handler
  useEffect(() => {
    if (props.disableLiveStream) return;
    if (!state.runId) return;
    if (streamRef.current) {
      streamRef.current.close();
      streamRef.current = null;
    }
    const handle = createSseStream({
      runId: state.runId,
      baseUrl: props.baseUrl ?? "",
      initialLastEventId: state.sequenceThrough,
      client,
      onEvent: (event) => dispatch({ kind: "APPLY_EVENT", event }),
      onModeChange: (mode) => {
        if (mode === "live" || mode === "polling") {
          dispatch({ kind: "SET_MODE", mode });
        }
      },
      onError: (err) => {
        dispatch({
          kind: "RECORD_ERROR",
          sequence: state.sequenceThrough,
          type: err.kind,
          message: JSON.stringify(err.detail),
        });
      },
    });
    streamRef.current = handle;
    return () => {
      handle.close();
      streamRef.current = null;
    };
  }, [state.runId, props.disableLiveStream, props.baseUrl, client]);

  // PD.6: fetch the run detail when a runId is set so the dashboard
  // can label live vs replay vs rehearsal from the server's authoritative
  // runs.mode column. Only dispatch when the server actually returns a
  // mode — absence leaves any test-supplied initial state alone.
  useEffect(() => {
    if (!state.runId) return;
    let cancelled = false;
    void client
      .getRunDetail(state.runId)
      .then((detail) => {
        if (cancelled) return;
        if (detail.runMode !== undefined) {
          dispatch({
            kind: "SET_SERVER_RUN_MODE",
            serverRunMode: detail.runMode,
          });
        }
      })
      .catch(() => {
        // Surfacing is deferred to the panels; absence is non-fatal.
      });
    return () => {
      cancelled = true;
    };
  }, [state.runId, client]);

  const value = useMemo<RunStoreContextValue>(() => ({ state, dispatch, client }), [state, client]);
  return <RunStoreContext.Provider value={value}>{props.children}</RunStoreContext.Provider>;
}

export function useRunStore(): RunStoreContextValue {
  const ctx = useContext(RunStoreContext);
  if (!ctx) throw new Error("useRunStore must be used inside <RunStoreProvider>");
  return ctx;
}

export function useRunState(): RunStoreState {
  return useRunStore().state;
}

export function useLineageState() {
  const state = useRunState();
  return {
    agenomes: state.agenomes,
    candidates: state.candidates,
    criticReviews: state.criticReviews,
    checkResults: state.checkResults,
    fitnessScores: state.fitnessScores,
    sequenceThrough: state.sequenceThrough,
  };
}

export function useFitnessSeries() {
  const state = useRunState();
  return useMemo(() => {
    const byCandidate: Record<string, { candidateId: string; generation: number; total: number }> =
      {};
    for (const f of Object.values(state.fitnessScores)) {
      const candidate = state.candidates[f.candidateId];
      const gen = candidate?.generationId ?? "gen_0";
      byCandidate[f.id] = {
        candidateId: f.candidateId,
        generation: Number.parseInt(gen.replace(/^gen_/, ""), 10) || 0,
        total: f.total,
      };
    }
    return Object.values(byCandidate);
  }, [state.fitnessScores, state.candidates]);
}

export function useEnergyByAgenome() {
  const state = useRunState();
  return useMemo(() => {
    return Object.entries(state.energySpend).map(([agenomeId, total]) => ({
      agenomeId,
      total,
    }));
  }, [state.energySpend]);
}

export function useCandidateReviews(candidateId: string | null) {
  const state = useRunState();
  return useMemo(() => {
    if (!candidateId) return [];
    return Object.values(state.criticReviews).filter((r) => r.candidateId === candidateId);
  }, [state.criticReviews, candidateId]);
}

export function useCandidateChecks(candidateId: string | null) {
  const state = useRunState();
  return useMemo(() => {
    if (!candidateId) return [];
    return Object.values(state.checkResults).filter((r) => r.candidateId === candidateId);
  }, [state.checkResults, candidateId]);
}

export interface ActivityLane {
  /** Lane key. `__pipeline__` collects envelopes with no agenomeId
   *  (run.*, generation.*, novelty.scored, etc.) so they're still visible. */
  laneKey: string;
  agenomeId: string | null;
  firstAt: string;
  lastAt: string;
  /** Latest critic verdict surfaced for this lane (most-recent critic.reviewed). */
  latestVerdict: string | null;
  /** Latest fitness total for this lane's candidates (most-recent fitness.scored). */
  latestFitness: number | null;
  /** Doppl-energy spend rolled up across events in this lane. */
  energyTotal: number;
  /** Whether any failure-type event landed in this lane. */
  hasFailure: boolean;
  events: import("./reducer.js").ActivityEventView[];
}

const PIPELINE_LANE_KEY = "__pipeline__";

const FAILURE_TYPES = new Set([
  "provider_call_failed",
  "output_schema_rejected",
  "energy_exhausted",
  "reproduction_aborted_insufficient_parents",
  "novelty_scoring_degraded",
  "candidate_invalidated",
  "generation_failed",
]);

interface EnergyPayloadShape {
  energy?: { actual?: number; estimate?: number };
}
interface CriticPayloadShape {
  review?: { verdict?: string };
}
interface FitnessPayloadShape {
  fitness?: { total?: number; candidateId?: string };
}

/**
 * Group the SSE-fed activity log into per-agenome lanes for the Activity panel.
 * Pipeline-level events (no agenomeId) fall into a synthetic lane keyed by
 * PIPELINE_LANE_KEY so they're still surfaced.
 *
 * Lanes are returned newest-first by lastAt — the most recently active lane
 * appears at the top, which matches how the redteam-forge Activity view reads
 * during a live run.
 */
export function useAgentActivityLanes(): ActivityLane[] {
  const state = useRunState();
  return useMemo(() => {
    const byLane = new Map<string, ActivityLane>();
    // candidateId → agenomeId, for resolving fitness.scored events whose
    // envelope only carries candidateId.
    const candidateOwner: Record<string, string> = {};
    for (const c of Object.values(state.candidates)) {
      candidateOwner[c.id] = c.agenomeId;
    }

    for (const ev of state.activityEventLog) {
      const laneKey = ev.agenomeId ?? PIPELINE_LANE_KEY;
      let lane = byLane.get(laneKey);
      if (!lane) {
        lane = {
          laneKey,
          agenomeId: ev.agenomeId ?? null,
          firstAt: ev.occurredAt,
          lastAt: ev.occurredAt,
          latestVerdict: null,
          latestFitness: null,
          energyTotal: 0,
          hasFailure: false,
          events: [],
        };
        byLane.set(laneKey, lane);
      }
      lane.events.push(ev);
      lane.lastAt = ev.occurredAt;

      if (ev.type === "energy.spent") {
        const p = ev.payload as EnergyPayloadShape;
        lane.energyTotal += p.energy?.actual ?? p.energy?.estimate ?? 0;
      } else if (ev.type === "critic.reviewed") {
        const p = ev.payload as CriticPayloadShape;
        if (p.review?.verdict) lane.latestVerdict = p.review.verdict;
      } else if (ev.type === "fitness.scored") {
        const p = ev.payload as FitnessPayloadShape;
        if (typeof p.fitness?.total === "number") lane.latestFitness = p.fitness.total;
        // If the fitness envelope has only candidateId, route the score to
        // the candidate's owning agenome's lane too, so a downstream-only
        // event still updates the right header.
        const owner = p.fitness?.candidateId ? candidateOwner[p.fitness.candidateId] : undefined;
        if (owner && owner !== ev.agenomeId) {
          const ownerLane = byLane.get(owner);
          if (ownerLane && typeof p.fitness?.total === "number") {
            ownerLane.latestFitness = p.fitness.total;
          }
        }
      }
      if (FAILURE_TYPES.has(ev.type)) lane.hasFailure = true;
    }

    return Array.from(byLane.values()).sort((a, b) => {
      // Pipeline lane sinks to the bottom so per-agenome lanes lead the view.
      if (a.laneKey === PIPELINE_LANE_KEY) return 1;
      if (b.laneKey === PIPELINE_LANE_KEY) return -1;
      return b.lastAt.localeCompare(a.lastAt);
    });
  }, [state.activityEventLog, state.candidates]);
}
