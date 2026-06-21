import type { JSX } from "react";
import { useMemo } from "react";
import { useAgenomeDisplayNames, useRunState, useRunStore } from "../state/runStore.js";
import type { CandidateView } from "../state/reducer.js";
import { PanelTitle } from "../ui/PanelTitle.js";
import { StatusIndicator } from "../ui/StatusIndicator.js";

/**
 * AgenomeInspector — side-panel detail view for one agenome. Renders
 * everything reducer state already knows: persona, lineage parents
 * (clickable to drill into ancestors), status, energy spend with %
 * of budget, candidates produced (clickable into CandidateInspector),
 * best fitness across those candidates, and the last 20 activity
 * events that mention this agenome. No server fetch — all reads come
 * from the streamed reducer state.
 */

const RECENT_ACTIVITY_LIMIT = 20;

interface RunCapsConfig {
  energyBudget?: number;
}

export function AgenomeInspector(): JSX.Element {
  const state = useRunState();
  const { dispatch } = useRunStore();
  const personaNames = useAgenomeDisplayNames();
  const agenomeId = state.selection.agenomeId;

  // All hooks must run on every render — compute these unconditionally
  // and bail out below only on the visible content.
  const candidates: CandidateView[] = useMemo(() => {
    if (!agenomeId) return [];
    return Object.values(state.candidates).filter((c) => c.agenomeId === agenomeId);
  }, [agenomeId, state.candidates]);

  const recentActivity = useMemo(() => {
    if (!agenomeId) return [];
    return state.activityEventLog
      .filter((e) => e.agenomeId === agenomeId)
      .slice(-RECENT_ACTIVITY_LIMIT)
      .reverse();
  }, [agenomeId, state.activityEventLog]);

  const bestFitness = useMemo(() => {
    let best: number | null = null;
    for (const c of candidates) {
      const score = state.fitnessScores[c.id]?.total;
      if (typeof score === "number" && (best === null || score > best)) best = score;
    }
    return best;
  }, [candidates, state.fitnessScores]);

  if (!agenomeId) {
    return (
      <section aria-label="Agenome inspector" data-panel="agenome-inspector">
        <PanelTitle>Agenome inspector</PanelTitle>
        <p style={{ color: "var(--doppl-text-secondary)" }}>
          Select an agenome from the Energy panel or the lineage graph to see
          its full detail.
        </p>
      </section>
    );
  }

  const agenome = state.agenomes[agenomeId];
  const personaName = personaNames[agenomeId];
  const energySpent = state.energySpend[agenomeId] ?? 0;
  const energyBudget = (state.run?.capsConfig as RunCapsConfig | undefined)?.energyBudget ?? 0;
  const energyPct = energyBudget > 0 ? Math.min(100, (energySpent / energyBudget) * 100) : null;

  return (
    <section aria-label="Agenome inspector" data-panel="agenome-inspector">
      <PanelTitle>Agenome inspector</PanelTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <header style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h3
              style={{ margin: 0, fontSize: 20, color: "var(--doppl-text-primary)" }}
              title={agenomeId}
            >
              {personaName ?? agenomeId}
            </h3>
            {agenome ? <StatusIndicator domain="agenome" status={agenome.status} size="sm" /> : null}
          </div>
          {personaName ? (
            <div
              style={{
                fontFamily: "var(--doppl-font-mono, monospace)",
                fontSize: 12,
                color: "var(--doppl-text-secondary)",
              }}
            >
              {agenomeId}
            </div>
          ) : null}
        </header>

        <div>
          <div style={{ color: "var(--doppl-text-secondary)", fontSize: 13, marginBottom: 4 }}>
            Lineage
          </div>
          {agenome && agenome.parentIds.length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {agenome.parentIds.map((parentId) => (
                <button
                  key={parentId}
                  type="button"
                  onClick={() => dispatch({ kind: "SELECT_AGENOME", agenomeId: parentId })}
                  style={{
                    fontFamily: "var(--doppl-font-mono, monospace)",
                    fontSize: 12,
                    padding: "2px 8px",
                    borderRadius: 999,
                    border: "1px solid var(--doppl-border)",
                    background: "var(--doppl-bg-input)",
                    color: "var(--doppl-text-primary)",
                    cursor: "pointer",
                  }}
                >
                  {personaNames[parentId] ?? parentId}
                </button>
              ))}
            </div>
          ) : (
            <div style={{ color: "var(--doppl-text-secondary)", fontSize: 13 }}>No parents</div>
          )}
        </div>

        <div>
          <div style={{ color: "var(--doppl-text-secondary)", fontSize: 13, marginBottom: 4 }}>
            Energy
          </div>
          <div
            style={{
              fontVariantNumeric: "tabular-nums",
              color: "var(--doppl-text-primary)",
              fontSize: 14,
            }}
          >
            {energyBudget > 0
              ? `${energySpent.toFixed(2)} / ${energyBudget}`
              : energySpent.toFixed(2)}
            {energyPct !== null ? (
              <span style={{ color: "var(--doppl-text-secondary)", marginLeft: 6 }}>
                {energyPct.toFixed(0)}%
              </span>
            ) : null}
          </div>
        </div>

        <div>
          <div style={{ color: "var(--doppl-text-secondary)", fontSize: 13, marginBottom: 4 }}>
            Best fitness
          </div>
          <div
            style={{
              fontVariantNumeric: "tabular-nums",
              color: "var(--doppl-text-primary)",
              fontSize: 14,
            }}
          >
            {bestFitness !== null ? bestFitness.toFixed(3) : "—"}
          </div>
        </div>

        <div>
          <div style={{ color: "var(--doppl-text-secondary)", fontSize: 13, marginBottom: 4 }}>
            Candidates produced
          </div>
          {candidates.length === 0 ? (
            <div style={{ color: "var(--doppl-text-secondary)", fontSize: 13 }}>
              No candidates produced yet
            </div>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 4 }}>
              {candidates.map((cand) => (
                <li key={cand.id}>
                  <button
                    type="button"
                    onClick={() => dispatch({ kind: "SELECT_CANDIDATE", candidateId: cand.id })}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "6px 10px",
                      borderRadius: 6,
                      border: "1px solid var(--doppl-hairline)",
                      background: "transparent",
                      color: "var(--doppl-text-primary)",
                      cursor: "pointer",
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 8,
                    }}
                  >
                    <span>{cand.title ?? cand.summary ?? cand.id}</span>
                    <span style={{ color: "var(--doppl-text-secondary)", fontSize: 12 }}>
                      {cand.status}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <div style={{ color: "var(--doppl-text-secondary)", fontSize: 13, marginBottom: 4 }}>
            Recent activity
          </div>
          {recentActivity.length === 0 ? (
            <div style={{ color: "var(--doppl-text-secondary)", fontSize: 13 }}>
              No recent activity for this agenome
            </div>
          ) : (
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                display: "flex",
                flexDirection: "column",
                gap: 2,
                fontSize: 12,
              }}
            >
              {recentActivity.map((evt) => (
                <li
                  key={evt.sequence}
                  style={{ display: "flex", gap: 8, color: "var(--doppl-text-secondary)" }}
                >
                  <span style={{ fontFamily: "var(--doppl-font-mono, monospace)" }}>
                    {evt.type}
                  </span>
                  <span>{evt.occurredAt}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
