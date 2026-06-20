import { type JSX, useMemo, useState } from "react";
import type { ActivityEventView } from "../state/reducer.js";
import { type ActivityLane, useAgentActivityLanes, useRunState } from "../state/runStore.js";

/**
 * Agent activity timeline. Equivalent of redteam-forge's Pipeline Timeline:
 * one lane per agenome (plus a synthetic "Pipeline" lane for run/generation
 * events), each lane collapsible to a timestamped event list.
 *
 * Data source is the SSE-fed activityEventLog on RunStoreState — no extra
 * polling needed; entries flow in as the stream advances.
 */

export function shortId(id: string): string {
  return id.length <= 10 ? id : `${id.slice(0, 8)}…`;
}

export function formatTime(iso: string): string {
  // HH:MM:SS local — matches the redteam-forge column.
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString([], { hour12: false });
}

/** Summarize an event's payload into a single dense line (tokens · cost · verdict). */
export function describeEvent(ev: ActivityEventView): string {
  const p = ev.payload as Record<string, unknown> | null;
  if (!p || typeof p !== "object") return "";
  const parts: string[] = [];
  if (ev.type === "energy.spent") {
    const e = (p as { energy?: { actual?: number; estimate?: number; eventType?: string } }).energy;
    if (e) {
      const v = e.actual ?? e.estimate ?? 0;
      parts.push(`energy=${v.toFixed(2)}`);
      if (e.eventType) parts.push(e.eventType);
    }
  } else if (ev.type === "critic.reviewed") {
    const r = (p as { review?: { verdict?: string; criticId?: string; score?: number } }).review;
    if (r?.verdict) parts.push(`verdict=${r.verdict}`);
    if (r?.criticId) parts.push(r.criticId);
    if (typeof r?.score === "number") parts.push(`score=${r.score.toFixed(2)}`);
  } else if (ev.type === "check.completed") {
    const r = (p as { result?: { kind?: string; passed?: boolean } }).result;
    if (r?.kind) parts.push(r.kind);
    if (typeof r?.passed === "boolean") parts.push(r.passed ? "pass" : "fail");
  } else if (ev.type === "fitness.scored") {
    const f = (p as { fitness?: { total?: number } }).fitness;
    if (typeof f?.total === "number") parts.push(`score=${f.total.toFixed(2)}`);
  } else if (ev.type === "candidate.created") {
    const c = (p as { candidate?: { subtype?: string; status?: string } }).candidate;
    if (c?.subtype) parts.push(c.subtype);
    if (c?.status) parts.push(c.status);
  } else if (ev.type === "generation.started" || ev.type === "generation.completed") {
    const idx = (p as { index?: number; candidateCount?: number }).index;
    const n = (p as { candidateCount?: number }).candidateCount;
    if (typeof idx === "number") parts.push(`index=${idx}`);
    if (typeof n === "number") parts.push(`candidates=${n}`);
  }
  return parts.join(" · ");
}

function laneHeadline(lane: ActivityLane): { left: string; right: string } {
  if (lane.agenomeId === null) return { left: "Pipeline", right: `${lane.events.length} events` };
  const right: string[] = [];
  if (lane.latestFitness !== null) right.push(`fit=${lane.latestFitness.toFixed(2)}`);
  if (lane.latestVerdict) right.push(lane.latestVerdict);
  if (lane.energyTotal > 0) right.push(`E=${lane.energyTotal.toFixed(1)}`);
  return {
    left: shortId(lane.agenomeId),
    right: right.join(" · ") || `${lane.events.length} events`,
  };
}

function badgeColor(lane: ActivityLane): string {
  if (lane.hasFailure) return "var(--doppl-status-error)";
  if (lane.latestVerdict === "reject") return "var(--doppl-status-error)";
  if (lane.latestVerdict === "approve") return "var(--doppl-status-success, #1FB890)";
  return "var(--doppl-status-info)";
}

function ActivityLaneRow({ lane }: { lane: ActivityLane }): JSX.Element {
  const [open, setOpen] = useState(false);
  const headline = laneHeadline(lane);
  return (
    <div
      style={{
        border: "1px solid var(--doppl-border)",
        borderRadius: 6,
        marginBottom: 8,
        background: "var(--doppl-bg-elevated)",
      }}
      data-lane={lane.laneKey}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          width: "100%",
          padding: "8px 12px",
          background: "transparent",
          border: "none",
          color: "var(--doppl-text-primary)",
          font: "inherit",
          cursor: "pointer",
          textAlign: "left",
        }}
        aria-expanded={open}
      >
        <span
          aria-hidden
          style={{
            display: "inline-block",
            transform: open ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 0.12s",
            width: 12,
            color: "var(--doppl-text-secondary)",
          }}
        >
          ▶
        </span>
        <span style={{ fontFamily: "var(--doppl-mono, monospace)", fontSize: 13 }}>
          {headline.left}
        </span>
        <span style={{ flex: 1, color: "var(--doppl-text-secondary)", fontSize: 12 }}>
          {lane.events.length} events · last {formatTime(lane.lastAt)}
        </span>
        <span
          style={{
            background: badgeColor(lane),
            color: "var(--doppl-bg-base, #fff)",
            padding: "2px 8px",
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          {headline.right}
        </span>
      </button>
      {open && (
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: "4px 12px 10px 12px",
            borderTop: "1px solid var(--doppl-border)",
            fontSize: 12,
            fontFamily: "var(--doppl-mono, monospace)",
          }}
        >
          {lane.events.map((ev) => (
            <li
              key={ev.sequence}
              style={{
                display: "grid",
                gridTemplateColumns: "78px 90px 1fr",
                gap: 8,
                padding: "3px 0",
                color: "var(--doppl-text-primary)",
              }}
            >
              <span style={{ color: "var(--doppl-text-secondary)" }}>
                {formatTime(ev.occurredAt)}
              </span>
              <span style={{ color: "var(--doppl-text-secondary)" }}>{ev.actor}</span>
              <span>
                <span style={{ fontWeight: 600 }}>{ev.type}</span>
                {describeEvent(ev) && (
                  <span style={{ color: "var(--doppl-text-secondary)" }}>
                    {" "}
                    — {describeEvent(ev)}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AgentActivityPanel(): JSX.Element {
  const lanes = useAgentActivityLanes();
  const state = useRunState();
  const totalEvents = useMemo(() => lanes.reduce((n, l) => n + l.events.length, 0), [lanes]);

  return (
    <section aria-label="Agent activity">
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <h2 style={{ fontSize: "var(--doppl-fs-lg)", margin: 0 }}>Agent activity</h2>
        <span style={{ color: "var(--doppl-text-secondary)", fontSize: 12 }}>
          {totalEvents} events · live via SSE · sequence ≤ {state.sequenceThrough}
        </span>
      </div>
      {lanes.length === 0 ? (
        <p style={{ color: "var(--doppl-text-secondary)" }}>No activity yet.</p>
      ) : (
        <div data-panel="activity-lanes">
          {lanes.map((lane) => (
            <ActivityLaneRow key={lane.laneKey} lane={lane} />
          ))}
        </div>
      )}
    </section>
  );
}
