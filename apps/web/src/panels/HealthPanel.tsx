import { type JSX, useEffect, useState } from "react";
import type { RunHealth } from "../data/contracts.js";
import { useRunStore } from "../state/runStore.js";
import { Tooltip } from "../ui/Tooltip.js";

const POLL_MS = 3000;
const STALE_HEARTBEAT_MS = 10_000;

interface RunCapsConfig {
  energyBudget?: number;
  maxGenerations?: number;
  maxPopulation?: number;
  maxToolCalls?: number;
}

/**
 * Health panel (P7.14). Polls /runs/:id/health every 3s when a run
 * is loaded. Renders current generation, candidates in flight, last
 * event time, caps consumed against the run's configured caps. Stale
 * lastHeartbeatMs is surfaced via the StatusIndicator on the run-mode
 * banner — this panel just renders the numbers.
 */

/**
 * One health metric: a muted label paired with a brighter, heavier
 * value so the two read as distinct columns rather than one run-on
 * line. Long values (e.g. ISO timestamps) wrap under the label.
 */
function Metric({
  label,
  value,
  tip,
}: {
  label: string;
  value: React.ReactNode;
  tip: string;
}): JSX.Element {
  return (
    <Tooltip label={tip} placement="right" block>
      <div
        style={{
          display: "grid",
          // Shared template across every row → the label/value boundary
          // lines up into two clean columns instead of a ragged gap.
          gridTemplateColumns: "8.5rem 1fr",
          alignItems: "baseline",
          columnGap: 12,
        }}
      >
        <span
          style={{
            color: "var(--doppl-text-secondary)",
            fontSize: 12,
            letterSpacing: "0.02em",
            lineHeight: 1.4,
          }}
        >
          {label}
        </span>
        <span
          style={{
            color: "var(--doppl-text-primary)",
            fontSize: 14,
            fontWeight: 600,
            fontVariantNumeric: "tabular-nums",
            overflowWrap: "anywhere",
          }}
        >
          {value}
        </span>
      </div>
    </Tooltip>
  );
}
export function HealthPanel(): JSX.Element | null {
  const { state, client, dispatch } = useRunStore();
  const [health, setHealth] = useState<RunHealth | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!state.runId) return;
    let cancelled = false;
    const fetchHealth = async () => {
      try {
        if (!state.runId) return;
        const h = await client.getHealth(state.runId);
        if (!cancelled) {
          setHealth(h);
          dispatch({ kind: "SET_LAST_HEARTBEAT_MS", lastHeartbeatMs: h.lastHeartbeatMs });
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    };
    void fetchHealth();
    const timer = setInterval(fetchHealth, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [state.runId, client, dispatch]);

  if (!state.runId) return null;
  if (error) {
    return (
      <section aria-label="Run health">
        <h3 style={{ fontSize: 16, margin: 0 }}>Run health</h3>
        <p role="alert" style={{ color: "var(--doppl-status-error)" }}>
          {error}
        </p>
      </section>
    );
  }
  if (!health) {
    return (
      <section aria-label="Run health">
        <h3 style={{ fontSize: 16, margin: 0 }}>Run health</h3>
        <p style={{ color: "var(--doppl-text-secondary)" }}>Loading…</p>
      </section>
    );
  }
  const capsCfg = (state.run?.capsConfig ?? {}) as RunCapsConfig;
  const isStaleHeartbeat =
    health.status === "running" &&
    health.lastHeartbeatMs !== null &&
    health.lastHeartbeatMs > STALE_HEARTBEAT_MS &&
    state.serverRunMode !== "replay";
  // When the run is in a terminal failure/stop state, surface the
  // reason the runtime captured on the run.failed / run.stopped event
  // so the operator doesn't have to dig into the Activity tab to see
  // what went wrong.
  const terminalReason = state.run?.terminalReason;
  const isTerminalFail = health.status === "failed" || health.status === "stopped";
  return (
    <section aria-label="Run health" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <h3 style={{ fontSize: 16, margin: 0 }}>Run health · {health.status}</h3>
      {isTerminalFail && terminalReason && (
        <div
          role="alert"
          data-testid="health-terminal-reason"
          style={{
            padding: "6px 8px",
            background: "rgba(248, 113, 113, 0.10)",
            color: "var(--doppl-status-error, #f87171)",
            border: "1px solid var(--doppl-status-error, #f87171)",
            borderRadius: 4,
            fontSize: 12,
            fontFamily: "var(--doppl-font-mono, monospace)",
            wordBreak: "break-word",
          }}
          title={terminalReason}
        >
          {terminalReason}
        </div>
      )}
      <Metric
        label="generation"
        value={health.currentGeneration}
        tip="The generation currently being evolved"
      />
      <Metric
        label="candidates in flight"
        value={health.candidatesInFlight}
        tip="Candidate agents still being generated or scored right now"
      />
      <Metric
        label="last event"
        value={health.lastEventOccurredAt ?? "—"}
        tip="Timestamp of the most recent event received from the run"
      />
      <Metric
        label="last heartbeat"
        value={health.lastHeartbeatMs === null ? "—" : `${health.lastHeartbeatMs} ms ago`}
        tip="Time since the last heartbeat. If this grows large the live stream may be stalling."
      />
      {isStaleHeartbeat && (
        <div
          role="alert"
          data-testid="health-consider-fallback"
          style={{
            padding: "6px 8px",
            background: "var(--doppl-status-warning-bg, rgba(255,180,0,0.12))",
            color: "var(--doppl-status-warning, #b07a00)",
            borderRadius: 4,
            fontSize: 13,
          }}
        >
          Heartbeat stale — consider switching to a prepared run or replay rung.
        </div>
      )}
      <hr style={{ border: "none", borderTop: "1px solid var(--doppl-border)" }} />
      <Metric
        label="energy"
        value={`${health.capsConsumed.energy}${capsCfg.energyBudget ? ` / ${capsCfg.energyBudget}` : ""}`}
        tip="Doppl-energy consumed vs the run's budget. Energy bounds total compute."
      />
      <Metric
        label="generations"
        value={`${health.capsConsumed.generations}${capsCfg.maxGenerations ? ` / ${capsCfg.maxGenerations}` : ""}`}
        tip="Generations completed vs the configured maximum"
      />
      {/* `capsConsumed.candidates` is a lifetime total; `maxPopulation` is a
       *  per-generation cap (caps.ts enforces state.populationCount >= max).
       *  Rendering them as "N / M" reads as over-cap once N crosses M across
       *  multiple generations, which is wrong — they aren't comparable. So
       *  the cap is surfaced as its own row, labeled per-gen. */}
      <Metric
        label="candidates (total)"
        value={health.capsConsumed.candidates}
        tip="Lifetime count of candidates created across every generation"
      />
      <Metric
        label="population cap"
        value={`${capsCfg.maxPopulation ?? "—"}${capsCfg.maxPopulation ? " per gen" : ""}`}
        tip="Maximum candidate agents allowed per generation"
      />
      <Metric
        label="tool calls"
        value={`${health.capsConsumed.toolCalls}${capsCfg.maxToolCalls ? ` / ${capsCfg.maxToolCalls}` : ""}`}
        tip="Tool/LLM calls consumed vs the configured ceiling"
      />
    </section>
  );
}
