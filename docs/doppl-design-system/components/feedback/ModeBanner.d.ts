import * as React from "react";

/**
 * The unmistakable, projector-legible LIVE vs REPLAY signal. Live = cyan
 * breathing dot; Replay = amber hatched static banner; terminal states are
 * steady. A reviewer must never confuse a recording for a live run.
 */
export interface ModeBannerProps {
  mode?: "live" | "replay" | "complete" | "stopped" | "failed";
  /** e.g. "Gen 3/5" — shown beside LIVE / terminal states. */
  generationLabel?: string;
  /** Recorded-at stamp shown on REPLAY. */
  recordedAt?: string;
  /** REPLAY only — stretch to a full-width hatched ribbon (projector). */
  fullWidth?: boolean;
}

export function ModeBanner(props: ModeBannerProps): React.JSX.Element;
