import type { CSSProperties } from 'react';
import type {
  LineageGraphProjection,
  LineageNodeType,
  RunEventEnvelope,
} from '../../data/contracts';
import type { RunClient } from '../../data/runClient';
import { StatusBadge } from '../core/StatusBadge';
import { CandidateInspector } from '../../panels/CandidateInspector';
import { CriticGauntletPanel } from '../../panels/CriticGauntletPanel';
import { SubtypeCheckPanel } from '../../panels/SubtypeCheckPanel';
import { candidateFitness } from '../../panels/candidateFitness';
import { deriveEnergyByAgenome } from '../../panels/energyData';
import { deriveAgenomeTelemetry, deriveJudgeRationale } from '../../panels/nodeTelemetry';

/**
 * NodeInspectorContent (FV.5a) — the node-click drawer content router. The lineage graph is decluttered
 * to the agenome+candidate backbone (criticCheck/score filtered at lineageToFlow); the critic/check/
 * score/fitness DETAIL moves here, keyed by the clicked node. A CANDIDATE composes the EXISTING panels
 * (CandidateInspector + the fitness breakdown + CriticGauntletPanel + SubtypeCheckPanel); an AGENOME
 * shows a basic summary (status + energy from the node/events). EMIT-ONLY (rule #6): every panel
 * DISPLAYS critic/check/fitness verbatim — it re-ranks nothing. Read-only (rule #9); replay-identical
 * (the panels are pure over events / a getCandidate read). The deep agenome detail (persona/system-
 * prompt/tools) needs a new getAgenome API → a flagged later slice (FV.5b).
 */
export interface SelectedNode {
  readonly dataRef: string;
  readonly type: LineageNodeType;
}

export interface NodeInspectorContentProps {
  selectedNode: SelectedNode | null;
  runId: string;
  runClient: Pick<RunClient, 'getCandidate'>;
  events: readonly RunEventEnvelope[];
  lineage: LineageGraphProjection | null;
}

const stack: CSSProperties = {
  display: 'grid',
  gap: 'var(--space-4)',
  fontFamily: 'var(--font-ui)',
  color: 'var(--fg-default)',
};
const subsection: CSSProperties = { display: 'grid', gap: 'var(--space-1)' };
const label: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-caption)',
  color: 'var(--fg-muted)',
};
const muted: CSSProperties = { color: 'var(--fg-muted)' };
const monoId: CSSProperties = { fontFamily: 'var(--font-mono)', fontWeight: 600 };
// FV.5b — a scrollable raw-capture block (the persisted text is already scrubbed + truncated-with-marker).
const pre: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-mono)',
  color: 'var(--fg-default)',
  background: 'var(--bg-surface)',
  border: 'thin solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
  padding: 'var(--space-2)',
  margin: 0,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  maxHeight: '18rem',
  overflow: 'auto',
};

export function NodeInspectorContent({
  selectedNode,
  runId,
  runClient,
  events,
  lineage,
}: NodeInspectorContentProps) {
  if (selectedNode === null) return null;

  if (selectedNode.type === 'candidate') {
    const candidateId = selectedNode.dataRef;
    const fit = candidateFitness(events, candidateId);
    // FV.5b — the held-out judge's per-axis rationale (FB.8), displayed verbatim (emit-only, rule #6).
    const judge = deriveJudgeRationale(events, candidateId);
    const judgeAxes = judge ? Object.keys(judge.axisRationales) : [];
    return (
      <div style={stack}>
        <CandidateInspector runId={runId} candidateId={candidateId} runClient={runClient} />

        <section aria-label="Candidate fitness breakdown" style={subsection}>
          <span style={label}>fitness</span>
          {fit === null ? (
            <span style={muted}>—</span>
          ) : (
            <span>
              total {fit.total}
              {Object.keys(fit.components).length > 0 && (
                <>
                  {' · '}
                  {Object.entries(fit.components)
                    .map(([k, v]) => `${k} ${v}`)
                    .join(' · ')}
                </>
              )}
            </span>
          )}
        </section>

        <CriticGauntletPanel events={events} candidateId={candidateId} />
        <SubtypeCheckPanel events={events} candidateId={candidateId} />

        {judge !== null && judgeAxes.length > 0 && (
          <section aria-label="Held-out judge rationale" style={subsection}>
            <span style={label}>held-out judge — per-axis rationale (FB.8)</span>
            {judgeAxes.map((axis) => (
              <div key={axis}>
                <span style={monoId}>{axis}</span>
                {judge.axisScores[axis] !== undefined && (
                  <span style={muted}> ({judge.axisScores[axis]}/5)</span>
                )}
                <span> — {judge.axisRationales[axis]}</span>
              </div>
            ))}
          </section>
        )}
      </div>
    );
  }

  if (selectedNode.type === 'agenome') {
    const node =
      lineage?.nodes.find((n) => n.dataRef === selectedNode.dataRef && n.type === 'agenome') ??
      null;
    const energy =
      deriveEnergyByAgenome(events).find((r) => r.agenomeId === selectedNode.dataRef) ?? null;
    // FV.5b — the deep generation telemetry for this agenome: raw capture (FB.6) + executed temperature
    // (FB.4) + tool-call detail (FB.7), all displayed verbatim from the persisted scrubbed events.
    const telemetry = deriveAgenomeTelemetry(events, selectedNode.dataRef);
    return (
      <section aria-label="Agenome inspector" style={stack}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <span style={monoId}>{selectedNode.dataRef}</span>
          {node?.status !== undefined && (
            <StatusBadge domain="agenome" status={node.status} size="sm" />
          )}
        </header>
        <div style={label}>energy: {energy !== null ? `${energy.total} doppl_energy` : '—'}</div>

        {telemetry.llmCalls.length > 0 && (
          <section aria-label="Generation telemetry" style={subsection}>
            <span style={label}>generation calls — raw capture (FB.6)</span>
            {telemetry.llmCalls.map((c, i) => (
              <div key={i} style={subsection}>
                <span style={muted}>
                  {c.role}
                  {c.temperature !== undefined && ` · temp ${c.temperature.toFixed(2)}`}
                  {c.truncated && ' · truncated'}
                </span>
                <pre style={pre}>{c.rawResponse}</pre>
                {c.rawReasoning !== undefined && <pre style={pre}>{c.rawReasoning}</pre>}
              </div>
            ))}
          </section>
        )}

        {telemetry.toolCalls.length > 0 && (
          <section aria-label="Tool calls" style={subsection}>
            <span style={label}>tool calls (FB.7)</span>
            {telemetry.toolCalls.map((t, i) => (
              <div key={i} style={subsection}>
                <span style={monoId}>{t.toolName}</span>
                {t.query !== undefined && <div style={muted}>query: {t.query}</div>}
                {t.result !== undefined && <div style={muted}>result: {t.result}</div>}
              </div>
            ))}
          </section>
        )}

        {telemetry.llmCalls.length === 0 && telemetry.toolCalls.length === 0 && (
          <p style={muted}>No generation telemetry captured for this agenome yet.</p>
        )}
      </section>
    );
  }

  // Generation/score/critic/check shouldn't reach here post-declutter — graceful fallback (no throw).
  return (
    <section aria-label="Node inspector" style={stack}>
      <span style={monoId}>{selectedNode.dataRef}</span>
    </section>
  );
}
