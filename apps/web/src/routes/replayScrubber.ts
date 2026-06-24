import type { RunEventEnvelope } from '../data/contracts';
import { foldEvents } from '../data/sseStream';
import type { FoldState } from '../data/sseStream';

/**
 * replayScrubber (FV.8) — the pure prefix fold that powers the replay step-scrubber. `foldEvents` is a
 * pure `reduce` over the persisted events, so `foldEvents(events.slice(0, n))` deterministically yields
 * the FoldState AS OF step n — no append-only limitation, NO new server call, NO provider call (rule #7:
 * replay re-folds persisted events client-side). Read-only (rule #9).
 */

/**
 * The FoldState as of step `n` — the pure `foldEvents` over `events[0..n)`. `n` is clamped to `[0, len]`
 * (defensive): `n=0` → the empty fold; `n=len` → the full fold. Pure/deterministic; never mutates input.
 */
export function foldAtStep(events: readonly RunEventEnvelope[], n: number): FoldState {
  const clamped = Math.max(0, Math.min(n, events.length));
  return foldEvents(events.slice(0, clamped));
}
