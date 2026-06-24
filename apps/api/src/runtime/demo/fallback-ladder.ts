import type { RunCaps, RunConfig } from '@doppl/contracts';
import { applyDemoCapOverride } from './demo-cap-override';

/**
 * PD.4 — the operator-driven three-rung demo fallback ladder (ARCHITECTURE.md §17): rung 1 low-cap-live
 * → rung 2 prepared known-good run → rung 3 labeled replay. A PURE in-memory controller:
 *
 *  - Rungs advance ONLY on an explicit operator call (`select` / `advance`) — there is NO timer,
 *    subscription, or auto-fallback. The operator controls stage timing for the 10-minute window.
 *  - It holds NO authoritative run state and takes NO event-store / write capability — switching rungs
 *    mutates nothing (each rung's run stays append-only / replayable in the log — rule #2).
 *  - Rung descriptors are plain serializable data the UI (PD.6) and write-path (PD.5) consume directly:
 *    rung 1 carries the LOWERED caps (via {@link applyDemoCapOverride}), rung 2 a prepared `RunConfig`,
 *    rung 3 a recorded `replayRunId`. The controller itself starts / replays nothing.
 */

export type DemoRungKind = 'low-cap-live' | 'prepared' | 'replay';
export type DemoMode = 'live' | 'replay';

export interface LowCapLiveRung {
  kind: 'low-cap-live';
  mode: 'live';
  caps: RunCaps;
}
export interface PreparedRung {
  kind: 'prepared';
  mode: 'live';
  runConfig: RunConfig;
}
export interface ReplayRung {
  kind: 'replay';
  mode: 'replay';
  replayRunId: string;
}
export type RungDescriptor = LowCapLiveRung | PreparedRung | ReplayRung;

export interface FallbackLadderConfig {
  /** The validated cap maxima (the boot ceiling) — rung 1 lowers within these. */
  maxima: RunCaps;
  /** The demo cap lowering for rung 1 (only-lowers; applied via `applyDemoCapOverride`). */
  demoOverrides: Partial<RunCaps>;
  /** The prepared known-good run-config for rung 2 (started through the normal write path by PD.5). */
  preparedRunConfig: RunConfig;
  /** The recorded run id for rung 3's labeled replay (served by GET /runs/:id/replay). */
  replayRunId: string;
}

export interface FallbackLadder {
  /** The currently-active rung descriptor. */
  active(): RungDescriptor;
  /** Operator: jump directly to any rung (e.g. live failed → straight to replay). */
  select(kind: DemoRungKind): RungDescriptor;
  /** Operator: step to the next rung; CLAMPS at the last rung (no wrap, no throw). */
  advance(): RungDescriptor;
}

/** Operator `advance()` successor per rung; rung 3 (`replay`) maps to itself — end-of-ladder CLAMP
 * (no wrap back to a live rung, no throw mid-demo). A total map over the closed `DemoRungKind` union,
 * so the lookup is exhaustively typed (never `undefined`). */
const NEXT_RUNG: Record<DemoRungKind, DemoRungKind> = {
  'low-cap-live': 'prepared',
  prepared: 'replay',
  replay: 'replay',
};

export function createFallbackLadder(config: FallbackLadderConfig): FallbackLadder {
  // Descriptors are computed ONCE at construction and frozen — switching never recomputes or mutates a
  // rung (so "no prior-state mutation" is structural, not merely untested).
  const descriptors: Record<DemoRungKind, RungDescriptor> = {
    'low-cap-live': Object.freeze({
      kind: 'low-cap-live',
      mode: 'live',
      caps: applyDemoCapOverride(config.maxima, config.demoOverrides),
    }),
    prepared: Object.freeze({
      kind: 'prepared',
      mode: 'live',
      runConfig: config.preparedRunConfig,
    }),
    replay: Object.freeze({ kind: 'replay', mode: 'replay', replayRunId: config.replayRunId }),
  };

  // The ONLY mutable state: which rung the operator currently has selected. No store, no timer.
  let activeKind: DemoRungKind = 'low-cap-live';

  return {
    active(): RungDescriptor {
      return descriptors[activeKind];
    },
    select(kind: DemoRungKind): RungDescriptor {
      activeKind = kind;
      return descriptors[activeKind];
    },
    advance(): RungDescriptor {
      activeKind = NEXT_RUNG[activeKind];
      return descriptors[activeKind];
    },
  };
}
