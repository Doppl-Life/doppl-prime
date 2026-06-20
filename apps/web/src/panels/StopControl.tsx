import { type JSX, useState } from "react";
import { useRunStore } from "../state/runStore.js";

/**
 * Stop control (P7.6). Single button that issues the idempotent
 * POST /runs/:id/stop command. Disabled in terminal states based on
 * store state — never on optimistic local guessing. Partial evidence
 * remains visible after stop.
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <button
        type="button"
        data-variant="danger"
        onClick={handleStop}
        disabled={terminal || requesting}
        aria-label="Stop run"
      >
        {terminal ? `Run ${runStatus}` : requesting ? "Stopping…" : "Stop run"}
      </button>
      {error && (
        <span role="alert" style={{ color: "var(--doppl-status-error)", fontSize: 14 }}>
          {error}
        </span>
      )}
    </div>
  );
}
