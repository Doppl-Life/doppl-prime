import { type JSX, useEffect, useState } from "react";
import { FitnessOverTime } from "../charts/FitnessOverTime.js";
import { GenerationComparison } from "../charts/GenerationComparison.js";
import { OperatorPromptPanel } from "../demo/OperatorPromptPanel.js";
import { LineageGraph } from "../lineage/LineageGraph.js";
import { AgentActivityTable } from "../panels/AgentActivityTable.js";
import { CandidateDetailInspector } from "../panels/CandidateDetailInspector.js";
import { EnergyPanel } from "../panels/EnergyPanel.js";
import { FinalIdeaPanel } from "../panels/FinalIdeaPanel.js";
import { HealthPanel } from "../panels/HealthPanel.js";
import { ModeIndicator } from "../panels/ModeIndicator.js";
import { RunConfigPanel } from "../panels/RunConfigPanel.js";
import { StopControl } from "../panels/StopControl.js";
import { useAgentActivityLanes, useRunState } from "../state/runStore.js";

/**
 * Phase-aware dashboard shell (UX restructure). The same app shifts
 * emphasis across three moments instead of showing everything flat:
 *
 *   - setup:  Operator config + START is the hero (no run yet).
 *   - live:   lineage + fitness are the hero; config collapses to a
 *             compact summary; Health + Stop are promoted.
 *   - review: the Final surviving idea + generation comparison (the
 *             proof) lead; lineage stays available for provenance.
 *
 * The dark sidebar carries brand + run status + a Dashboard/Activity
 * nav. The candidate detail panels are merged into a right-docked
 * Inspector that opens on lineage selection; the Agent activity
 * firehose lives on its own flat, scannable Activity tab.
 */

const TERMINAL_STATUSES = new Set(["completed", "stopped", "failed", "cancelled"]);
type Phase = "setup" | "live" | "review";
type View = "dashboard" | "activity";
type Theme = "dark" | "light";

const THEME_KEY = "doppl-theme";

function readInitialTheme(): Theme {
  try {
    const saved = window.localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* localStorage unavailable (SSR / tests) */
  }
  return "dark";
}

function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(readInitialTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);
  return [theme, () => setTheme((t) => (t === "dark" ? "light" : "dark"))];
}

function ViewTab({
  active,
  onClick,
  children,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  badge?: number;
}): JSX.Element {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: "transparent",
        color: active ? "var(--doppl-accent)" : "var(--doppl-text-secondary)",
        border: "none",
        borderBottom: active
          ? "2px solid var(--doppl-accent)"
          : "2px solid transparent",
        boxShadow: "none",
        borderRadius: 0,
        padding: "8px 4px",
        marginBottom: -2,
        fontSize: "var(--doppl-fs-sm)",
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        textShadow: active ? "0 0 10px rgba(43,214,255,0.5)" : "none",
      }}
    >
      <span>{children}</span>
      {badge !== undefined && badge > 0 && (
        <span
          style={{
            background: "var(--doppl-bg-input)",
            color: active ? "var(--doppl-accent)" : "var(--doppl-text-secondary)",
            border: "1px solid rgba(43,214,255,0.4)",
            borderRadius: 3,
            padding: "0 6px",
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

function ViewTabs({
  view,
  setView,
  eventCount,
}: {
  view: View;
  setView: (v: View) => void;
  eventCount: number;
}): JSX.Element {
  return (
    <div
      role="tablist"
      aria-label="View"
      style={{
        display: "flex",
        gap: 20,
        borderBottom: "1px solid rgba(43,214,255,0.3)",
        paddingBottom: 0,
      }}
    >
      <ViewTab active={view === "dashboard"} onClick={() => setView("dashboard")}>
        Dashboard
      </ViewTab>
      <ViewTab active={view === "activity"} onClick={() => setView("activity")} badge={eventCount}>
        Activity
      </ViewTab>
    </div>
  );
}

const railStyle: React.CSSProperties = {
  background: "var(--doppl-bg-elevated)",
  padding: 16,
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  gap: 16,
  borderRight: "1px solid var(--doppl-border)",
};

const mainStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 16,
  padding: 16,
  overflowY: "auto",
};

function FitnessAndGenerations(): JSX.Element {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      <div data-panel="fitness">
        <h2 style={{ fontSize: "var(--doppl-fs-lg)" }}>Fitness over time</h2>
        <FitnessOverTime />
      </div>
      <div data-panel="generations">
        <h2 style={{ fontSize: "var(--doppl-fs-lg)" }}>Generation comparison</h2>
        <GenerationComparison />
      </div>
    </div>
  );
}

function LineagePanel({ tall }: { tall: boolean }): JSX.Element {
  return (
    <div
      style={{
        height: tall ? 460 : 320,
        border: "1px solid var(--doppl-border)",
        borderRadius: 8,
        overflow: "hidden",
      }}
      data-panel="lineage"
    >
      <LineageGraph />
    </div>
  );
}

export function DashboardShell(): JSX.Element {
  const state = useRunState();
  const lanes = useAgentActivityLanes();
  const [view, setView] = useState<View>("dashboard");
  const [theme, toggleTheme] = useTheme();
  const status = state.run?.status ?? (state.runId ? "running" : "idle");
  const phase: Phase = !state.runId
    ? "setup"
    : TERMINAL_STATUSES.has(status)
      ? "review"
      : "live";
  const eventCount = lanes.reduce((n, l) => n + l.events.length, 0);
  const inspectorOpen = view === "dashboard" && state.selection.candidateId != null;

  const bodyColumns = [phase === "setup" ? "340px" : "300px", "1fr", inspectorOpen ? "380px" : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div style={{ display: "grid", gridTemplateColumns: bodyColumns, height: "100vh", overflow: "hidden" }}>
      <aside style={railStyle} data-rail="left">
        <div
          data-brand
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            paddingBottom: 12,
            borderBottom: "1px solid rgba(43,214,255,0.35)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h1 style={{ fontSize: "var(--doppl-fs-xl)", margin: 0 }}>Doppl</h1>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              style={{
                background: "transparent",
                color: "var(--doppl-on-dark)",
                border: "1px solid rgba(43,214,255,0.4)",
                boxShadow: "none",
                padding: "4px 8px",
                fontSize: 13,
                letterSpacing: 0,
                textTransform: "none",
              }}
            >
              {theme === "dark" ? "☀ Light" : "☾ Dark"}
            </button>
          </div>
          <ModeIndicator />
          <div
            style={{
              color: "var(--doppl-on-dark-muted)",
              fontSize: "var(--doppl-fs-xs)",
              overflowWrap: "anywhere",
            }}
          >
            {state.runId ? `run: ${state.runId}` : "no run loaded"}
          </div>
        </div>

        {phase === "setup" ? (
            <>
              <h2 style={{ fontSize: "var(--doppl-fs-lg)", margin: 0 }}>Operator</h2>
              <OperatorPromptPanel />
              <details data-panel="advanced-run-config">
                <summary
                  style={{
                    cursor: "pointer",
                    fontSize: "var(--doppl-fs-sm)",
                    color: "var(--doppl-text-secondary)",
                    padding: "4px 0",
                  }}
                >
                  Advanced — Run configuration (seeds, model profile, full caps)
                </summary>
                <div style={{ marginTop: 8 }}>
                  <RunConfigPanel />
                </div>
              </details>
            </>
          ) : (
            <>
              <StopControl />
              <HealthPanel />
              <details data-panel="reconfigure">
                <summary
                  style={{
                    cursor: "pointer",
                    fontSize: "var(--doppl-fs-sm)",
                    color: "var(--doppl-text-secondary)",
                    padding: "4px 0",
                  }}
                >
                  {phase === "review" ? "Start a new run" : "Reconfigure — start another run"}
                </summary>
                <div style={{ marginTop: 8 }}>
                  <OperatorPromptPanel />
                </div>
              </details>
            </>
          )}
        </aside>

        <main style={mainStyle} data-rail="main">
          <ViewTabs view={view} setView={setView} eventCount={eventCount} />
          {view === "activity" ? (
            <AgentActivityTable />
          ) : phase === "review" ? (
            <>
              <FinalIdeaPanel />
              <FitnessAndGenerations />
              <LineagePanel tall={false} />
              <EnergyPanel />
            </>
          ) : phase === "live" ? (
            <>
              <LineagePanel tall={true} />
              <FitnessAndGenerations />
              <EnergyPanel />
            </>
          ) : (
            <>
              <LineagePanel tall={false} />
              <FitnessAndGenerations />
              <EnergyPanel />
            </>
          )}
        </main>

      {inspectorOpen && <CandidateDetailInspector />}
    </div>
  );
}
