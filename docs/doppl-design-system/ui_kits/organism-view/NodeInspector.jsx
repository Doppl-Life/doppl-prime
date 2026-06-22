/* NodeInspector — the click-into-a-node drawer (S3 CandidateInspector /
   S4 AgenomeInspector). Slides in over the still-streaming graph; reads the
   selected node's full detail from window.DopplKit and composes the design-
   system primitives (StatusBadge, Meter, CriticGauntletPanel). */

const NSI = window.DopplDesignSystem_352b49;

function Section({ title, children }) {
  return (
    <div style={{ padding: "14px 18px", borderTop: "1px solid var(--border-subtle)" }}>
      <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--fg-faint)", margin: "0 0 10px" }}>{title}</p>
      {children}
    </div>
  );
}

function WeightBar({ label, value }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "78px 1fr 34px", gap: 10, alignItems: "center", marginBottom: 6 }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-muted)" }}>{label}</span>
      <span style={{ height: 6, borderRadius: "var(--radius-full)", background: "var(--meter-track)", overflow: "hidden" }}>
        <span style={{ display: "block", height: "100%", width: `${Math.round(value * 100)}%`, background: "var(--accent)" }} />
      </span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-default)", textAlign: "right" }}>{value.toFixed(2)}</span>
    </div>
  );
}

function Field({ k, v }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 10, marginBottom: 7 }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-faint)" }}>{k}</span>
      <span style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--fg-default)", lineHeight: 1.4 }}>{v}</span>
    </div>
  );
}

function AgenomeBody({ node, status, step, onSelect }) {
  const { StatusBadge, Meter } = NSI;
  const d = node.d || {};
  const e = d.energy || {};
  return (
    <div>
      <Section title="Identity">
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <StatusBadge domain="agenome" status={status} size="lg" />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--fg-muted)" }}>gen {node.gen}</span>
        </div>
        <div style={{ marginTop: 8, fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--fg-muted)" }}>{node.note}</div>
      </Section>

      <Section title="System prompt">
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--fg-default)", lineHeight: 1.5,
          background: "var(--bg-base)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "10px 12px" }}>
          "{d.prompt}"
        </div>
      </Section>

      {d.persona && (
        <Section title="Persona / value weights">
          {Object.entries(d.persona).map(([k, v]) => <WeightBar key={k} label={k} value={v} />)}
        </Section>
      )}

      <Section title="Tools & reproduction">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: d.repro ? 10 : 0 }}>
          {(d.tools || []).map((t) => (
            <span key={t} style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-muted)",
              background: "var(--bg-surface-2)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)", padding: "3px 8px" }}>{t}</span>
          ))}
        </div>
        {d.repro && (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--fg-muted)", lineHeight: 1.5 }}>
            <span style={{ color: "var(--status-reproduced)" }}>{d.repro.mode}</span>
            {d.repro.parents}
            {d.repro.crossover && <> · crossover [{d.repro.crossover.join(", ")}]</>}
            {d.repro.mutation && <> · ∿ {d.repro.mutation}</>}
            {d.repro.parentDistance != null && <> · parent distance {d.repro.parentDistance}</>}
          </div>
        )}
      </Section>

      <Section title="Energy spent (doppl_energy)">
        <Meter kind="energy" value={Math.min(1, (e.total || 0) / 50)} label="total" valueLabel={`${e.total || 0}`} />
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-faint)", marginTop: 6 }}>
          llm {e.llm} · tool {e.tool} · spawn {e.spawn} <span style={{ color: "var(--fg-faint)" }}>· failed attempts not debited</span>
        </div>
      </Section>

      {(d.parents && d.parents.length > 0) && (
        <Section title="Parents">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {d.parents.map((p) => (
              <button key={p} onClick={() => onSelect(p)} style={chip()}>{p} ↗</button>
            ))}
          </div>
        </Section>
      )}

      {d.cand && (
        <Section title="Candidate produced">
          <button onClick={() => d.cand.id === "cand_g3_004" && onSelect("cand_g3_004")} style={{ ...candBtn(), cursor: d.cand.id === "cand_g3_004" ? "pointer" : "default" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <NSI.StatusBadge domain="candidate" status={d.cand.status} size="sm" />
              <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--fg-default)" }}>fit {d.cand.fit.toFixed(2)}</span>
            </div>
            <div style={{ fontSize: 13, color: "var(--fg-default)", marginTop: 6 }}>{d.cand.title}</div>
          </button>
        </Section>
      )}
    </div>
  );
}

function CandidateBody({ node, step }) {
  const { StatusBadge, Meter, CriticGauntletPanel } = NSI;
  const K = window.DopplKit;
  const d = node.d || {};
  const p = d.payload || {};
  const fc = (d.fitness && d.fitness.components) || {};
  const reviews = K.reviewsAt(step);
  const judge = step >= 18 ? { acceptance: fc.heldOutJudge } : null;
  return (
    <div>
      <Section title="Winning idea">
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
          <StatusBadge domain="candidate" status="selected" size="lg" />
          <StatusBadge domain="subtype" status={d.subtype} />
        </div>
        <div style={{ fontSize: 16, fontWeight: 600, color: "var(--fg-default)", lineHeight: 1.3 }}>{node.title}</div>
        <div style={{ fontSize: 13, color: "var(--fg-muted)", marginTop: 6, lineHeight: 1.45 }}>{d.summary}</div>
      </Section>

      <Section title="Transfer mapping (A → B)">
        <Field k="source" v={`${p.sourceDomain} · ${p.sourceTechnique}`} />
        <Field k="target" v={`${p.targetDomain} · ${p.targetProblem}`} />
        <Field k="mapping" v={p.transferMapping} />
        <Field k="mechanism" v={p.expectedMechanism} />
      </Section>

      <Section title="Fitness breakdown · 0.84 · sp-v3">
        {[["held-out judge", fc.heldOutJudge], ["grounding", fc.grounding], ["subtype check", fc.subtypeCheck],
          ["novelty", fc.novelty], ["falsification", fc.falsification], ["feasibility", fc.feasibility],
          ["energy efficiency", fc.energyEfficiency]].map(([k, v]) => (
          <Meter key={k} kind={k === "novelty" ? "novelty" : "fitness"} value={v} label={k} height={8} style={{ marginBottom: 6 }} />
        ))}
      </Section>

      <Section title="Subtype checks">
        {(d.checks || []).map((c) => (
          <div key={c.type} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 7 }}>
            <NSI.StatusBadge domain="check" status={c.status} size="sm" reason={c.reason} showLabel={false} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--fg-default)" }}>{c.type}</span>
            <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-muted)" }}>
              {c.output || (c.score != null ? c.score.toFixed(2) : c.reason)}
            </span>
          </div>
        ))}
      </Section>

      <Section title="The gauntlet it survived">
        <CriticGauntletPanel reviews={reviews} judge={judge} mode="replay" title="critic council + judge" />
      </Section>
    </div>
  );
}

function NodeInspector({ nodeId, step, onClose, onSelect }) {
  const K = window.DopplKit;

  React.useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  if (!nodeId) return null;
  const node = K.nodeById(nodeId);
  if (!node) return null;
  const isCand = node.kind === "candidate";
  const status = isCand ? "selected" : K.statusAt(node, step);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 40 }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "var(--bg-scrim)",
        animation: "doppl-spawn var(--motion-fast) var(--ease-out)" }} />
      <div style={{
        position: "absolute", top: 0, right: 0, bottom: 0, width: 460, maxWidth: "92vw",
        background: "var(--bg-surface)", borderLeft: "1px solid var(--border-strong)",
        boxShadow: "var(--elev-3)", overflowY: "auto",
        transform: "translateX(0)", animation: "drawer-in var(--motion-base) var(--ease-out)",
      }}>
        <div style={{ position: "sticky", top: 0, zIndex: 1, display: "flex", alignItems: "center", gap: 10,
          padding: "12px 18px", background: "var(--bg-surface)", borderBottom: "1px solid var(--border-subtle)" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600, color: "var(--fg-default)" }}>{node.id}</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-faint)" }}>{isCand ? "candidate inspector" : "agenome inspector"}</span>
          <button onClick={onClose} aria-label="Close" style={{ marginLeft: "auto", width: 32, height: 32, borderRadius: "var(--radius-md)",
            background: "var(--bg-surface-2)", border: "1px solid var(--border-strong)", color: "var(--fg-default)", cursor: "pointer", fontSize: 15 }}>✕</button>
        </div>
        {isCand
          ? <CandidateBody node={node} step={step} />
          : <AgenomeBody node={node} status={status} step={step} onSelect={onSelect} />}
      </div>
    </div>
  );
}

function chip() {
  return { fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--accent)", background: "var(--accent-soft)",
    border: "1px solid var(--accent)", borderRadius: "var(--radius-sm)", padding: "4px 9px", cursor: "pointer" };
}
function candBtn() {
  return { display: "block", width: "100%", textAlign: "left", background: "var(--bg-base)",
    border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "10px 12px" };
}

Object.assign(window, { OrganismNodeInspector: NodeInspector });
