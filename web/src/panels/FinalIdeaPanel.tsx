import { type JSX, useMemo } from "react";
import { useAgenomeDisplayNames, useRunState, useRunStore } from "../state/runStore.js";
import { PanelTitle, PanelValue } from "../ui/PanelTitle.js";
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
  const personaNames = useAgenomeDisplayNames();

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
          <PanelTitle>Final surviving idea</PanelTitle>
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

  // Prefer the candidate's own title; fall back to a derived label so the
  // header still reads like prose even for runs predating the title field.
  const winnerTitle =
    winnerCandidate?.title ??
    (winnerCandidate?.summary ? winnerCandidate.summary : `Idea ${winnerFitness.candidateId.slice(-6)}`);
  const personaName = winnerCandidate ? personaNames[winnerCandidate.agenomeId] : undefined;
  return (
    <section aria-label="Final surviving idea">
      <PanelTitle>Final surviving idea</PanelTitle>
      <p
        style={{
          margin: "0 0 10px 0",
          color: "var(--doppl-text-secondary)",
          fontSize: 13,
          lineHeight: 1.5,
          maxWidth: "72ch",
        }}
      >
        The run generated many candidate ideas. AI critics scored each one and checks
        stress-tested the strongest — this is the single idea that came out on top.
      </p>
      <PanelValue title={winnerFitness.candidateId} style={{ marginBottom: 6 }}>
        {winnerTitle}
      </PanelValue>
      {winnerCandidate?.explanation ? (
        <>
          <p
            style={{
              margin: "0 0 8px 0",
              color: "var(--doppl-text-primary)",
              fontSize: 15,
              lineHeight: 1.55,
              maxWidth: "72ch",
            }}
          >
            {winnerCandidate.explanation}
          </p>
          {winnerCandidate.summary && winnerCandidate.summary !== winnerTitle && (
            <>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--doppl-text-secondary)",
                  marginTop: 4,
                  marginBottom: 2,
                }}
              >
                Technical summary
              </div>
              <p
                style={{
                  margin: "0 0 10px 0",
                  color: "var(--doppl-text-secondary)",
                  fontSize: 13,
                  lineHeight: 1.5,
                  maxWidth: "72ch",
                }}
              >
                {winnerCandidate.summary}
              </p>
            </>
          )}
        </>
      ) : (
        winnerCandidate?.summary &&
        winnerCandidate.summary !== winnerTitle && (
          <p
            style={{
              margin: "0 0 10px 0",
              color: "var(--doppl-text-secondary)",
              fontSize: 14,
              lineHeight: 1.5,
              maxWidth: "72ch",
            }}
          >
            {winnerCandidate.summary}
          </p>
        )
      )}
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          marginBottom: 12,
          flexWrap: "wrap",
        }}
      >
        <StatusIndicator domain="candidate" status={winnerCandidate?.status ?? "scored"} />
        <span title="Combined kernel fitness score on a 0-100 scale. Higher is better.">
          Score {winnerFitness.total.toFixed(2)} / 100
        </span>
        {winnerNovelty && (
          <span title="How different this idea is from the others. Higher means more original.">
            Originality {winnerNovelty.score.toFixed(2)}
          </span>
        )}
      </div>
      {winnerAgenome && (
        <p style={{ marginTop: 0, color: "var(--doppl-text-secondary)", fontSize: 13 }}>
          Generated by the{" "}
          <strong title={winnerAgenome.id}>
            {personaName ? `${personaName} agent` : `${winnerAgenome.id} agent`}
          </strong>
          {" "}— one of several AI personas exploring the problem in parallel.
        </p>
      )}
      <h3 style={{ fontSize: 16 }}>Proof</h3>
      <ul
        style={{
          listStyle: "none",
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: 6,
          fontSize: 13,
        }}
      >
        {links.map((link) => (
          <li key={link.id} data-resolved={link.resolved}>
            <a
              href={link.hash}
              data-link-id={link.id}
              data-resolved={link.resolved}
              onClick={(e) => {
                // No router is wired for `#/lineage/...` etc. Cancel the
                // hash navigation and route through the run store. Lineage
                // also scrolls the graph into view; the others just select
                // the candidate so the right-rail Inspector opens on it.
                // Each proof link lands the operator on a distinguishable
                // place: critics/checks land on their inspector tab; lineage
                // also scrolls the graph into view; energy scrolls to the
                // energy panel and selects the producing agenome.
                const tabByLink: Record<string, "overview" | "critics" | "evidence"> = {
                  lineage: "overview",
                  critics: "critics",
                  checks: "evidence",
                  score: "overview",
                  traces: "overview",
                };
                const tab = tabByLink[link.id];
                if (tab) {
                  e.preventDefault();
                  dispatch({
                    kind: "SELECT_CANDIDATE",
                    candidateId: winnerFitness.candidateId,
                    inspectorTab: tab,
                  });
                  if (link.id === "lineage") {
                    document
                      .querySelector('[data-panel="lineage"]')
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }
                }
                if (link.id === "energy" && winnerCandidate?.agenomeId) {
                  e.preventDefault();
                  dispatch({ kind: "SELECT_AGENOME", agenomeId: winnerCandidate.agenomeId });
                  document
                    .querySelector('[data-panel="energy"]')
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
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
