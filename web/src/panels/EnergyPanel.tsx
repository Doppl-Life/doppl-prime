import type { JSX } from "react";
import {
  useAgenomeDisplayNames,
  useEnergyByAgenome,
  useRunState,
  useRunStore,
} from "../state/runStore.js";
import { PanelTitle } from "../ui/PanelTitle.js";

/**
 * Energy-per-agenome panel (P7.9). Sortable table of agenomes by
 * accumulated doppl_energy spend. Per-row: persona name (with
 * seed/descendant marker and id tail), energy total, progress bar
 * against the configured energyBudget cap. Highlights energy_exhausted
 * state when present.
 */

interface RunCapsConfig {
  energyBudget?: number;
}

// Header cells: small uppercase muted labels on a tinted band with a
// solid underline, so the heading reads as a header and not just a
// bolder first data row.
const energyHeadStyle: React.CSSProperties = {
  padding: "8px 12px",
  background: "var(--doppl-bg-input)",
  borderBottom: "2px solid var(--doppl-border)",
  color: "var(--doppl-text-secondary)",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  whiteSpace: "nowrap",
};

const energyCellStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderBottom: "1px solid var(--doppl-hairline)",
  verticalAlign: "middle",
};

export function EnergyPanel(): JSX.Element {
  const rows = useEnergyByAgenome();
  const state = useRunState();
  const personaNames = useAgenomeDisplayNames();
  const { dispatch } = useRunStore();
  const energyBudget = (state.run?.capsConfig as RunCapsConfig | undefined)?.energyBudget ?? 0;
  const exhausted = state.failureEvents.some((f) => f.type === "energy_exhausted");

  const sorted = [...rows].sort((a, b) => b.total - a.total);

  return (
    <section aria-label="Energy per agenome" data-panel="energy">
      <PanelTitle style={{ marginBottom: 4 }}>Energy spend</PanelTitle>
      <p
        style={{
          margin: "0 0 10px 0",
          color: "var(--doppl-text-secondary)",
          fontSize: 13,
          lineHeight: 1.4,
          maxWidth: "72ch",
        }}
      >
        Each agent in the run draws from a shared energy budget for model calls
        and tool use. Agents inherit a persona (Skeptic, Rigorist, etc.) from
        their root ancestor — "seed" rows are the original gen-0 agents,
        "descendant" rows were spawned later by mutation or fusion.
      </p>
      {exhausted && (
        <div
          role="alert"
          style={{
            background: "var(--doppl-bg-elevated)",
            borderLeft: "4px solid var(--doppl-status-error)",
            padding: "8px 12px",
            marginBottom: 8,
          }}
        >
          energy_exhausted — the run hit its energyBudget cap.
        </div>
      )}
      {sorted.length === 0 ? (
        <p style={{ color: "var(--doppl-text-secondary)" }}>No energy events yet.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "left" }}>
              <th style={energyHeadStyle}>Agenome</th>
              <th style={energyHeadStyle}>Energy spent (success only)</th>
              <th style={energyHeadStyle}>Of budget</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const ag = state.agenomes[row.agenomeId];
              const persona = personaNames[row.agenomeId] ?? "Unknown";
              const isSeed = ag?.parentIds.length === 0;
              const lineageLabel = isSeed ? "seed" : "descendant";
              const idTail = row.agenomeId.slice(-6);
              return (
                <tr
                  key={row.agenomeId}
                  onClick={() => dispatch({ kind: "SELECT_AGENOME", agenomeId: row.agenomeId })}
                  onKeyUp={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      dispatch({ kind: "SELECT_AGENOME", agenomeId: row.agenomeId });
                    }
                  }}
                  tabIndex={0}
                  style={{ cursor: "pointer" }}
                >
                  <td style={energyCellStyle}>
                    <div style={{ fontWeight: 700, color: "var(--doppl-text-primary)" }}>
                      {persona}
                    </div>
                    <div
                      style={{ fontSize: 12, color: "var(--doppl-text-secondary)" }}
                      title={row.agenomeId}
                    >
                      {lineageLabel} · #{idTail}
                    </div>
                  </td>
                  <td style={energyCellStyle}>{row.total.toFixed(2)}</td>
                  <td style={energyCellStyle}>
                    <div
                      style={{
                        background: "var(--doppl-bg-input)",
                        height: 8,
                        borderRadius: 4,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${
                            energyBudget > 0 ? Math.min(100, (row.total / energyBudget) * 100) : 0
                          }%`,
                          height: "100%",
                          background: exhausted
                            ? "var(--doppl-status-error)"
                            : "var(--doppl-status-info)",
                        }}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
