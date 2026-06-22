/* AgentRoster — the per-agent live readout the user asked for: every agenome
   currently in the population, what it's doing right now, and its energy draw.
   Current action = the most recent ticker event whose actor is this agenome;
   energy accrues per step it has been alive. Reads window.DopplKit. */

const ROW_STATUS = {
  active:          { c: "--status-active",     g: "◐", verb: "generating", pulse: true },
  spent:           { c: "--status-spent",      g: "○", verb: "spent" },
  eligible_parent: { c: "--status-eligible",   g: "★", verb: "eligible to reproduce" },
  reproduced:      { c: "--status-reproduced", g: "⚇", verb: "reproduced" },
  mutated:         { c: "--status-mutated",    g: "∿", verb: "mutated" },
  culled:          { c: "--status-culled",     g: "✕", verb: "culled" },
};

// deterministic per-agenome energy rate (doppl_energy / step), budget 500
const RATE = { ag_a0: 44, ag_a1: 50, ag_a2: 39, ag_a3: 66, ag_a5: 58, ag_a7: 71, ag_a9: 82 };
const BUDGET = 500;

function lastActionFor(id, step) {
  const K = window.DopplKit;
  for (let s = step; s >= 0; s--) {
    const e = K.TICKER[s];
    if (e && e.actor === id) return e.phrase;
  }
  return null;
}

function AgentRow({ node, step, onSelect }) {
  const K = window.DopplKit;
  const status = K.statusAt(node, step) || "active";
  const sp = ROW_STATUS[status] || ROW_STATUS.active;
  const culled = status === "culled";
  const aliveSteps = Math.max(0, step - node.born + 1);
  const spent = culled ? Math.min(BUDGET, aliveSteps * (RATE[node.id] || 50)) : Math.min(BUDGET, aliveSteps * (RATE[node.id] || 50));
  const frac = Math.min(1, spent / BUDGET);
  const action = lastActionFor(node.id, step);

  return (
    <div
      role="button" tabIndex={0}
      onClick={() => onSelect && onSelect(node.id)}
      onKeyDown={(e) => { if (e.key === "Enter" && onSelect) onSelect(node.id); }}
      style={{
      display: "flex", flexDirection: "column", gap: 5, padding: "9px 12px", cursor: onSelect ? "pointer" : "default",
      borderBottom: "1px solid var(--border-subtle)", opacity: culled ? 0.5 : 1,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span aria-hidden="true" style={{
          color: `var(${sp.c})`, fontSize: 14, width: 16, textAlign: "center",
          animation: sp.pulse ? "doppl-pulse var(--motion-pulse-ms) var(--ease-in-out) infinite" : undefined,
        }}>{sp.g}</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600, color: "var(--fg-default)" }}>{node.id}</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-faint)" }}>{node.note}</span>
        <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 11, color: `var(${sp.c})`, textTransform: "uppercase", letterSpacing: "0.03em" }}>
          {sp.verb}
        </span>
      </div>

      <div style={{
        fontFamily: "var(--font-ui)", fontSize: 11.5,
        color: culled ? "var(--fg-faint)" : "var(--fg-muted)",
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", paddingLeft: 24,
      }}>
        {status === "active" && <span style={{ color: "var(--status-active)" }}>▸ </span>}
        {action || (culled ? "removed from population" : "idle")}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 24 }}>
        <span aria-hidden="true" style={{ color: "var(--energy-full)", fontSize: 11 }}>⚡</span>
        <span style={{ flex: 1, height: 5, borderRadius: "var(--radius-full)", background: "var(--meter-track)", overflow: "hidden" }}>
          <span style={{
            display: "block", height: "100%", width: `${Math.round(frac * 100)}%`,
            background: frac > 0.85 ? "var(--energy-low)" : "var(--energy-full)",
            boxShadow: !culled && frac > 0.3 ? "var(--glow-energy)" : "none",
            transition: "width var(--motion-energy-drain-ms) var(--ease-out)",
          }} />
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-muted)", minWidth: 58, textAlign: "right" }}>
          {spent} / {BUDGET}
        </span>
      </div>
    </div>
  );
}

function AgentRoster({ step, onSelect }) {
  const K = window.DopplKit;
  const live = K.NODES.filter((n) => step >= n.born);
  const active = live.filter((n) => K.statusAt(n, step) === "active").length;
  const totalSpent = live.reduce((sum, n) => {
    const aliveSteps = Math.max(0, step - n.born + 1);
    return sum + Math.min(BUDGET, aliveSteps * (RATE[n.id] || 50));
  }, 0);

  return (
    <div style={{
      fontFamily: "var(--font-ui)", background: "var(--bg-surface)",
      border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)",
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", whiteSpace: "nowrap",
        borderBottom: "1px solid var(--border-subtle)", fontFamily: "var(--font-mono)",
        fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--fg-faint)",
      }}>
        <span>Population · {live.length}</span>
        <span style={{ marginLeft: "auto", color: "var(--status-active)", fontFamily: "var(--font-ui)" }}>{active} working</span>
        <span style={{ color: "var(--fg-muted)", fontFamily: "var(--font-ui)", whiteSpace: "nowrap" }}>⚡ {totalSpent.toLocaleString()}</span>
      </div>
      <div style={{ overflowY: "auto", maxHeight: 270 }}>
        {live.map((n) => <AgentRow key={n.id} node={n} step={step} onSelect={onSelect} />)}
      </div>
    </div>
  );
}

Object.assign(window, { OrganismAgentRoster: AgentRoster });
