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
    // intentionally only re-subscribe on runId change; lastApplied
    // updates flow through the event handler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.runId, props.disableLiveStream, props.baseUrl, client]);

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
