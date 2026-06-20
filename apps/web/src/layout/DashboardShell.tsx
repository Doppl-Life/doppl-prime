import type { JSX } from "react";
import { FitnessOverTime } from "../charts/FitnessOverTime.js";
import { GenerationComparison } from "../charts/GenerationComparison.js";
import { LineageGraph } from "../lineage/LineageGraph.js";
import { CandidateInspector } from "../panels/CandidateInspector.js";
import { CheckEvidence } from "../panels/CheckEvidence.js";
import { CriticGauntlet } from "../panels/CriticGauntlet.js";
import { EnergyPanel } from "../panels/EnergyPanel.js";
import { FinalIdeaPanel } from "../panels/FinalIdeaPanel.js";
import { HealthPanel } from "../panels/HealthPanel.js";
import { ModeIndicator } from "../panels/ModeIndicator.js";
import { RunConfigPanel } from "../panels/RunConfigPanel.js";
import { StopControl } from "../panels/StopControl.js";
import { useRunState } from "../state/runStore.js";

/**
 * Dashboard shell (P7.14). 3-column flex layout:
 *   - left rail:   RunConfigPanel + StopControl + HealthPanel
 *   - main:        LineageGraph + Fitness + GenerationComparison + Energy + Final-idea
 *   - right rail:  CandidateInspector + CriticGauntlet + CheckEvidence
 *
 * ModeIndicator pinned at the top of the shell so the live/replay
 * distinction is persistently visible per §12.
 */

const RAIL_PADDING = 16;

const railStyle: React.CSSProperties = {
  background: "var(--doppl-bg-elevated)",
  padding: RAIL_PADDING,
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
  padding: RAIL_PADDING,
  overflowY: "auto",
};

export function DashboardShell(): JSX.Element {
  const state = useRunState();
  return (
    <div
      style={{
        display: "grid",
        gridTemplateRows: "auto 1fr",
        height: "100vh",
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 16px",
          background: "var(--doppl-bg-elevated)",
          borderBottom: "1px solid var(--doppl-border)",
        }}
      >
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <h1 style={{ fontSize: "var(--doppl-fs-xl)", margin: 0 }}>Doppl</h1>
          <ModeIndicator />
        </div>
        <div style={{ color: "var(--doppl-text-secondary)" }}>
          {state.runId ? `run: ${state.runId}` : "no run loaded"}
        </div>
      </header>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "340px 1fr 380px",
          overflow: "hidden",
        }}
      >
        <aside style={railStyle} data-rail="left">
          <h2 style={{ fontSize: "var(--doppl-fs-lg)", margin: 0 }}>Operator</h2>
          <RunConfigPanel />
          <StopControl />
          <HealthPanel />
        </aside>
        <main style={mainStyle} data-rail="main">
          <div
            style={{
              height: 360,
              border: "1px solid var(--doppl-border)",
              borderRadius: 8,
              overflow: "hidden",
            }}
            data-panel="lineage"
          >
            <LineageGraph />
          </div>
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
          <EnergyPanel />
          <FinalIdeaPanel />
        </main>
        <aside
          style={{ ...railStyle, borderRight: "none", borderLeft: "1px solid var(--doppl-border)" }}
          data-rail="right"
        >
          <CandidateInspector />
          <CriticGauntlet />
          <CheckEvidence />
        </aside>
      </div>
    </div>
  );
}
