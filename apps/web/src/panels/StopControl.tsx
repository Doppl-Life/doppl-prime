import { type JSX, useState } from "react";
import { useRunStore } from "../state/runStore.js";
import { StatusIndicator } from "../ui/StatusIndicator.js";
import { Tooltip } from "../ui/Tooltip.js";

/**
 * Stop control (P7.6). Issues the idempotent POST /runs/:id/stop
 * command while a run is active. Once the run reaches a terminal state
 * there's nothing to stop, so we render a non-interactive status
 * indicator instead of a disabled button — "Run completed" is state,
 * not an action. Partial evidence remains visible after stop.
 */

const TERMINAL_STATUSES = new Set(["completed", "stopped", "failed", "cancelled"]);

export function StopControl(): JSX.Element | null {
  const { state, client } = useRunStore();
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!state.runId) return null;
  const runStatus = state.run?.status ?? "configured";
  const terminal = TERMINAL_STATUSES.has(runStatus);

  async function handleStop() {
    if (requesting || !state.runId) return;
    setRequesting(true);
    setError(null);
    try {
      await client.stopRun(state.runId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRequesting(false);
    }
  }

  if (terminal) {
    return (
      <Tooltip label="This run has finished — its results stay visible below" placement="right">
        <div
          role="status"
          aria-label={`Run ${runStatus}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            alignSelf: "flex-start",
            padding: "8px 12px",
            borderRadius: 8,
            background: "var(--doppl-bg-input)",
            border: "1px solid var(--doppl-hairline)",
          }}
        >
          <StatusIndicator domain="run" status={runStatus} size="sm" />
        </div>
      </Tooltip>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <Tooltip label="Gracefully halt the run — partial evidence stays visible" placement="right">
        <button
          type="button"
          data-variant="danger"
          onClick={handleStop}
          disabled={requesting}
          aria-label="Stop run"
        >
          {requesting ? "Stopping…" : "Stop run"}
        </button>
      </Tooltip>
      {error && (
        <span role="alert" style={{ color: "var(--doppl-status-error)", fontSize: 14 }}>
          {error}
        </span>
      )}
    </div>
  );
}
