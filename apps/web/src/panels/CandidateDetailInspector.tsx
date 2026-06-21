import { type JSX } from "react";
import { useRunState, useRunStore } from "../state/runStore.js";
import { Tooltip } from "../ui/Tooltip.js";
import { CandidateInspector } from "./CandidateInspector.js";
import { CheckEvidence } from "./CheckEvidence.js";
import { CriticGauntlet } from "./CriticGauntlet.js";

/**
 * CandidateDetailInspector (UX restructure). The three former candidate
 * panels — CandidateInspector, CriticGauntlet, CheckEvidence — are all
 * detail views of the *same* selected candidate. This merges them into
 * one tabbed inspector surfaced as a top-level Inspector view tab
 * (alongside Dashboard / Activity). The tab only appears once a candidate
 * is selected from the lineage graph (state.selection.candidateId); the
 * Close button clears the selection, which dismisses the tab and returns
 * the operator to the dashboard.
 */

type DetailTab = "overview" | "critics" | "evidence";

const TABS: { key: DetailTab; label: string; tip: string }[] = [
  { key: "overview", label: "Overview", tip: "Candidate summary, lineage and fitness score" },
  { key: "critics", label: "Critics", tip: "Verdicts and scores from the adversarial critic council" },
  { key: "evidence", label: "Evidence", tip: "Verification checks run against this candidate" },
];

export function CandidateDetailInspector(): JSX.Element | null {
  const state = useRunState();
  const { dispatch } = useRunStore();
  const tab: DetailTab = state.selection.inspectorTab ?? "overview";

  const candidateId = state.selection.candidateId;
  if (!candidateId) return null;

  return (
    <section
      data-detail="inspector"
      aria-label="Candidate inspector"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ fontSize: "var(--doppl-fs-lg)", margin: 0 }}>Inspector</h2>
        <Tooltip label="Close the inspector (clears the lineage selection)" placement="left">
        <button
          type="button"
          aria-label="Close inspector"
          onClick={() => dispatch({ kind: "SELECT_CANDIDATE", candidateId: null })}
          style={{
            background: "var(--doppl-bg-input)",
            color: "var(--doppl-text-primary)",
            border: "1px solid var(--doppl-hairline)",
            boxShadow: "none",
            padding: "4px 10px",
            fontSize: 14,
            letterSpacing: 0,
            textTransform: "none",
          }}
        >
          ✕
        </button>
        </Tooltip>
      </div>

      <div role="tablist" aria-label="Candidate detail" style={{ display: "flex", gap: 6 }}>
        {TABS.map(({ key, label, tip }) => {
          const active = tab === key;
          return (
            <Tooltip key={key} label={tip} placement="bottom">
              <button
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => dispatch({ kind: "SET_INSPECTOR_TAB", tab: key })}
                style={{
                  background: active ? "var(--doppl-accent)" : "var(--doppl-bg-input)",
                  color: active ? "var(--doppl-on-accent)" : "var(--doppl-text-primary)",
                  border: active
                    ? "1px solid var(--doppl-accent-hover)"
                    : "1px solid var(--doppl-hairline)",
                  boxShadow: active ? "0 0 12px var(--doppl-accent-glow)" : "none",
                  padding: "6px 12px",
                  fontSize: 14,
                  letterSpacing: 0,
                  textTransform: "none",
                  fontWeight: 700,
                }}
              >
                {label}
              </button>
            </Tooltip>
          );
        })}
      </div>

      <div data-detail-tab={tab}>
        {tab === "overview" && <CandidateInspector />}
        {tab === "critics" && <CriticGauntlet />}
        {tab === "evidence" && <CheckEvidence />}
      </div>
    </section>
  );
}
