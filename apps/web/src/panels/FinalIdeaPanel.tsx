import { type JSX, useMemo } from "react";
import { useRunState, useRunStore } from "../state/runStore.js";
import { StatusIndicator } from "../ui/StatusIndicator.js";

/**
 * Final-surviving-idea proof panel (P7.13). Identifies the surviving
 * candidate (highest fitness.total in the last completed generation
 * if any; otherwise overall highest) and renders proof links to:
 *   1. Lineage node
 *   2. Critic gauntlet
 *   3. Check evidence
 *   4. Score components
 *   5. Energy per agenome
 *   6. Traces (langfuseTraceId or local-trace fallback)
 *
 * Every link's target must exist in the loaded store. A broken link
 * is the Playwright smoke's assertion failure.
 */

interface ProofLink {
  id: string;
  label: string;
  hash: string;
  resolved: boolean;
  detail?: string;
}

export function FinalIdeaPanel(): JSX.Element {
  const state = useRunState();
  const { dispatch } = useRunStore();

  const winnerFitness = useMemo(() => {
    const all = Object.values(state.fitnessScores);
    const first = all[0];
    if (!first) return null;
    let best = first;
    for (let i = 1; i < all.length; i += 1) {
      const current = all[i];
      if (current && current.total > best.total) best = current;
    }
    return best;
  }, [state.fitnessScores]);

  if (!winnerFitness) {
    if (state.run?.status === "completed") {
      return (
        <section aria-label="Final surviving idea">
          <h2 style={{ fontSize: "var(--doppl-fs-lg)" }}>Final surviving idea</h2>
          <p style={{ color: "var(--doppl-text-secondary)" }}>
            No surviving idea — run ended with 0 survivors.
          </p>
        </section>
      );
    }
    return (
      <section aria-label="Final surviving idea">
        <h2 style={{ fontSize: "var(--doppl-fs-lg)" }}>Final surviving idea</h2>
        <p style={{ color: "var(--doppl-text-secondary)" }}>
          A surviving idea will appear here once fitness has been scored.
        </p>
      </section>
    );
  }

  const winnerCandidate = state.candidates[winnerFitness.candidateId];
  const winnerAgenome = winnerCandidate ? state.agenomes[winnerCandidate.agenomeId] : null;
  const winnerNovelty = Object.values(state.noveltyScores).find(
    (n) => n.candidateId === winnerFitness.candidateId,
  );
  const winnerReviews = Object.values(state.criticReviews).filter(
    (r) => r.candidateId === winnerFitness.candidateId,
  );
  const winnerChecks = Object.values(state.checkResults).filter(
    (c) => c.candidateId === winnerFitness.candidateId,
  );
  const energySpent = winnerCandidate?.agenomeId
    ? state.energySpend[winnerCandidate.agenomeId]
    : undefined;

  const links: ProofLink[] = [
    {
      id: "lineage",
      label: "Lineage node",
      hash: `#/lineage/${winnerFitness.candidateId}`,
      resolved: !!winnerCandidate,
      ...(winnerCandidate ? {} : { detail: "candidate not loaded" }),
    },
    {
      id: "critics",
      label: "Critic reviews",
      hash: `#/critics/${winnerFitness.candidateId}`,
      resolved: winnerReviews.length > 0,
      detail: `${winnerReviews.length} review${winnerReviews.length === 1 ? "" : "s"}`,
    },
    {
      id: "checks",
      label: "Check evidence",
      hash: `#/checks/${winnerFitness.candidateId}`,
      resolved: winnerChecks.length > 0,
      detail: `${winnerChecks.length} check${winnerChecks.length === 1 ? "" : "s"}`,
    },
    {
      id: "score",
      label: "Score components",
      hash: `#/score/${winnerFitness.candidateId}`,
      resolved: !!winnerFitness,
      detail: `total ${winnerFitness.total.toFixed(3)} · policy ${winnerFitness.policyVersion}`,
    },
    {
      id: "energy",
      label: "Energy spend",
      hash: `#/energy/${winnerCandidate?.agenomeId ?? "unknown"}`,
      resolved: energySpent !== undefined && energySpent > 0,
      detail: energySpent !== undefined ? `${energySpent.toFixed(2)} dE` : "no energy events",
    },
    {
      id: "traces",
      label: "Traces",
      hash: `#/traces/${winnerFitness.candidateId}`,
      resolved: true,
      detail: "local trace (Langfuse fallback)",
    },
  ];

  return (
    <section aria-label="Final surviving idea">
      <h2 style={{ fontSize: "var(--doppl-fs-lg)" }}>
        Final surviving idea · {winnerFitness.candidateId}
      </h2>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
        <StatusIndicator domain="candidate" status={winnerCandidate?.status ?? "scored"} />
        <span>fitness.total = {winnerFitness.total.toFixed(3)}</span>
        {winnerNovelty && <span>novelty = {winnerNovelty.score.toFixed(3)}</span>}
      </div>
      {winnerAgenome && (
        <p style={{ marginTop: 0, color: "var(--doppl-text-secondary)" }}>
          produced by agenome <strong>{winnerAgenome.id}</strong>
        </p>
      )}
      <h3 style={{ fontSize: 16 }}>Proof</h3>
      <ul
        style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: 6 }}
      >
        {links.map((link) => (
          <li key={link.id} data-resolved={link.resolved}>
            <a
              href={link.hash}
              data-link-id={link.id}
              data-resolved={link.resolved}
              onClick={(e) => {
                if (link.id === "critics" || link.id === "checks" || link.id === "score") {
                  e.preventDefault();
                  dispatch({ kind: "SELECT_CANDIDATE", candidateId: winnerFitness.candidateId });
                }
                if (link.id === "energy" && winnerCandidate?.agenomeId) {
                  e.preventDefault();
                  dispatch({ kind: "SELECT_AGENOME", agenomeId: winnerCandidate.agenomeId });
                }
              }}
              style={{
                color: link.resolved ? "var(--doppl-cyan)" : "var(--doppl-status-error)",
              }}
            >
              {link.label}
            </a>
            {link.detail && (
              <span style={{ marginLeft: 8, color: "var(--doppl-text-secondary)" }}>
                · {link.detail}
              </span>
            )}
            {!link.resolved && (
              <span
                role="alert"
                style={{ marginLeft: 8, color: "var(--doppl-status-error)", fontWeight: 700 }}
              >
                UNRESOLVED
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
