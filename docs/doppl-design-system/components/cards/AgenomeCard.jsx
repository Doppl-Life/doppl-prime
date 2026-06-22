import React from "react";
import { StatusBadge } from "../core/StatusBadge.jsx";
import { Meter } from "../core/Meter.jsx";

/**
 * AgenomeCard — a scannable summary of one Agenome (the organism): status,
 * parentage (gen-0 seed / mutation child / fusion child), energy spent, and
 * output count. Header of AgenomeInspector. Click → inspector.
 */
function parentage(agenome) {
  const n = (agenome.parentIds || []).length;
  if (agenome.status === "mutated" || (n === 1)) return { glyph: "∿", text: n ? `mutation child of ${agenome.parentIds[0]}` : "mutation child" };
  if (n >= 2) return { glyph: "⚇", text: `child of ${agenome.parentIds[0]} × ${agenome.parentIds[1]}` };
  return { glyph: "◌", text: "gen-0 seed · no parents" };
}

export function AgenomeCard({
  agenome = {},
  energySpent,
  energyBudget = 50,
  candidatesProduced,
  specializationTag,
  onInspect,
}) {
  const p = parentage(agenome);
  const energyValue = energySpent != null ? Math.min(1, energySpent / energyBudget) : null;
  return (
    <div
      onClick={onInspect ? () => onInspect(agenome.id) : undefined}
      style={{
        fontFamily: "var(--font-ui)", width: "100%", boxSizing: "border-box",
        background: "var(--bg-surface)", border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-lg)", padding: "12px 14px",
        cursor: onInspect ? "pointer" : "default", boxShadow: "var(--elev-1)",
        display: "flex", flexDirection: "column", gap: 9,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <StatusBadge domain="agenome" status={agenome.status} size="sm" />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600, color: "var(--fg-default)" }}>
          {agenome.id}
        </span>
        <span aria-hidden="true" style={{ marginLeft: "auto", color: "var(--status-reproduced)", fontSize: 16 }}>{p.glyph}</span>
      </div>

      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-muted)" }}>{p.text}</div>

      {energyValue != null && (
        <Meter kind="energy" value={energyValue} label="energy" valueLabel={`${energySpent}`} height={8} />
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--fg-muted)" }}>
        {candidatesProduced != null && <span>candidates ×{candidatesProduced}</span>}
        {specializationTag && (
          <span style={{ marginLeft: "auto", color: "var(--accent)", fontStyle: "normal" }}>{specializationTag}</span>
        )}
      </div>
    </div>
  );
}
