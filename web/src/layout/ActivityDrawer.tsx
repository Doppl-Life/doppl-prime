import { type JSX, useMemo, useState } from "react";
import { AgentActivityPanel } from "../panels/AgentActivityPanel.js";
import { useAgentActivityLanes, useRunState } from "../state/runStore.js";

/**
 * ActivityDrawer (UX restructure). The Agent activity feed is a live
 * firehose — useful for debugging, but it shouldn't push the narrative
 * panels (lineage, fitness, final idea) below the fold. So it lives in
 * a collapsible bottom drawer: a one-line ticker when collapsed, the
 * full lane view when expanded. Stays in-context (no separate page) so
 * the operator never has to navigate away mid-run.
 */
export function ActivityDrawer(): JSX.Element {
  const [open, setOpen] = useState(false);
  const lanes = useAgentActivityLanes();
  const state = useRunState();

  const { total, latest } = useMemo(() => {
    let count = 0;
    let newest: { type: string; actor: string } | null = null;
    let newestSeq = -1;
    for (const lane of lanes) {
      count += lane.events.length;
      for (const ev of lane.events) {
        if (ev.sequence > newestSeq) {
          newestSeq = ev.sequence;
          newest = { type: ev.type, actor: ev.actor };
        }
      }
    }
    return { total: count, latest: newest };
  }, [lanes]);

  const ticker = latest ? `${latest.type} · ${latest.actor}` : "No activity yet";

  return (
    <section
      aria-label="Activity log"
      data-drawer-open={open}
      style={{
        background: "var(--doppl-bg-elevated)",
        borderTop: "3px solid #000",
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          background: "transparent",
          color: "var(--doppl-text-primary)",
          border: "none",
          boxShadow: "none",
          padding: "10px 16px",
          textTransform: "none",
          letterSpacing: 0,
          fontSize: "var(--doppl-fs-sm)",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <span aria-hidden="true" style={{ fontWeight: 800 }}>
            {open ? "▾" : "▸"}
          </span>
          <span style={{ fontWeight: 800, textTransform: "uppercase" }}>Activity log</span>
          {!open && (
            <span
              style={{
                color: "var(--doppl-text-secondary)",
                fontWeight: 400,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {ticker}
            </span>
          )}
        </span>
        <span style={{ color: "var(--doppl-text-secondary)", fontWeight: 400, whiteSpace: "nowrap" }}>
          {total} events · live via SSE · seq ≤ {state.sequenceThrough}
        </span>
      </button>
      {open && (
        <div style={{ maxHeight: 260, overflowY: "auto", padding: "0 16px 16px" }}>
          <AgentActivityPanel />
        </div>
      )}
    </section>
  );
}
