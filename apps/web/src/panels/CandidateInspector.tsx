import { type JSX, useEffect, useState } from "react";
import { useRunState, useRunStore } from "../state/runStore.js";
import { StatusIndicator } from "../ui/StatusIndicator.js";
import { EvidenceRefLink } from "./evidenceRef.js";

/**
 * Candidate inspector (P7.10). Loads the selected candidate via
 * GET /runs/:id/candidates/:cid and renders its CandidateIdea fields.
 * Both subtype payloads render without crashing the other; an
 * unknown payload field degrades gracefully via a "(unsupported
 * field)" placeholder.
 */

interface CandidateInspectorResponse {
  runId: string;
  candidate?: {
    id: string;
    runId: string;
    generationId: string;
    agenomeId: string;
    subtype: string;
    title: string;
    summary: string;
    claims: string[];
    evidenceRefs: import("../data/contracts.js").EvidenceRefT[];
    status: string;
    subtypePayload?: Record<string, unknown>;
  };
  criticReviews?: unknown[];
  checkResults?: unknown[];
  noveltyScore?: unknown;
  fitnessScore?: unknown;
}

function isCrossDomain(payload?: Record<string, unknown>): boolean {
  return !!payload && "sourceDomain" in payload;
}

function isZeitgeist(payload?: Record<string, unknown>): boolean {
  return !!payload && "thesis" in payload;
}

function CrossDomainBlock({ payload }: { payload: Record<string, unknown> }): JSX.Element {
  const get = (k: string) =>
    typeof payload[k] === "string" ? (payload[k] as string) : "(unsupported field)";
  return (
    <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 4 }}>
      <dt>Source domain</dt>
      <dd>{get("sourceDomain")}</dd>
      <dt>Source technique</dt>
      <dd>{get("sourceTechnique")}</dd>
      <dt>Target domain</dt>
      <dd>{get("targetDomain")}</dd>
      <dt>Target problem</dt>
      <dd>{get("targetProblem")}</dd>
      <dt>Transfer mapping</dt>
      <dd>{get("transferMapping")}</dd>
      <dt>Expected mechanism</dt>
      <dd>{get("expectedMechanism")}</dd>
    </dl>
  );
}

function ZeitgeistBlock({ payload }: { payload: Record<string, unknown> }): JSX.Element {
  const str = (k: string) =>
    typeof payload[k] === "string" ? (payload[k] as string) : "(unsupported field)";
  const arr = (k: string) =>
    Array.isArray(payload[k]) ? (payload[k] as unknown[]).map(String) : ["(unsupported field)"];
  return (
    <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 4 }}>
      <dt>Thesis</dt>
      <dd>{str("thesis")}</dd>
      <dt>Audience</dt>
      <dd>{str("audience")}</dd>
      <dt>Current signals</dt>
      <dd>{arr("currentSignals").join(", ")}</dd>
      <dt>Why now</dt>
      <dd>{str("whyNow")}</dd>
      <dt>Falsifiable predictions</dt>
      <dd>
        <ul>
          {arr("falsifiablePredictions").map((p, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: predictions are read-only static text
            <li key={`${p}-${i}`}>{p}</li>
          ))}
        </ul>
      </dd>
      <dt>Prior art</dt>
      <dd>{arr("comparablePriorArt").join(", ")}</dd>
    </dl>
  );
}

export function CandidateInspector(): JSX.Element {
  const state = useRunState();
  const { client } = useRunStore();
  const candidateId = state.selection.candidateId;
  const [data, setData] = useState<CandidateInspectorResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!state.runId || !candidateId) return;
    let cancelled = false;
    setError(null);
    void client
      .getCandidate(state.runId, candidateId)
      .then((d) => {
        if (!cancelled) setData(d as CandidateInspectorResponse);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [state.runId, candidateId, client]);

  if (!candidateId) {
    return (
      <section aria-label="Candidate inspector">
        <h2 style={{ fontSize: "var(--doppl-fs-lg)" }}>Candidate inspector</h2>
        <p style={{ color: "var(--doppl-text-secondary)" }}>
          Select a candidate from the lineage to inspect it.
        </p>
      </section>
    );
  }
  if (error) {
    return (
      <section aria-label="Candidate inspector">
        <h2 style={{ fontSize: "var(--doppl-fs-lg)" }}>Candidate inspector</h2>
        <p role="alert" style={{ color: "var(--doppl-status-error)" }}>
          {error}
        </p>
      </section>
    );
  }
  if (!data?.candidate) {
    return (
      <section aria-label="Candidate inspector">
        <h2 style={{ fontSize: "var(--doppl-fs-lg)" }}>Candidate inspector</h2>
        <p>Loading {candidateId}…</p>
      </section>
    );
  }
  const c = data.candidate;
  return (
    <section aria-label="Candidate inspector">
      <h2 style={{ fontSize: "var(--doppl-fs-lg)" }}>{c.title}</h2>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <StatusIndicator domain="candidate" status={c.status} />
        <span style={{ color: "var(--doppl-text-secondary)" }}>{c.subtype}</span>
      </div>
      <p style={{ marginTop: 8 }}>{c.summary}</p>
      {c.claims.length > 0 && (
        <>
          <h3 style={{ fontSize: 16 }}>Claims</h3>
          <ul>
            {c.claims.map((claim, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: claims are read-only static text
              <li key={`${claim}-${i}`}>{claim}</li>
            ))}
          </ul>
        </>
      )}
      <h3 style={{ fontSize: 16 }}>Subtype payload</h3>
      {isCrossDomain(c.subtypePayload) ? (
        <CrossDomainBlock payload={c.subtypePayload as Record<string, unknown>} />
      ) : isZeitgeist(c.subtypePayload) ? (
        <ZeitgeistBlock payload={c.subtypePayload as Record<string, unknown>} />
      ) : (
        <p style={{ color: "var(--doppl-text-muted)" }}>(unrecognized subtype payload)</p>
      )}
      {c.evidenceRefs.length > 0 && (
        <>
          <h3 style={{ fontSize: 16 }}>Evidence</h3>
          <ul>
            {c.evidenceRefs.map((ref, i) => (
              <li key={`${ref.kind}-${i}`}>
                <EvidenceRefLink reference={ref} />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
