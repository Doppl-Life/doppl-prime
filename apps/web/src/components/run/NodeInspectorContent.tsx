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
      </div>
    );
  }

  if (selectedNode.type === 'agenome') {
    const node =
      lineage?.nodes.find((n) => n.dataRef === selectedNode.dataRef && n.type === 'agenome') ??
      null;
    const energy =
      deriveEnergyByAgenome(events).find((r) => r.agenomeId === selectedNode.dataRef) ?? null;
    return (
      <section aria-label="Agenome inspector" style={stack}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <span style={monoId}>{selectedNode.dataRef}</span>
          {node?.status !== undefined && (
            <StatusBadge domain="agenome" status={node.status} size="sm" />
          )}
        </header>
        <div style={label}>energy: {energy !== null ? `${energy.total} doppl_energy` : '—'}</div>
        <p style={muted}>
          Deep agenome detail (persona, system prompt, tools) arrives with the FB.6 telemetry.
        </p>
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
