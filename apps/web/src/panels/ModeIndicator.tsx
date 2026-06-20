import type { JSX } from "react";
import { useRunState } from "../state/runStore.js";
import { StatusIndicator } from "../ui/StatusIndicator.js";

/**
 * Live/replay mode indicator (P7.4 + PD.6). Persistent at the top of
 * the shell. Surfaces idle / live / polling / replay using the shared
 * StatusIndicator primitive so the same mode looks identical
 * everywhere.
 *
 * PD.6: the server-side `serverRunMode` flag wins over the local
 * SSE-derived mode. When the server tags a run as 'replay' or
 * 'rehearsal', the indicator surfaces that regardless of SSE state —
 * audience-visible badge for the labeled-replay rung.
 */
export function ModeIndicator(): JSX.Element {
  const state = useRunState();
  // Server flag wins; falls back to the local SSE-derived mode.
  const status = state.serverRunMode ?? state.mode;
  const subtext = (() => {
    switch (status) {
      case "replay":
        return state.serverRunMode === "replay"
          ? "Serving a recorded run — fallback rung active."
          : "Showing original timestamps from the persisted log.";
      case "rehearsal":
        return "Serving a rehearsal-recorded run.";
      case "polling":
        return "SSE unavailable — polling event log every 2s.";
      case "idle":
        return "Configure a run on the left to begin.";
      default:
        return null;
    }
  })();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <StatusIndicator domain="run-mode" status={status} size="md" />
      {subtext && (
        <span style={{ fontSize: 14, color: "var(--doppl-on-dark-muted)" }}>{subtext}</span>
      )}
    </div>
  );
}
