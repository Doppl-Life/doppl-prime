import type { JSX } from "react";
import { useEnergyByAgenome, useRunState, useRunStore } from "../state/runStore.js";

/**
 * Energy-per-agenome panel (P7.9). Sortable table of agenomes by
 * accumulated doppl_energy spend. Per-row: status indicator, energy
 * total, progress bar against the configured energyBudget cap.
 * Highlights energy_exhausted state when present.
 */

interface RunCapsConfig {
  energyBudget?: number;
}

export function EnergyPanel(): JSX.Element {
  const rows = useEnergyByAgenome();
  const state = useRunState();
  const { dispatch } = useRunStore();
  const energyBudget = (state.run?.capsConfig as RunCapsConfig | undefined)?.energyBudget ?? 0;
  const exhausted = state.failureEvents.some((f) => f.type === "energy_exhausted");

  const sorted = [...rows].sort((a, b) => b.total - a.total);

  return (
    <section aria-label="Energy per agenome" data-panel="energy">
      <h2 style={{ fontSize: "var(--doppl-fs-lg)", margin: "0 0 8px" }}>Energy spend</h2>
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
              <th>Agenome</th>
              <th>Energy spent (success only)</th>
              <th>Of budget</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
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
                <td>{row.agenomeId}</td>
                <td>{row.total.toFixed(2)}</td>
                <td>
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
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
