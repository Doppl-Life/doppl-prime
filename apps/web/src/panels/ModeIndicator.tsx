import type { JSX } from "react";
import { useRunState } from "../state/runStore.js";
import { StatusIndicator } from "../ui/StatusIndicator.js";

/**
 * Live/replay mode indicator (P7.4). Persistent at the top of the
 * shell. Surfaces idle / live / polling / replay using the shared
 * StatusIndicator primitive so the same mode looks identical
 * everywhere.
 */
export function ModeIndicator(): JSX.Element {
  const state = useRunState();
  // The store's ViewMode maps directly to the run-mode token domain.
  const status = state.mode;
  const subtext = (() => {
    switch (status) {
      case "replay":
        return "Showing original timestamps from the persisted log.";
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
        <span style={{ fontSize: 14, color: "var(--doppl-text-secondary)" }}>{subtext}</span>
      )}
    </div>
  );
}
