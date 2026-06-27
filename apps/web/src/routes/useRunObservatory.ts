import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { LineageGraphProjection } from '../data/contracts';
import type { RunClient } from '../data/runClient';
import type { RunHealth } from '../data/health';
import { applyEnvelope, createSseStream, emptyFoldState, foldEvents } from '../data/sseStream';
import type { EventSourceLike, FoldState, SseStream, SseStreamOptions } from '../data/sseStream';
import { createRunStore } from '../state/runStore';
import type { RunStore } from '../state/runStore';
import type { RunMode, ViewState } from '../state/reducer';
import { isRunTerminal, selectRunStatus } from '../components/run/runControl';
import type { SelectedNode } from '../components/run/NodeInspectorContent';
import { debounce } from '../lib/debounce';
// wireRunStream lives alongside Dashboard; importing it keeps the IoC identical to the tested path.
import { wireRunStream } from './dashboardWiring';

/**
 * useRunObservatory (FV.4) — the tested live-observatory wiring, EXTRACTED from Dashboard so the S2
 * Organism View re-homes it INTACT: the RunStore + useSyncExternalStore fold, the wireRunStream SSE
 * connection (resync-on-mount + poll fallback IoC), the raw-events FoldState the panels consume, and
 * the PD.20 debounced lineage/health re-fetch on the SSE cadence (forced-immediate on a terminal
 * envelope so the FINAL graph always renders). Read-only over projections + SSE; the observed run +
 * mode come from the caller (the URL, via the route wrapper). Replay reconstructs from persisted
 * events — no provider call (rule #7). Dashboard keeps its own inline copy until FV.3 retires its
 * observatory (a tracked temporary duplication).
 */
export interface UseRunObservatoryOptions {
  runId: string;
  mode: RunMode;
  runClient: RunClient;
  // Pass-through injection seams — `| undefined` (not bare optional) so a caller can forward a
  // possibly-undefined prop under exactOptionalPropertyTypes; the hook's destructure defaults apply.
  baseUrl?: string | undefined;
  eventSourceFactory?: ((url: string) => EventSourceLike) | undefined;
  /** Injected for tests; defaults to the real createSseStream (via wireRunStream). */
  createStream?: ((options: SseStreamOptions) => SseStream) | undefined;
  /** Injected for tests; defaults to a fresh createRunStore. */
  store?: RunStore | undefined;
  /** PD.20 — debounce window (ms) for the live lineage/health re-fetch; injected small in tests. */
  refetchDebounceMs?: number | undefined;
}

export interface RunObservatory {
  store: RunStore;
  state: ViewState;
  fold: FoldState;
  lineage: LineageGraphProjection | null;
  health: RunHealth | null;
  runStatus: ReturnType<typeof selectRunStatus>;
  /** FV.5a — the unified node selection driving the inspector drawer (candidate OR agenome). */
  selectedNode: SelectedNode | null;
  setSelectedNode: (node: SelectedNode | null) => void;
}

/** Module-stable default so the effect deps don't churn every render (an inline default would be a
 *  new function each render → effect re-run loop; apps/web LESSONS §10). Tests inject their own. */
const defaultEventSourceFactory = (url: string): EventSourceLike => new EventSource(url);

/** Module-level cache keyed by runId — the projection/events fetched once for a run survives
 *  navigations between sibling routes (Organism ↔ Knowledge ↔ Final). On a return visit the hook
 *  seeds state synchronously from the cache (instant render) and refetches in the background to
 *  cover any new events that may have arrived. Capped via a tiny LRU to keep memory bounded. */
interface CachedObservatory {
  readonly fold: FoldState;
  readonly lineage: LineageGraphProjection | null;
  readonly health: RunHealth | null;
}
const OBSERVATORY_CACHE_MAX = 8;
const observatoryCache = new Map<string, CachedObservatory>();
function readCache(runId: string): CachedObservatory | undefined {
  const cached = observatoryCache.get(runId);
  if (cached !== undefined) {
    // LRU bump — re-insert so this runId moves to the most-recently-used end of the iteration order.
    observatoryCache.delete(runId);
    observatoryCache.set(runId, cached);
  }
  return cached;
}
/** Test seam — clear the module-level cache between renders so a prior test's runId doesn't seed
 *  the next test's hook state. Not for production use. */
export function __clearObservatoryCache(): void {
  observatoryCache.clear();
}
function writeCache(runId: string, patch: Partial<CachedObservatory>): void {
  const prev = observatoryCache.get(runId) ?? {
    fold: emptyFoldState,
    lineage: null,
    health: null,
  };
  observatoryCache.set(runId, { ...prev, ...patch });
  // Evict the oldest entry once we exceed the cap (insertion-order iteration → first is oldest).
  while (observatoryCache.size > OBSERVATORY_CACHE_MAX) {
    const oldest = observatoryCache.keys().next().value;
    if (oldest === undefined) break;
    observatoryCache.delete(oldest);
  }
}

export function useRunObservatory({
  runId,
  mode,
  runClient,
  baseUrl = '/api',
  eventSourceFactory = defaultEventSourceFactory,
  createStream = createSseStream,
  store: injectedStore,
  refetchDebounceMs = 600,
}: UseRunObservatoryOptions): RunObservatory {
  const store = useMemo(
    () => injectedStore ?? createRunStore({ runId, runClient, mode }),
    [injectedStore, runId, runClient, mode],
  );

  // Seed state synchronously from the module cache so a return visit (e.g. Knowledge → Organism)
  // renders the lineage + events immediately. Background refetch (below) keeps things fresh.
  const cached = readCache(runId);
  const [fold, setFold] = useState<FoldState>(cached?.fold ?? emptyFoldState);
  const [lineage, setLineage] = useState<LineageGraphProjection | null>(cached?.lineage ?? null);
  const [health, setHealth] = useState<RunHealth | null>(cached?.health ?? null);
  const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null);

  const state = useSyncExternalStore(store.subscribe, store.getState);

  useEffect(() => {
    if (!runId) return;
    let active = true;
    // PD.20 — the evolving projections (lineage + health) are REBUILT-ON-READ by the API (§9); re-fetch
    // on the live SSE cadence so the graph grows live (a one-time fetch renders stale). Run STATE stays
    // live via the store SSE-fold (no double-fold here).
    const refetchProjections = (): void => {
      runClient
        .getLineage(runId)
        .then((l) => {
          if (!active) return;
          setLineage(l);
          writeCache(runId, { lineage: l });
        })
        .catch(() => undefined);
      runClient
        .getRunHealth(runId)
        .then((h) => {
          if (!active) return;
          setHealth(h);
          writeCache(runId, { health: h });
        })
        .catch(() => undefined);
    };
    const debouncedRefetch = debounce(refetchProjections, refetchDebounceMs);

    // Seed the raw events fold + the initial projections.
    runClient
      .getEvents(runId)
      .then((evs) => {
        if (!active) return;
        setFold((prev) => {
          const next = foldEvents(evs, prev);
          writeCache(runId, { fold: next });
          return next;
        });
      })
      .catch(() => undefined);
    refetchProjections();

    // Wire the deferred SSE-store IoC: store.applyEvent sink + poll fallback + resync-on-mount, and
    // accumulate the raw events FoldState the panels consume (delivery-level dedup).
    const stream = wireRunStream({
      store,
      runId,
      baseUrl,
      eventSourceFactory,
      createStream,
      onEnvelope: (env) => {
        setFold((f) => {
          const next = applyEnvelope(f, env);
          writeCache(runId, { fold: next });
          return next;
        });
        // PD.20 — debounced re-fetch on the SSE cadence; a TERMINAL envelope forces an immediate final
        // re-fetch so the FINAL graph always renders even if debounced updates were coalesced.
        if (isRunTerminal(env.type)) {
          debouncedRefetch.cancel();
          refetchProjections();
        } else {
          debouncedRefetch();
        }
      },
    });

    return () => {
      active = false;
      debouncedRefetch.cancel();
      stream.close();
    };
  }, [runId, store, runClient, baseUrl, eventSourceFactory, createStream, refetchDebounceMs]);

  const runStatus = selectRunStatus(state, runId);

  return {
    store,
    state,
    fold,
    lineage,
    health,
    runStatus,
    selectedNode,
    setSelectedNode,
  };
}
