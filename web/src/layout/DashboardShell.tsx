import { type JSX, useEffect, useState } from "react";
import { FitnessOverTime } from "../charts/FitnessOverTime.js";
import { GenerationComparison } from "../charts/GenerationComparison.js";
import { OperatorPromptPanel } from "../demo/OperatorPromptPanel.js";
import { LineageGraph } from "../lineage/LineageGraph.js";
import { AgentActivityTable } from "../panels/AgentActivityTable.js";
import { CandidateDetailInspector } from "../panels/CandidateDetailInspector.js";
import { DetailDrawer } from "../panels/DetailDrawer.js";
import { EnergyPanel } from "../panels/EnergyPanel.js";
import { FinalIdeaPanel } from "../panels/FinalIdeaPanel.js";
import { HealthPanel } from "../panels/HealthPanel.js";
import { ProblemBanner } from "../panels/ProblemBanner.js";
import { RunsListPanel } from "../panels/RunsListPanel.js";
import { ModeIndicator } from "../panels/ModeIndicator.js";
import { RunConfigPanel } from "../panels/RunConfigPanel.js";
import { StopControl } from "../panels/StopControl.js";
import { PanelTitle } from "../ui/PanelTitle.js";
import { Tooltip } from "../ui/Tooltip.js";
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
 * The dark sidebar carries brand + run status + a Dashboard/Activity/
 * Inspector nav. The candidate detail panels are merged into an
 * Inspector view tab that appears on lineage selection; the Agent
 * activity firehose lives on its own flat, scannable Activity tab.
 */

const TERMINAL_STATUSES = new Set(["completed", "stopped", "failed", "cancelled"]);
type Phase = "setup" | "live" | "review";
type View = "dashboard" | "activity" | "inspector";
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
  tip,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  badge?: number;
  tip?: string;
}): JSX.Element {
  const btn = (
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
        textShadow: active ? "0 0 10px var(--doppl-accent-glow)" : "none",
      }}
    >
      <span>{children}</span>
      {badge !== undefined && badge > 0 && (
        <span
          style={{
            background: "var(--doppl-bg-input)",
            color: active ? "var(--doppl-accent)" : "var(--doppl-text-secondary)",
            border: "1px solid var(--doppl-hairline)",
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
  return tip ? (
    <Tooltip label={tip} placement="bottom">
      {btn}
    </Tooltip>
  ) : (
    btn
  );
}

function ViewTabs({
  view,
  setView,
  eventCount,
  hasCandidate,
}: {
  view: View;
  setView: (v: View) => void;
  eventCount: number;
  hasCandidate: boolean;
}): JSX.Element {
  return (
    <div
      role="tablist"
      aria-label="View"
      style={{
        display: "flex",
        gap: 20,
        borderBottom: "1px solid var(--doppl-hairline)",
        paddingBottom: 0,
      }}
    >
      <ViewTab
        active={view === "dashboard"}
        onClick={() => setView("dashboard")}
        tip="Lineage, fitness, energy and the final idea for this run"
      >
        Dashboard
      </ViewTab>
      <ViewTab
        active={view === "activity"}
        onClick={() => setView("activity")}
        badge={eventCount}
        tip="Flat, scannable log of every agent event in the run"
      >
        Activity
      </ViewTab>
      {hasCandidate && (
        <ViewTab
          active={view === "inspector"}
          onClick={() => setView("inspector")}
          tip="Overview, critics and evidence for the selected candidate"
        >
          Inspector
        </ViewTab>
      )}
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
  const captionStyle: React.CSSProperties = {
    margin: "0 0 8px 0",
    color: "var(--doppl-text-secondary)",
    fontSize: 13,
    lineHeight: 1.4,
    maxWidth: "60ch",
  };
  // Center the chart+legend block in whatever vertical space the (equal-height)
  // card has left after the title/caption, so the shorter panel reads as
  // balanced rather than top-loaded with an empty gap underneath.
  const chartAreaStyle: React.CSSProperties = {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
  };
  const panelStyle: React.CSSProperties = { display: "flex", flexDirection: "column" };
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      <div data-panel="fitness" style={panelStyle}>
        <PanelTitle style={{ marginBottom: 4 }}>Fitness over time</PanelTitle>
        <p style={captionStyle}>
          Each line follows one idea across generations of evolution. Y = its 0-100
          score (critic pressure and mechanism quality combined; higher is better). X = which
          generation it was scored in.
        </p>
        <div style={chartAreaStyle}>
          <FitnessOverTime />
        </div>
      </div>
      <div data-panel="generations" style={panelStyle}>
        <PanelTitle style={{ marginBottom: 4 }}>Generation comparison</PanelTitle>
        <p style={captionStyle}>
          Each generation's fitness spread: mean and median show typical idea
          quality, while max marks the single best idea that generation produced.
        </p>
        <div style={chartAreaStyle}>
          <GenerationComparison />
        </div>
      </div>
    </div>
  );
}

function LineagePanel({ tall }: { tall: boolean }): JSX.Element {
  // A 4-generation × 5-agenome run lays out ~100+ lineage nodes. 320px is
  // far too tight to read even when fit-view zooms out — the cards become
  // unreadable. Defaults go larger; an Expand button trades dashboard real
  // estate for a closer look when the operator wants one.
  const [expanded, setExpanded] = useState(false);
  const base = tall ? 600 : 480;
  const h = expanded ? 820 : base;
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <div
        style={{
          height: h,
          minHeight: h,
          border: "1px solid var(--doppl-border)",
          borderRadius: 8,
          overflow: "hidden",
        }}
        data-panel="lineage"
      >
        <LineageGraph />
      </div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        title={expanded ? "Collapse lineage graph" : "Expand lineage graph"}
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          background: "var(--doppl-bg-elevated)",
          border: "1px solid var(--doppl-border)",
          borderRadius: 6,
          padding: "4px 10px",
          fontSize: 11,
          fontWeight: 600,
          color: "var(--doppl-text-secondary)",
          cursor: "pointer",
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          zIndex: 5,
        }}
      >
        {expanded ? "Collapse" : "Expand"}
      </button>
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
  const hasCandidate = state.selection.candidateId != null;

  // Selection details (agenome OR candidate) now live in the
  // DetailDrawer — the right-side panel that overlays the dashboard.
  // The Inspector view-tab no longer auto-switches on selection, so a
  // candidate click from inside the drawer (the "Candidates produced"
  // list) keeps the detail in the drawer instead of pulling focus to
  // the main pane. The Inspector tab still exists as a manual
  // navigation option and renders the current candidate selection
  // when active.

  const bodyColumns = [phase === "setup" ? "400px" : "360px", "1fr"].join(" ");

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
            borderBottom: "1px solid var(--doppl-hairline)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h1 style={{ fontSize: "var(--doppl-fs-xl)", margin: 0 }}>Doppl</h1>
            <Tooltip
              label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              placement="bottom"
            >
              <button
                type="button"
                onClick={toggleTheme}
                aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
                style={{
                  background: "transparent",
                  color: "var(--doppl-on-dark)",
                  border: "1px solid var(--doppl-hairline)",
                  boxShadow: "none",
                  padding: "4px 8px",
                  fontSize: 13,
                  letterSpacing: 0,
                  textTransform: "none",
                }}
              >
                {theme === "dark" ? "☀ Light" : "☾ Dark"}
              </button>
            </Tooltip>
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
              <RunsListPanel />
            </>
          ) : (
            <>
              <StopControl />
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
              <HealthPanel />
              <RunsListPanel />
            </>
          )}
        </aside>

        <main style={mainStyle} data-rail="main">
          <ViewTabs
            view={view}
            setView={setView}
            eventCount={eventCount}
            hasCandidate={hasCandidate}
          />
          <ProblemBanner />
          {view === "inspector" ? (
            <CandidateDetailInspector />
          ) : view === "activity" ? (
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
      <DetailDrawer />
    </div>
  );
}
