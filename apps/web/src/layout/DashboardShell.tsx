import type { JSX } from "react";
import { FitnessOverTime } from "../charts/FitnessOverTime.js";
import { GenerationComparison } from "../charts/GenerationComparison.js";
import { OperatorPromptPanel } from "../demo/OperatorPromptPanel.js";
import { LineageGraph } from "../lineage/LineageGraph.js";
import { CandidateDetailInspector } from "../panels/CandidateDetailInspector.js";
import { EnergyPanel } from "../panels/EnergyPanel.js";
import { FinalIdeaPanel } from "../panels/FinalIdeaPanel.js";
import { HealthPanel } from "../panels/HealthPanel.js";
import { ModeIndicator } from "../panels/ModeIndicator.js";
import { RunConfigPanel } from "../panels/RunConfigPanel.js";
import { StopControl } from "../panels/StopControl.js";
import { useRunState } from "../state/runStore.js";
import { ActivityDrawer } from "./ActivityDrawer.js";

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
 * The candidate detail panels are merged into a right-docked Inspector
 * that only appears on lineage selection, and the Agent activity
 * firehose lives in a collapsible bottom drawer.
 */

const TERMINAL_STATUSES = new Set(["completed", "stopped", "failed", "cancelled"]);
type Phase = "setup" | "live" | "review";

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
  const status = state.run?.status ?? (state.runId ? "running" : "idle");
  const phase: Phase = !state.runId
    ? "setup"
    : TERMINAL_STATUSES.has(status)
      ? "review"
      : "live";
  const inspectorOpen = state.selection.candidateId != null;

  const bodyColumns = [phase === "setup" ? "340px" : "300px", "1fr", inspectorOpen ? "380px" : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div style={{ display: "grid", gridTemplateRows: "1fr auto", height: "100vh" }}>
      <div style={{ display: "grid", gridTemplateColumns: bodyColumns, overflow: "hidden" }}>
        <aside style={railStyle} data-rail="left">
          <div
            data-brand
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              paddingBottom: 12,
              borderBottom: "3px solid #000",
            }}
          >
            <h1 style={{ fontSize: "var(--doppl-fs-xl)", margin: 0 }}>Doppl</h1>
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
          {phase === "review" ? (
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

      <ActivityDrawer />
    </div>
  );
}
