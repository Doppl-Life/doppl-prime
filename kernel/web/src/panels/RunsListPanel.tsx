import { type JSX, useEffect, useState } from "react";
import type { RunListEntry } from "../data/contracts.js";
import { useRunStore } from "../state/runStore.js";

/**
 * RunsListPanel. Lets the operator browse every saved run (campaign) and
 * load one into the dashboard. Runs are already persisted by the runtime —
 * this panel just exposes them. Clicking a row dispatches SET_RUN_ID, which
 * triggers the runStore's existing SSE subscription to replay that run's
 * events into the projected state.
 */

function statusColor(status: string): string {
  if (status === "completed") return "var(--doppl-status-ok, #1FB890)";
  if (status === "failed") return "var(--doppl-status-error, #E84A8A)";
  if (status === "running" || status === "configured") return "var(--doppl-cyan, #38bdf8)";
  return "var(--doppl-text-secondary)";
}

export function RunsListPanel(): JSX.Element {
  const { client, dispatch, state } = useRunStore();
  const [runs, setRuns] = useState<RunListEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshCounter, setRefreshCounter] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void client
      .listRuns()
      .then((r) => {
        if (!cancelled) {
          setRuns(r.runs);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [client, refreshCounter]);

  return (
    <section aria-label="Previous runs">
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <h3 style={{ fontSize: 14, margin: 0, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Previous runs
        </h3>
        <button
          type="button"
          onClick={() => setRefreshCounter((n) => n + 1)}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--doppl-text-secondary)",
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          ↻ refresh
        </button>
      </div>
      {loading && <div style={{ color: "var(--doppl-text-secondary)", fontSize: 13 }}>Loading…</div>}
      {error && (
        <div role="alert" style={{ color: "var(--doppl-status-error)", fontSize: 13 }}>
          {error}
        </div>
      )}
      {!loading && !error && runs?.length === 0 && (
        <div style={{ color: "var(--doppl-text-secondary)", fontSize: 13 }}>No runs yet.</div>
      )}
      {runs && runs.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {runs.map((r) => {
            const runId = r.runId;
            const status = r.child ? "completed" : "running";
            const title = r.caseTitle ?? r.caseId ?? runId;
            const isCurrent = runId === state.runId;
            return (
              <button
                key={runId}
                type="button"
                onClick={() => dispatch({ kind: "SET_RUN_ID", runId })}
                style={{
                  textAlign: "left",
                  background: isCurrent
                    ? "var(--doppl-bg-elevated, rgba(56,189,248,0.08))"
                    : "transparent",
                  border: `1px solid ${
                    isCurrent ? "var(--doppl-cyan, #38bdf8)" : "var(--doppl-border)"
                  }`,
                  borderRadius: 6,
                  padding: "8px 10px",
                  color: "var(--doppl-text-primary)",
                  cursor: "pointer",
                  fontSize: 12,
                  fontFamily: "inherit",
                }}
                title={runId}
              >
                <div
                  style={{
                    fontWeight: 600,
                    marginBottom: 2,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {title}
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    color: "var(--doppl-text-secondary)",
                  }}
                >
                  <span
                    style={{
                      color: statusColor(status),
                      fontWeight: 700,
                      textTransform: "uppercase",
                      fontSize: 10,
                      letterSpacing: "0.06em",
                    }}
                  >
                    {status}
                  </span>
                  <span>·</span>
                  <span>{r.generations ?? 0} gen</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
