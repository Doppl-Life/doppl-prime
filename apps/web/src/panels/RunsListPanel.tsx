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

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const diffMs = Date.now() - t;
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  return `${days}d ago`;
}

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
            const isCurrent = r.id === state.runId;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => dispatch({ kind: "SET_RUN_ID", runId: r.id })}
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
                title={r.id}
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
                  {r.problemTitle ?? r.id.slice(0, 8)}
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
                      color: statusColor(r.status),
                      fontWeight: 700,
                      textTransform: "uppercase",
                      fontSize: 10,
                      letterSpacing: "0.06em",
                    }}
                  >
                    {r.status}
                  </span>
                  <span>·</span>
                  <span>{relativeTime(r.completedAt ?? r.configuredAt)}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
