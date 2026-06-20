import { type JSX, useMemo, useState } from "react";
import type { ActivityEventView } from "../state/reducer.js";
import { useAgentActivityLanes, useRunState } from "../state/runStore.js";
import { describeEvent, formatTime, shortId } from "./AgentActivityPanel.js";

/**
 * AgentActivityTable (UX restructure). The lane drill-down hid the
 * important details one expand-click at a time. This is the flat,
 * scannable alternative used by the dedicated Activity tab: every
 * event in one chronological table with Time / Lane / Type / Actor /
 * Details columns visible at once, a per-row status accent, and a lane
 * filter — no digging into rows.
 */

interface FlatEvent extends ActivityEventView {
  laneLabel: string;
  laneKey: string;
}

type Tone = "error" | "ok" | "info" | "neutral";

function eventTone(ev: ActivityEventView): Tone {
  const d = describeEvent(ev).toLowerCase();
  if (ev.type.includes("fail") || d.includes("verdict=reject") || d.includes("fail")) return "error";
  if (d.includes("verdict=approve") || /\bpass\b/.test(d)) return "ok";
  if (ev.type.startsWith("run.") || ev.type.startsWith("generation.")) return "info";
  return "neutral";
}

const TONE_COLOR: Record<Tone, string> = {
  error: "var(--doppl-status-error)",
  ok: "var(--doppl-status-ok)",
  info: "var(--doppl-status-info)",
  neutral: "var(--doppl-border)",
};

const COLUMNS = "92px 130px minmax(150px, 1fr) 120px minmax(180px, 1.4fr)";

export function AgentActivityTable(): JSX.Element {
  const lanes = useAgentActivityLanes();
  const state = useRunState();
  const [laneFilter, setLaneFilter] = useState<string>("all");

  const flat = useMemo<FlatEvent[]>(() => {
    const out: FlatEvent[] = [];
    for (const lane of lanes) {
      const laneLabel = lane.agenomeId === null ? "Pipeline" : shortId(lane.agenomeId);
      for (const ev of lane.events) {
        out.push({ ...ev, laneLabel, laneKey: lane.laneKey });
      }
    }
    out.sort((a, b) => b.sequence - a.sequence); // newest first
    return out;
  }, [lanes]);

  const laneOptions = useMemo(
    () =>
      lanes.map((l) => ({
        key: l.laneKey,
        label: l.agenomeId === null ? "Pipeline" : shortId(l.agenomeId),
      })),
    [lanes],
  );

  const rows = laneFilter === "all" ? flat : flat.filter((e) => e.laneKey === laneFilter);

  return (
    <section
      aria-label="Agent activity"
      style={{ display: "flex", flexDirection: "column", gap: 12 }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <h2 style={{ fontSize: "var(--doppl-fs-xl)", margin: 0 }}>Agent activity</h2>
        <span style={{ color: "var(--doppl-text-secondary)", fontSize: 13 }}>
          {flat.length} events · live via SSE · sequence ≤ {state.sequenceThrough}
        </span>
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
        <span style={{ fontWeight: 700 }}>Lane</span>
        <select
          value={laneFilter}
          onChange={(e) => setLaneFilter(e.target.value)}
          aria-label="Filter by lane"
          style={{ maxWidth: 280 }}
        >
          <option value="all">All lanes ({flat.length})</option>
          {laneOptions.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      {rows.length === 0 ? (
        <p style={{ color: "var(--doppl-text-secondary)" }}>No activity yet.</p>
      ) : (
        <div
          role="table"
          aria-label="Agent activity events"
          style={{
            border: "1px solid rgba(43,214,255,0.4)",
            borderRadius: "var(--doppl-radius)",
            background: "var(--doppl-bg-elevated)",
            boxShadow: "var(--nb-shadow)",
          }}
        >
          <div
            role="row"
            style={{
              display: "grid",
              gridTemplateColumns: COLUMNS,
              gap: 12,
              padding: "8px 12px",
              borderBottom: "1px solid rgba(43,214,255,0.4)",
              fontSize: 12,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              position: "sticky",
              top: 0,
              background: "var(--doppl-bg-elevated)",
            }}
          >
            <span role="columnheader">Time</span>
            <span role="columnheader">Lane</span>
            <span role="columnheader">Type</span>
            <span role="columnheader">Actor</span>
            <span role="columnheader">Details</span>
          </div>
          {rows.map((ev) => {
            const details = describeEvent(ev);
            return (
              <div
                key={ev.sequence}
                role="row"
                data-event-type={ev.type}
                style={{
                  display: "grid",
                  gridTemplateColumns: COLUMNS,
                  gap: 12,
                  padding: "6px 12px",
                  borderBottom: "1px solid var(--doppl-border)",
                  borderLeft: `5px solid ${TONE_COLOR[eventTone(ev)]}`,
                  fontSize: 13,
                  alignItems: "baseline",
                }}
              >
                <span style={{ color: "var(--doppl-text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                  {formatTime(ev.occurredAt)}
                </span>
                <span style={{ fontFamily: "monospace", fontSize: 12 }}>{ev.laneLabel}</span>
                <span style={{ fontWeight: 700 }}>{ev.type}</span>
                <span style={{ color: "var(--doppl-text-secondary)" }}>{ev.actor}</span>
                <span style={{ color: "var(--doppl-text-secondary)", fontFamily: "monospace", fontSize: 12 }}>
                  {details || "—"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
