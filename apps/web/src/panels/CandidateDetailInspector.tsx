import { type JSX, useState } from "react";
import { useRunState, useRunStore } from "../state/runStore.js";
import { CandidateInspector } from "./CandidateInspector.js";
import { CheckEvidence } from "./CheckEvidence.js";
import { CriticGauntlet } from "./CriticGauntlet.js";

/**
 * CandidateDetailInspector (UX restructure). The three former candidate
 * panels — CandidateInspector, CriticGauntlet, CheckEvidence — are all
 * detail views of the *same* selected candidate. This merges them into
 * one right-docked, tabbed inspector that only appears once a candidate
 * is selected from the lineage graph (state.selection.candidateId), and
 * is dismissible. Master-detail, not three scattered empty boxes.
 */

type DetailTab = "overview" | "critics" | "evidence";

const TABS: { key: DetailTab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "critics", label: "Critics" },
  { key: "evidence", label: "Evidence" },
];

export function CandidateDetailInspector(): JSX.Element | null {
  const state = useRunState();
  const { dispatch } = useRunStore();
  const [tab, setTab] = useState<DetailTab>("overview");

  const candidateId = state.selection.candidateId;
  if (!candidateId) return null;

  return (
    <aside
      data-rail="inspector"
      aria-label="Candidate inspector"
      style={{
        background: "var(--doppl-bg-elevated)",
        borderLeft: "3px solid #000",
        padding: 16,
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ fontSize: "var(--doppl-fs-lg)", margin: 0 }}>Inspector</h2>
        <button
          type="button"
          aria-label="Close inspector"
          onClick={() => dispatch({ kind: "SELECT_CANDIDATE", candidateId: null })}
          style={{
            background: "var(--doppl-bg-input)",
            color: "var(--doppl-text-primary)",
            border: "2px solid #000",
            boxShadow: "none",
            padding: "4px 10px",
            fontSize: 14,
            letterSpacing: 0,
            textTransform: "none",
          }}
        >
          ✕
        </button>
      </div>

      <div role="tablist" aria-label="Candidate detail" style={{ display: "flex", gap: 6 }}>
        {TABS.map(({ key, label }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(key)}
              style={{
                background: active ? "var(--doppl-accent)" : "var(--doppl-bg-input)",
                color: "var(--doppl-text-primary)",
                border: "2px solid #000",
                boxShadow: active ? "2px 2px 0 #000" : "none",
                padding: "6px 12px",
                fontSize: 14,
                letterSpacing: 0,
                textTransform: "none",
                fontWeight: 700,
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div data-detail-tab={tab}>
        {tab === "overview" && <CandidateInspector />}
        {tab === "critics" && <CriticGauntlet />}
        {tab === "evidence" && <CheckEvidence />}
      </div>
    </aside>
  );
}
