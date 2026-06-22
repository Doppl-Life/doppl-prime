/* LineageGraph — the living family tree (S2 centerpiece).
   A lightweight, fixture-driven recreation of the canonical React-Flow
   LineageGraph: generational tiers left→right, agenome nodes that spawn / fuse /
   mutate / cull as `step` advances, converging violet braids for two-parent
   fusion, the gold winner hanging off its parent — and every node is clickable
   to open the inspector. Driven entirely by window.DopplKit (run_7f3a). */

const NODE_W = 150, NODE_H = 66, WIN_W = 184, WIN_H = 82;

const STATUS = {
  active:          { c: "--status-active",     g: "◐", pulse: true },
  spent:           { c: "--status-spent",      g: "○" },
  eligible_parent: { c: "--status-eligible",   g: "★" },
  reproduced:      { c: "--status-reproduced", g: "⚇" },
  mutated:         { c: "--status-mutated",    g: "∿" },
  culled:          { c: "--status-culled",     g: "✕" },
  under_review:    { c: "--status-review",     g: "◐", pulse: true },
  checked:         { c: "--status-checked",    g: "◑" },
  selected:        { c: "--status-selected",   g: "♔" },
};

function edgePath(s, t) {
  const sx = s.x + (s.win ? WIN_W : NODE_W), sy = s.y + (s.win ? WIN_H : NODE_H) / 2;
  const tx = t.x, ty = t.y + (t.win ? WIN_H : NODE_H) / 2;
  if (Math.abs(tx - s.x) < 40) { // winner produced edge bends downward
    const cx = s.x + NODE_W / 2;
    const txc = t.x + (t.win ? WIN_W : NODE_W) / 2;
    return `M ${cx} ${s.y + NODE_H} C ${cx} ${s.y + NODE_H + 36}, ${txc} ${ty - 42}, ${txc} ${ty}`;
  }
  const mx = (sx + tx) / 2;
  return `M ${sx} ${sy} C ${mx} ${sy}, ${mx} ${ty}, ${tx} ${ty}`;
}

function EdgeLayer({ nodes, winner, step }) {
  const K = window.DopplKit;
  const byId = {};
  nodes.forEach((n) => (byId[n.id] = n));
  byId[winner.id] = { ...winner, win: true };
  const EDGE_COLOR = {
    fused: "--edge-fused", mutated: "--edge-mutated", produced: "--edge-produced",
    spawned: "--edge-spawned", selected: "--edge-selected",
  };
  return (
    <svg width={K.CANVAS.w} height={K.CANVAS.h} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {K.EDGES.filter((e) => step >= e.born).map((e) => {
        const s = byId[e.s], t = byId[e.t];
        if (!s || !t) return null;
        const fused = e.type === "fused";
        const col = `var(${EDGE_COLOR[e.type] || "--edge-spawned"})`;
        return (
          <path key={e.id} d={edgePath(s, t)} fill="none" stroke={col}
            strokeWidth={fused ? 3 : 1.5}
            strokeDasharray={e.type === "mutated" ? "5 4" : undefined}
            style={{
              filter: fused ? "drop-shadow(0 0 5px rgba(185,140,255,0.6))" : undefined,
              opacity: 0.85,
              animation: step === e.born ? "doppl-spawn var(--motion-fusion-ms) var(--ease-out)" : undefined,
            }} />
        );
      })}
    </svg>
  );
}

function GraphNode({ node, status, energyFrac, selected, onSelect }) {
  const st = STATUS[status] || { c: "--fg-muted", g: "·" };
  const culled = status === "culled";
  return (
    <div
      role="button" tabIndex={0}
      onClick={() => onSelect(node.id)}
      onKeyDown={(e) => { if (e.key === "Enter") onSelect(node.id); }}
      style={{
        position: "absolute", left: node.x, top: node.y, width: NODE_W, height: NODE_H,
        boxSizing: "border-box", background: "var(--bg-surface-2)",
        border: `1px solid ${culled ? "var(--status-culled)" : `var(${st.c})`}`,
        outline: selected ? "2px solid var(--accent)" : "none", outlineOffset: 2,
        borderRadius: "var(--radius-md)", padding: "8px 11px", cursor: "pointer",
        display: "flex", flexDirection: "column", gap: 5, justifyContent: "center",
        boxShadow: selected ? "var(--glow-active)" : (status === "active" || status === "under_review" ? "var(--glow-active)" : "var(--elev-1)"),
        opacity: culled ? 0.42 : 1,
        filter: culled ? "saturate(0.3)" : undefined,
        transform: culled ? "translateY(6px)" : "none",
        transition: "opacity var(--motion-cull-ms), transform var(--motion-cull-ms), filter var(--motion-cull-ms), box-shadow var(--motion-fast)",
        animation: node._justBorn ? "doppl-spawn var(--motion-spawn-ms) var(--ease-overshoot)" : undefined,
      }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span aria-hidden="true" style={{
          color: `var(${st.c})`, fontSize: 16, lineHeight: 1,
          animation: st.pulse ? "doppl-pulse var(--motion-pulse-ms) var(--ease-in-out) infinite" : undefined,
        }}>{st.g}</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 600, color: "var(--fg-default)" }}>{node.label}</span>
        <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--fg-faint)" }}>{node.id}</span>
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{node.note}</div>
      {!culled && energyFrac != null && (
        <div style={{ height: 3, borderRadius: "var(--radius-full)", background: "var(--meter-track)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${Math.round(energyFrac * 100)}%`, background: "var(--energy-full)", transition: "width var(--motion-energy-drain-ms)" }} />
        </div>
      )}
    </div>
  );
}

function WinnerNode({ winner, status, selected, onSelect }) {
  if (!status) return null;
  const st = STATUS[status] || STATUS.under_review;
  const isWin = status === "selected";
  return (
    <div
      role="button" tabIndex={0}
      onClick={() => onSelect(winner.id)}
      onKeyDown={(e) => { if (e.key === "Enter") onSelect(winner.id); }}
      style={{
        position: "absolute", left: winner.x, top: winner.y, width: WIN_W, minHeight: WIN_H,
        boxSizing: "border-box", padding: "9px 13px", borderRadius: "var(--radius-md)", cursor: "pointer",
        background: isWin ? "color-mix(in oklab, var(--status-selected) 12%, var(--bg-surface-2))" : "var(--bg-surface-2)",
        border: `1.5px solid var(${st.c})`,
        outline: selected ? "2px solid var(--accent)" : "none", outlineOffset: 2,
        boxShadow: isWin ? "var(--glow-winner)" : "var(--glow-active)",
        animation: isWin ? "doppl-winner-bloom var(--motion-gen-advance-ms) var(--ease-out)" : "doppl-spawn var(--motion-spawn-ms) var(--ease-overshoot)",
      }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <span aria-hidden="true" style={{ color: `var(${st.c})`, fontSize: 17,
          animation: st.pulse ? "doppl-pulse var(--motion-pulse-ms) var(--ease-in-out) infinite" : undefined }}>{st.g}</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: `var(${st.c})`, textTransform: "uppercase", letterSpacing: "0.04em" }}>
          {isWin ? "winner" : status.replace("_", " ")}
        </span>
      </div>
      <div style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--fg-default)", marginTop: 5, lineHeight: 1.32 }}>
        {winner.title}
      </div>
      {isWin && <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--status-selected)", marginTop: 5 }}>fitness 0.84 · +0.39 vs gen-0</div>}
    </div>
  );
}

function LineageGraph({ step, selectedId, onSelect }) {
  const K = window.DopplKit;
  const live = K.NODES.filter((n) => step >= n.born);
  const winStatus = (() => {
    let s = null;
    for (const [at, st] of K.WINNER.transitions) if (step >= at) s = st;
    return s;
  })();
  const sel = onSelect || (() => {});

  return (
    <div style={{ position: "relative", width: K.CANVAS.w, height: K.CANVAS.h, margin: "0 auto" }}>
      {["Gen 0", "Gen 1", "Gen 2", "Gen 3"].map((g, i) => (
        <div key={g} style={{
          position: "absolute", top: -4, left: K.COL[i], width: NODE_W,
          fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.06em",
          textTransform: "uppercase", color: "var(--fg-faint)", textAlign: "center",
        }}>{g}</div>
      ))}
      <EdgeLayer nodes={live} winner={K.WINNER} step={step} />
      <div style={{ position: "absolute", inset: 0, top: 22 }}>
        {live.map((n) => {
          const status = K.statusAt(n, step);
          const aliveSteps = Math.max(0, step - n.born + 1);
          const energyFrac = status === "culled" ? null : Math.min(1, aliveSteps / 7);
          return <GraphNode key={n.id} node={{ ...n, _justBorn: step === n.born }} status={status}
            energyFrac={energyFrac} selected={selectedId === n.id} onSelect={sel} />;
        })}
        <WinnerNode winner={K.WINNER} status={winStatus} selected={selectedId === K.WINNER.id} onSelect={sel} />
      </div>
    </div>
  );
}

Object.assign(window, { OrganismLineageGraph: LineageGraph });
