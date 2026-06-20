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
  return (
    <section aria-label="Run health" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <h3 style={{ fontSize: 16, margin: 0 }}>Run health · {health.status}</h3>
      <Tooltip label="The generation currently being evolved" placement="right" block>
        <div>generation: {health.currentGeneration}</div>
      </Tooltip>
      <Tooltip label="Candidate agents still being generated or scored right now" placement="right" block>
        <div>candidates in flight: {health.candidatesInFlight}</div>
      </Tooltip>
      <Tooltip label="Timestamp of the most recent event received from the run" placement="right" block>
        <div>last event: {health.lastEventOccurredAt ?? "—"}</div>
      </Tooltip>
      <Tooltip
        label="Time since the last heartbeat. If this grows large the live stream may be stalling."
        placement="right"
        block
      >
        <div>
          last heartbeat:{" "}
          {health.lastHeartbeatMs === null ? "—" : `${health.lastHeartbeatMs} ms ago`}
        </div>
      </Tooltip>
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
      <Tooltip
        label="Doppl-energy consumed vs the run's budget. Energy bounds total compute."
        placement="right"
        block
      >
        <div>
          energy: {health.capsConsumed.energy}
          {capsCfg.energyBudget ? ` / ${capsCfg.energyBudget}` : ""}
        </div>
      </Tooltip>
      <Tooltip label="Generations completed vs the configured maximum" placement="right" block>
        <div>
          generations: {health.capsConsumed.generations}
          {capsCfg.maxGenerations ? ` / ${capsCfg.maxGenerations}` : ""}
        </div>
      </Tooltip>
      {/* `capsConsumed.candidates` is a lifetime total; `maxPopulation` is a
       *  per-generation cap (caps.ts enforces state.populationCount >= max).
       *  Rendering them as "N / M" reads as over-cap once N crosses M across
       *  multiple generations, which is wrong — they aren't comparable. So
       *  the cap is surfaced as its own row, labeled per-gen. */}
      <Tooltip label="Lifetime count of candidates created across every generation" placement="right" block>
        <div>candidates (total): {health.capsConsumed.candidates}</div>
      </Tooltip>
      <Tooltip label="Maximum candidate agents allowed per generation" placement="right" block>
        <div>
          population cap: {capsCfg.maxPopulation ?? "—"}
          {capsCfg.maxPopulation ? " per gen" : ""}
        </div>
      </Tooltip>
      <Tooltip label="Tool/LLM calls consumed vs the configured ceiling" placement="right" block>
        <div>
          tool calls: {health.capsConsumed.toolCalls}
          {capsCfg.maxToolCalls ? ` / ${capsCfg.maxToolCalls}` : ""}
        </div>
      </Tooltip>
    </section>
  );
}
