import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Panel,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

const CASE_STUDIES = [
  {
    id: 'fsd-ownership-unwind',
    title: 'FSD Ownership Unwind',
    path: 'case-studies/fsd-ownership-unwind/problem-statement.md',
    mode: 'fixture',
  },
  {
    id: 'glp1-snack-demand-destruction',
    title: 'GLP-1 Snack Demand',
    path: 'case-studies/glp1-snack-demand-destruction/problem-statement.md',
    mode: 'fixture',
  },
  {
    id: 'ai-overviews-zero-click-publishing',
    title: 'AI Overviews Publishing',
    path: 'case-studies/ai-overviews-zero-click-publishing/problem-statement.md',
    mode: 'fixture',
  },
  {
    id: 'starship-launch-cost-collapse',
    title: 'Starship Launch Cost',
    path: 'case-studies/starship-launch-cost-collapse/problem-statement.md',
    mode: 'fixture',
  },
];

const FITNESS_LENSES = [
  { id: 'none', label: 'No lens' },
  { id: 'feasibility', label: 'Feasibility' },
  { id: 'novelty', label: 'Novelty' },
];

const FITNESS_SCHEDULES = [
  { id: 'auto', label: 'Auto schedule' },
  { id: 'diverge', label: 'Diverge' },
  { id: 'balanced', label: 'Balanced' },
  { id: 'converge', label: 'Converge' },
];

const SAMPLE_RUN = {
  runId: 'react_flow_preview',
  caseId: 'fsd-ownership-unwind',
  runMode: 'fixture',
  generations: 4,
  budgetUsed: 4,
  problemRecovery: {
    id: 'recovery_fsd',
    title: 'Recovered Ownership Unwind',
    recoveredProblem:
      'Autonomous fleets make private idle vehicles look like stranded capacity.',
    hiddenConstraint: 'The handoff is liability pricing, not showroom demand.',
    falsifier: 'If insurance and utilization signals stay flat while sales decline, the ownership-unwind frame is weak.',
    citedKnowledge: ['K1', 'K2'],
  },
  candidates: [
    {
      id: 'liability_clock_g0',
      title: 'Liability Clock',
      generation: 0,
      agenomeId: 'ag_blindside',
      summary: 'Track filings where insurers price the vehicle as the risk-bearing actor.',
      mechanism: 'Watch policy language move from driver liability toward fleet operator liability.',
      claimedDelta: 'Finds the ownership unwind before retail sales show the break.',
      citedKnowledge: ['K1'],
    },
    {
      id: 'residual_stress_g0',
      title: 'Residual Stress',
      generation: 0,
      agenomeId: 'ag_constraint_injection',
      summary: 'Map exposed leases, floorplan loans, and auto ABS stress.',
      mechanism: 'Read lender marks and residual assumptions as a hidden ownership-price signal.',
      claimedDelta: 'Turns financing pressure into an early warning surface.',
      citedKnowledge: ['K2'],
    },
    {
      id: 'fleet_inventory_g0',
      title: 'Fleet Inventory',
      generation: 0,
      agenomeId: 'ag_first_principles',
      summary: 'Watch utilization density replace household ownership utility.',
      mechanism: 'Compare vehicle-hours used by fleets against parked private capacity.',
      claimedDelta: 'Frames the car as a utilization asset, not a consumer durable.',
      citedKnowledge: ['K1', 'K2'],
    },
    {
      id: 'dealer_drag_g0',
      title: 'Dealer Drag',
      generation: 0,
      agenomeId: 'ag_skeptic',
      summary: 'Find where franchise incentives lag fleet economics.',
      mechanism: 'Score regions where dealer economics resist autonomous fleet adoption.',
      claimedDelta: 'Keeps the thesis honest about channel friction.',
      citedKnowledge: ['K2'],
    },
    {
      id: 'insurance_transfer_g1',
      title: 'Insurance Transfer',
      generation: 1,
      agenomeId: 'ag_blindside_mutation',
      summary: 'Mutate liability clock into a measurable premium-transfer thesis.',
      mechanism: 'Look for commercial fleet policies absorbing risks once held by households.',
      claimedDelta: 'Turns legal abstraction into a priced signal.',
      citedKnowledge: ['K1'],
    },
    {
      id: 'garage_vacancy_g1',
      title: 'Garage Vacancy',
      generation: 1,
      agenomeId: 'ag_breakout',
      summary: 'Use private garage underuse as a visible proxy for declining ownership utility.',
      mechanism: 'Pair utilization data with parking, storage, and household vehicle count changes.',
      claimedDelta: 'Connects fleet density to a daily-life abandonment signal.',
      citedKnowledge: ['K1', 'K2'],
    },
    {
      id: 'lender_tripwire_g1',
      title: 'Lender Tripwire',
      generation: 1,
      agenomeId: 'ag_constraint_injection_mutation',
      summary: 'Convert residual stress into a falsifiable lender watchlist.',
      mechanism: 'Monitor used-car marks, delinquency, and loan-to-value drift by autonomy exposure.',
      claimedDelta: 'Identifies the financial crack before consumer sentiment moves.',
      citedKnowledge: ['K2'],
    },
    {
      id: 'dealer_buffer_g1',
      title: 'Dealer Buffer',
      generation: 1,
      agenomeId: 'ag_skeptic',
      summary: 'Test whether franchise and service revenue can delay the ownership break.',
      mechanism: 'Compare dealer margin resilience against fleet penetration by market.',
      claimedDelta: 'Adds a drag term so the graph does not assume instant collapse.',
      citedKnowledge: ['K2'],
    },
    {
      id: 'premium_to_residual_g2',
      title: 'Premium To Residual Loop',
      generation: 2,
      agenomeId: 'fused_ag_blindside_ag_constraint_injection',
      summary: 'Fuse insurance transfer and lender marks into one feedback loop.',
      mechanism: 'When fleet liability pricing improves, household residual risk should reprice faster.',
      claimedDelta: 'Explains how legal transfer becomes balance-sheet pressure.',
      citedKnowledge: ['K1', 'K2'],
    },
    {
      id: 'parking_revenue_shadow_g2',
      title: 'Parking Revenue Shadow',
      generation: 2,
      agenomeId: 'ag_polymath',
      summary: 'Use parking and storage revenue as a second-order ownership signal.',
      mechanism: 'Track city parking, self-storage, and garage utilization against fleet availability.',
      claimedDelta: 'Finds indirect proof outside auto industry reporting.',
      citedKnowledge: ['K1'],
    },
    {
      id: 'service_bay_lag_g2',
      title: 'Service Bay Lag',
      generation: 2,
      agenomeId: 'ag_skeptic_mutation',
      summary: 'Check whether maintenance revenue hides the decline in sales economics.',
      mechanism: 'Separate dealer service income from new-owner pipeline health.',
      claimedDelta: 'Prevents false negatives when dealers look stable.',
      citedKnowledge: ['K2'],
    },
    {
      id: 'household_exit_index_g2',
      title: 'Household Exit Index',
      generation: 2,
      agenomeId: 'ag_breakthrough',
      summary: 'Combine garage vacancy, policy transfer, and lender marks into an exit index.',
      mechanism: 'Weight signals by their distance from direct vehicle purchase decisions.',
      claimedDelta: 'Produces one tracked measure for private ownership abandonment.',
      citedKnowledge: ['K1', 'K2'],
    },
    {
      id: 'ownership_unwind_index_g3',
      title: 'Ownership Unwind Index',
      generation: 3,
      agenomeId: 'fused_ag_breakthrough_ag_blindside',
      summary: 'Final survivor linking liability transfer, residual stress, and household exit behavior.',
      mechanism: 'Fuse policy, lender, utilization, and parking signals into a staged unwind detector.',
      claimedDelta: 'Shows where ownership breaks before unit sales, dealer commentary, or headlines.',
      citedKnowledge: ['K1', 'K2'],
    },
    {
      id: 'municipal_signal_g3',
      title: 'Municipal Signal',
      generation: 3,
      agenomeId: 'ag_polymath_mutation',
      summary: 'Use curb, parking, and fleet-permit changes as public proof of the shift.',
      mechanism: 'Read municipal records as a noisy but early proxy for fleet substitution.',
      claimedDelta: 'Adds a public-data readout to the survivor.',
      citedKnowledge: ['K1'],
    },
    {
      id: 'consumer_sentiment_lag_g3',
      title: 'Sentiment Lag',
      generation: 3,
      agenomeId: 'ag_skeptic',
      summary: 'Test whether stated purchase intent stays high after economic utility has moved.',
      mechanism: 'Compare surveys to observed utilization and financing pressure.',
      claimedDelta: 'Separates identity attachment from economic behavior.',
      citedKnowledge: ['K2'],
    },
    {
      id: 'absorption_failure_g3',
      title: 'Absorption Failure',
      generation: 3,
      agenomeId: 'ag_constraint_injection',
      summary: 'Watch for the point where lenders can no longer absorb falling private-use value.',
      mechanism: 'Track credit tightening and residual write-down timing.',
      claimedDelta: 'Gives the final thesis a hard failure threshold.',
      citedKnowledge: ['K2'],
    },
  ],
  fitness: [
    { candidateId: 'liability_clock_g0', generation: 0, total: 88 },
    { candidateId: 'residual_stress_g0', generation: 0, total: 73 },
    { candidateId: 'fleet_inventory_g0', generation: 0, total: 79 },
    { candidateId: 'dealer_drag_g0', generation: 0, total: 48 },
    { candidateId: 'insurance_transfer_g1', generation: 1, total: 86 },
    { candidateId: 'garage_vacancy_g1', generation: 1, total: 81 },
    { candidateId: 'lender_tripwire_g1', generation: 1, total: 84 },
    { candidateId: 'dealer_buffer_g1', generation: 1, total: 55 },
    { candidateId: 'premium_to_residual_g2', generation: 2, total: 90 },
    { candidateId: 'parking_revenue_shadow_g2', generation: 2, total: 70 },
    { candidateId: 'service_bay_lag_g2', generation: 2, total: 61 },
    { candidateId: 'household_exit_index_g2', generation: 2, total: 87 },
    { candidateId: 'ownership_unwind_index_g3', generation: 3, total: 94 },
    { candidateId: 'municipal_signal_g3', generation: 3, total: 75 },
    { candidateId: 'consumer_sentiment_lag_g3', generation: 3, total: 67 },
    { candidateId: 'absorption_failure_g3', generation: 3, total: 82 },
  ],
  selectedParents: [
    { generation: 0, selected: ['liability_clock_g0', 'fleet_inventory_g0'] },
    { generation: 1, selected: ['insurance_transfer_g1', 'lender_tripwire_g1'] },
    { generation: 2, selected: ['premium_to_residual_g2', 'household_exit_index_g2'] },
    { generation: 3, selected: ['ownership_unwind_index_g3', 'absorption_failure_g3'] },
  ],
  fusionChildren: [
    {
      generation: 0,
      child: {
        id: 'child_liability_fleet_g0',
        title: 'Liability / Fleet Fusion',
        summary: 'Liability transfer meets utilization density as the first ownership-unwind detector.',
      },
    },
    {
      generation: 1,
      child: {
        id: 'child_insurance_lender_g1',
        title: 'Insurance / Lender Fusion',
        summary: 'Premium transfer and lender marks combine into a priced residual-risk signal.',
      },
    },
    {
      generation: 2,
      child: {
        id: 'child_exit_index_g2',
        title: 'Exit Index Fusion',
        summary: 'Household exit behavior joins balance-sheet pressure as a tracked index.',
      },
    },
    {
      generation: 3,
      child: {
        id: 'child_ownership_unwind_index_g3',
        title: 'Final Surviving Index',
        summary: 'The survivor fuses liability transfer, residual stress, utilization, and household exit signals.',
      },
    },
  ],
  dashboardEvents: Array.from({ length: 14 }, (_, index) => ({
    index,
    type: index % 4 === 0 ? 'generation.started' : index % 3 === 0 ? 'fitness.scored' : 'candidate.created',
    timestamp: new Date(Date.now() - (14 - index) * 90000).toISOString(),
  })),
  dashboardArtifact:
    'artifact_type: problem_recovery\nartifact_id: recovery_fsd\n\nRecovered thesis: liability pricing and fleet utilization reveal the ownership unwind before consumer sales do.',
};

function fitnessFor(run, candidate) {
  if (candidate.fitnessTotal !== undefined) return candidate.fitnessTotal;
  const score = (run.fitness || []).find(
    (item) => item.candidateId === candidate.id && item.generation === candidate.generation,
  );
  return score?.total ?? score?.score ?? null;
}

function fitnessRecordFor(run, candidateId) {
  return (run.fitnessRecords || []).find((record) => record.candidateId === candidateId) || null;
}

function percent(value) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return 'n/a';
  return `${Math.round(Number(value) * 100)}%`;
}

function signedRating(value) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return 'n/a';
  const numeric = Number(value);
  return `${numeric > 0 ? '+' : ''}${numeric.toFixed(1)}`;
}

function frontierLabel(record) {
  const frontier = record?.selection?.frontier;
  if (!frontier) return null;
  if (frontier.pareto) return `frontier r${frontier.rank}`;
  return `dominated r${frontier.rank}`;
}

function latestScheduleComparison(run) {
  const comparisons = run.scheduleComparisons || [];
  return comparisons[comparisons.length - 1] || null;
}

function selectedIdsFor(run, generation) {
  const evolutionEntry = (run.evolution || []).find((entry) => entry.generation === generation);
  if (evolutionEntry?.selectedParentIds) return new Set(evolutionEntry.selectedParentIds);
  const entry = (run.selectedParents || []).find((parents) => parents.generation === generation);
  return new Set(entry?.selected || entry?.parentIds || []);
}

function generationCount(run) {
  const explicitCount = run.generations || (run.evolution || []).length || 0;
  const candidateGenerations = (run.candidates || []).map((candidate) => candidate.generation ?? 0);
  const evolutionGenerations = (run.evolution || []).map((entry) => entry.generation ?? 0);
  const childGenerations = (run.fusionChildren || []).map((child) => child.generation ?? 0);
  const maxIndex = Math.max(-1, ...candidateGenerations, ...evolutionGenerations, ...childGenerations);
  return Math.max(1, explicitCount, maxIndex + 1);
}

function childForGeneration(run, generation) {
  const fusionChild = (run.fusionChildren || []).find((child) => child.generation === generation);
  if (fusionChild?.child) {
    return {
      ...fusionChild.child,
      parentCandidateIds: fusionChild.parentCandidateIds,
      inheritanceWeights: fusionChild.inheritanceWeights,
      compatibility: fusionChild.compatibility,
      inheritedTraits: fusionChild.inheritedTraits,
      mutationNotes: fusionChild.mutationNotes,
    };
  }
  const evolutionEntry = (run.evolution || []).find((entry) => entry.generation === generation);
  if (!evolutionEntry?.childId) return null;
  return {
    ...(run.child || {}),
    id: evolutionEntry.childId,
    title: generation === generationCount(run) - 1 ? 'Final Fused Child' : `Fused Child G${generation + 1}`,
    summary: run.child?.path
      ? `Exported to ${run.child.path}`
      : 'Selected parents fused into the next surviving candidate.',
  };
}

function budgetUnits(run) {
  const value = run.budgetUsed ?? run.budget;
  if (typeof value === 'number' || typeof value === 'string') return value;
  if (value && typeof value === 'object') return value.usedUnits ?? value.maxUnits ?? 0;
  return 0;
}

function readableTitle(value) {
  if (!value) return 'Untitled node';
  return value
    .replace(/^cand_/, '')
    .replace(/^child_/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function buildFlow(run) {
  const nodes = [];
  const edges = [];
  const columns = generationCount(run);
  const laneWidth = 330;
  const baseX = 270;
  const topY = 112;
  const cardGap = 118;
  const candidatesByGeneration = new Map();

  for (const candidate of run.candidates || []) {
    const generation = candidate.generation ?? 0;
    if (!candidatesByGeneration.has(generation)) candidatesByGeneration.set(generation, []);
    candidatesByGeneration.get(generation).push(candidate);
  }

  nodes.push({
    id: 'recovery',
    type: 'kernelNode',
    position: { x: 40, y: 360 },
    data: {
      kind: 'recovery',
      status: 'seeded',
      title: run.problemRecovery?.title || 'Problem Recovery',
      subtitle: run.problemRecovery?.recoveredProblem || run.problemRecovery?.summary || 'Recovered problem frame',
      badge: 'recovery',
      raw: run.problemRecovery,
    },
  });

  for (let generation = 0; generation < columns; generation += 1) {
    nodes.push({
      id: `lane-${generation}`,
      type: 'laneNode',
      position: { x: baseX + generation * laneWidth - 30, y: 24 },
      selectable: false,
      draggable: false,
      data: { label: `Generation ${generation}` },
      style: { width: 286, height: 760, zIndex: -1 },
    });

    const selected = selectedIdsFor(run, generation);
    const candidates = candidatesByGeneration.get(generation) || [];
    candidates.forEach((candidate, index) => {
      const nodeId = `candidate-${generation}-${candidate.id}`;
      const status = selected.has(candidate.id) ? 'survivor' : 'rejected';
      const score = fitnessFor(run, candidate);
      const fitnessRecord = fitnessRecordFor(run, candidate.id);
      const frontier = frontierLabel(fitnessRecord);
      nodes.push({
        id: nodeId,
        type: 'kernelNode',
        position: { x: baseX + generation * laneWidth, y: topY + index * cardGap },
        data: {
          kind: 'candidate',
          status,
          title: candidate.title || readableTitle(candidate.id),
          subtitle: candidate.summary || candidate.mechanism || candidate.path || 'Candidate pressure point',
          badge: score === null ? frontier || 'unscored' : `${frontier || 'fitness'} ${score}`,
          raw: candidate,
        },
      });
      const source = generation === 0 ? 'recovery' : `child-${generation - 1}`;
      edges.push(makeEdge(`${source}-${nodeId}`, source, nodeId, status));
    });

    const child = childForGeneration(run, generation);
    if (child) {
      const childId = `child-${generation}`;
      nodes.push({
        id: childId,
        type: 'kernelNode',
        position: { x: baseX + generation * laneWidth + 120, y: 648 },
        data: {
          kind: 'child',
          status: generation === columns - 1 ? 'final' : 'survivor',
          title: child.title || readableTitle(child.id),
          subtitle: child.summary || 'Fused child carried into the next generation',
          badge: generation === columns - 1 ? 'final survivor' : 'fused child',
          raw: child,
        },
      });
      for (const parentId of selected) {
        edges.push(
          makeEdge(
            `candidate-${generation}-${parentId}-${childId}`,
            `candidate-${generation}-${parentId}`,
            childId,
            'survivor',
          ),
        );
      }
    }
  }

  return { nodes: nodes.map((node) => ({ ...node, draggable: false })), edges };
}

function makeEdge(id, source, target, status) {
  return {
    id,
    source,
    target,
    type: 'smoothstep',
    animated: status === 'survivor',
    markerEnd: { type: MarkerType.ArrowClosed },
    className: `flow-edge ${status}`,
  };
}

function KernelNode({ data }) {
  return (
    <div className={`kernel-node ${data.kind} ${data.status}`}>
      <Handle type="target" position={Position.Left} />
      <div className="node-meta">
        <span>{data.kind}</span>
        <span>{data.badge}</span>
      </div>
      <strong>{data.title}</strong>
      <p>{data.subtitle}</p>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function LaneNode({ data }) {
  return (
    <div className="generation-lane">
      <span>{data.label}</span>
    </div>
  );
}

const nodeTypes = { kernelNode: KernelNode, laneNode: LaneNode };

function uniqueById(items, getId) {
  const seen = new Set();
  return items.filter((item) => {
    const id = getId(item);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function nodeSubject(run, node) {
  if (!node) return null;
  const raw = node.data.raw || {};
  const agenome = raw.agenomeId
    ? (run.agenomes || []).find((entry) => entry.id === raw.agenomeId)
    : null;
  if (node.data.kind === 'recovery') {
    return {
      id: raw.id || node.id,
      kind: 'Problem recovery',
      status: node.data.status,
      title: raw.title || node.data.title,
      summary: raw.recoveredProblem || node.data.subtitle,
      details: [
        ['Hidden constraint', raw.hiddenConstraint],
        ['Falsifier', raw.falsifier],
        ['Artifact', raw.path],
      ],
      citedKnowledge: raw.citedKnowledge || [],
      raw: { ...raw, agenome },
    };
  }
  if (node.data.kind === 'child') {
    return {
      id: raw.id || node.id,
      kind: 'Fused child',
      status: node.data.status,
      title: raw.title || node.data.title,
      summary: raw.summary || node.data.subtitle,
      details: [
        ['Mechanism', raw.mechanism],
        ['Claimed delta', raw.claimedDelta],
        ['Parents', (raw.parentCandidateIds || []).join(' + ')],
        ['Agenome', agenome ? `${agenome.label} (${agenome.id})` : raw.agenomeId],
        ['Agenome parents', agenome?.parentAgenomeIds?.join(' + ')],
        ['Agenome energy', agenome ? `${agenome.energy.spent}/${agenome.energy.allocated}` : undefined],
        ['Compatibility', raw.compatibility ? `${raw.compatibility.score} - ${raw.compatibility.rationale}` : undefined],
        [
          'Inheritance',
          raw.inheritanceWeights
            ? `parent A ${raw.inheritanceWeights.parentA}, parent B ${raw.inheritanceWeights.parentB}`
            : undefined,
        ],
      ],
      citedKnowledge: raw.citedKnowledge || [],
      raw,
    };
  }
  return {
    id: raw.id || node.id,
    kind: 'Candidate',
    status: node.data.status,
    title: raw.title || node.data.title,
    summary: raw.summary || node.data.subtitle,
    details: [
      ['Agenome', raw.agenomeId],
      ['Agenome persona', agenome?.persona],
      ['Agenome energy', agenome ? `${agenome.energy.spent}/${agenome.energy.allocated}` : undefined],
      ['Agenome policy', agenome?.decompositionPolicy],
      ['Generation', raw.generation === undefined ? undefined : String(raw.generation)],
      ['Mechanism', raw.mechanism],
      ['Claimed delta', raw.claimedDelta],
      ['Artifact', raw.path],
    ],
    citedKnowledge: raw.citedKnowledge || [],
    raw: { ...raw, agenome },
  };
}

function inspectorData(run, node) {
  const subject = nodeSubject(run, node);
  if (!subject) return null;
  const candidateId = subject.raw.id;
  const criticVerdicts = uniqueById(
    (run.criticVerdicts || []).filter((verdict) => verdict.candidateId === candidateId),
    (verdict) => `${verdict.criticId}-${verdict.score}-${verdict.pressure}`,
  );
  const fitnessRecords = uniqueById(
    (run.fitnessRecords || []).filter((record) => record.candidateId === candidateId),
    (record) => `${record.total}-${record.rationale}`,
  );
  const citationSet = new Set(subject.citedKnowledge || []);
  const evidenceItems = ((run.knowledgePacket && run.knowledgePacket.items) || []).filter(
    (item) => citationSet.size === 0 || citationSet.has(item.citeHandle),
  );
  const events = (run.dashboardEvents || []).filter(
    (event) =>
      event.candidateId === candidateId ||
      event.payload?.candidateId === candidateId ||
      event.payload?.childId === candidateId ||
      event.payload?.recoveryId === candidateId,
  );
  return {
    subject,
    criticVerdicts,
    fitnessRecords,
    evidenceItems,
    events,
  };
}

function ScoreBar({ value }) {
  const safeValue = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className="score-bar" aria-label={`score ${safeValue}`}>
      <span style={{ width: `${safeValue}%` }} />
    </div>
  );
}

function NodeInspector({ activeTab, data, onTabChange }) {
  if (!data) {
    return (
      <aside className="insight-rail">
        <div className="inspector-empty">
          <p>Node inspector</p>
          <h2>Select a graph node</h2>
          <span>Click a recovery, candidate, or fused child to inspect its critic pressure, evidence, and payload.</span>
        </div>
      </aside>
    );
  }

  const { subject, criticVerdicts, fitnessRecords, evidenceItems, events } = data;
  const tabs = ['overview', 'critics', 'evidence'];
  return (
    <aside className="insight-rail" aria-label="Selected node inspector">
      <div className="inspector-tabs" role="tablist" aria-label="Inspector views">
        {tabs.map((tab) => (
          <button
            className={activeTab === tab ? 'active' : ''}
            key={tab}
            onClick={() => onTabChange(tab)}
            role="tab"
            type="button"
          >
            {tab}
          </button>
        ))}
      </div>

      <section className="inspector-card">
        <div className="inspector-kicker">
          <span className={`status-dot ${subject.status}`} />
          <strong>{subject.kind}</strong>
          <code>{subject.id}</code>
        </div>
        <h2>{subject.title}</h2>

        {activeTab === 'overview' && (
          <div className="inspector-section">
            <p className="inspector-summary">{subject.summary}</p>
            <dl className="detail-list">
              {subject.details
                .filter(([, value]) => value)
                .map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
            </dl>
            {fitnessRecords.map((record) => (
              <article className="fitness-card" key={`${record.candidateId}-${record.total}`}>
                <div>
                  <span>Fitness total</span>
                  <strong>{record.total}</strong>
                </div>
                <ScoreBar value={record.total} />
                {record.selection ? (
                  <div className="fitness-metrics">
                    <span>novelty {percent(record.selection.axes?.novelty)}</span>
                    <span>grounding {percent(record.selection.axes?.grounding)}</span>
                    <span>{record.selection.dial}</span>
                    <span>decay {percent(record.selection.decay)}</span>
                    <span>rating {signedRating(record.selection.proposalRating?.judge)}</span>
                    <span>
                      {record.selection.frontier?.pareto
                        ? `Pareto frontier r${record.selection.frontier.rank}`
                        : `Dominated r${record.selection.frontier?.rank ?? 'n/a'}`}
                    </span>
                  </div>
                ) : null}
                {record.selection?.frontier?.dominatedBy?.length ? (
                  <small>Dominated by {record.selection.frontier.dominatedBy.join(', ')}</small>
                ) : null}
                <p>{record.rationale}</p>
              </article>
            ))}
            {subject.raw.inheritedTraits?.length ? (
              <div className="trait-list">
                <h3>Inherited traits</h3>
                {subject.raw.inheritedTraits.map((trait) => <span key={trait}>{trait}</span>)}
              </div>
            ) : null}
            {subject.raw.mutationNotes?.length ? (
              <div className="trait-list">
                <h3>Mutation notes</h3>
                {subject.raw.mutationNotes.map((note) => <span key={note}>{note}</span>)}
              </div>
            ) : null}
          </div>
        )}

        {activeTab === 'critics' && (
          <div className="inspector-section">
            {criticVerdicts.length ? (
              criticVerdicts.map((verdict) => (
                <article className="critic-card" key={`${verdict.candidateId}-${verdict.criticId}`}>
                  <div>
                    <strong>{verdict.criticId}</strong>
                    <span>{verdict.score}</span>
                  </div>
                  <ScoreBar value={verdict.score} />
                  <p>{verdict.pressure}</p>
                  <small>{verdict.revisionMandate}</small>
                </article>
              ))
            ) : (
              <p className="muted-copy">No critic verdicts are attached to this node yet.</p>
            )}
          </div>
        )}

        {activeTab === 'evidence' && (
          <div className="inspector-section">
            <div className="evidence-list">
              {evidenceItems.length ? (
                evidenceItems.map((item) => (
                  <article key={item.recordId}>
                    <div>
                      <strong>{item.citeHandle}</strong>
                      <span>{item.trustTier}</span>
                    </div>
                    <p>{item.text}</p>
                    <small>{item.citation}</small>
                  </article>
                ))
              ) : (
                <p className="muted-copy">No cited memory items are attached to this node.</p>
              )}
            </div>
            <div className="event-snips">
              <h3>Node events</h3>
              {events.slice(-6).map((event) => (
                <span key={`${event.sequence ?? event.index}-${event.type}`}>{event.type}</span>
              ))}
              {!events.length ? <p className="muted-copy">No node-specific events found.</p> : null}
            </div>
            <details className="raw-payload">
              <summary>Raw payload</summary>
              <pre>{JSON.stringify(subject.raw, null, 2)}</pre>
            </details>
          </div>
        )}
      </section>
    </aside>
  );
}

export default function App() {
  const [run, setRun] = useState(SAMPLE_RUN);
  const [selectedCase, setSelectedCase] = useState(CASE_STUDIES[0]);
  const [runId, setRunId] = useState('react_flow_preview');
  const [model, setModel] = useState('openai/gpt-4.1-mini');
  const [fitnessLens, setFitnessLens] = useState('none');
  const [fitnessSchedule, setFitnessSchedule] = useState('auto');
  const [status, setStatus] = useState('React Flow preview loaded. Run a real case to watch Doppl evolve.');
  const [history, setHistory] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [inspectorTab, setInspectorTab] = useState('overview');
  const [isRunning, setIsRunning] = useState(false);
  const streamRef = useRef(null);
  const flow = useMemo(() => buildFlow(run), [run]);
  const [nodes, setNodes, onNodesChange] = useNodesState(flow.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flow.edges);

  useEffect(() => {
    setNodes(flow.nodes);
    setEdges(flow.edges);
  }, [flow, setEdges, setNodes]);

  const refreshHistory = useCallback(async () => {
    const response = await fetch('/kernel/dashboard/runs');
    if (!response.ok) throw new Error(`history failed: ${response.status}`);
    const body = await response.json();
    setHistory(body.runs || []);
  }, []);

  useEffect(() => {
    refreshHistory().catch(() => {});
  }, [refreshHistory]);

  useEffect(() => () => streamRef.current?.close(), []);

  function mergeDashboardEvents(nextEvents) {
    setRun((currentRun) => {
      const bySequence = new Map(
        (currentRun.dashboardEvents || []).map((event) => [event.sequence ?? event.index, event]),
      );
      for (const event of nextEvents) {
        bySequence.set(event.sequence ?? event.index, event);
      }
      return {
        ...currentRun,
        dashboardEvents: Array.from(bySequence.values()).sort(
          (left, right) => (left.sequence ?? left.index ?? 0) - (right.sequence ?? right.index ?? 0),
        ),
      };
    });
  }

  async function fetchDashboardRunIndex(nextRunId) {
    const response = await fetch(`/kernel/dashboard/runs/${encodeURIComponent(nextRunId)}`);
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || `fetch failed: ${response.status}`);
    setRun(body);
    setStatus(`Loaded ${nextRunId}.`);
    await refreshHistory();
  }

  function streamRunEvents(nextRunId, options = {}) {
    streamRef.current?.close();
    if (!nextRunId || typeof EventSource === 'undefined') {
      setIsRunning(false);
      return;
    }
    const source = new EventSource(`/kernel/dashboard/runs/${encodeURIComponent(nextRunId)}/stream`);
    streamRef.current = source;
    source.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data);
        mergeDashboardEvents([event]);
        if (event.type === 'run.completed' || event.type === 'run.failed' || event.type === 'run.stopped') {
          source.close();
          setIsRunning(false);
          if (options.fetchOnTerminal && event.type === 'run.completed') {
            fetchDashboardRunIndex(nextRunId).catch((error) => {
              setStatus(error instanceof Error ? error.message : String(error));
            });
          }
        }
      } catch {
        // Ignore malformed delivery frames; the REST event log remains authoritative.
      }
    };
    source.onerror = () => {
      if (!options.reconnectUntilTerminal) {
        source.close();
        setIsRunning(false);
      }
    };
  }

  async function runSelectedCase(forceFixture = false) {
    setIsRunning(true);
    setStatus(`Running ${forceFixture ? 'FSD fixture' : selectedCase.title}...`);
    try {
      const caseStudy = forceFixture ? CASE_STUDIES[0] : selectedCase;
      const response = await fetch('/kernel/dashboard/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          runId: `${caseStudy.id}_${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`,
          casePath: caseStudy.path,
          model,
          fitnessLens,
          fitnessSchedule,
          liveModel: caseStudy.mode === 'live' && !forceFixture,
          async: true,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || `run failed: ${response.status}`);
      setRun(body);
      setRunId(body.runId);
      setStatus(`Started ${body.runId}; streaming live events.`);
      streamRunEvents(body.runId, { fetchOnTerminal: true, reconnectUntilTerminal: true });
      await refreshHistory();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
      setIsRunning(false);
    } finally {
      // Async runs clear the running state when their stream reaches a terminal event.
    }
  }

  async function fetchRun(id = runId) {
    if (!id.trim()) return;
    setStatus(`Fetching ${id}...`);
    try {
      await fetchDashboardRunIndex(id);
      streamRunEvents(id);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  const candidates = run.candidates || [];
  const survivors = nodes.filter((node) => node.type === 'kernelNode' && node.data.status !== 'rejected');
  const finalSurvivors = survivors.filter((node) => node.data.kind === 'child').slice(-4);
  const budgetUsed = budgetUnits(run);
  const fusedCount = (run.fusionChildren || []).length || (run.child ? 1 : 0);
  const runMode = run.runMode || (run.modelCalls ? 'live' : 'fixture');
  const scheduleComparison = latestScheduleComparison(run);
  const selectedInspector = useMemo(() => inspectorData(run, selectedNode), [run, selectedNode]);

  return (
    <main className="app-shell" aria-label="Doppl React Flow dashboard">
      <aside className="control-rail">
        <div className="brand-block">
          <p>Doppl Kernel</p>
          <h1>Evolution Graph</h1>
          <span>React Flow workspace for real synthesis runs.</span>
        </div>

        <section>
          <h2>Real case studies</h2>
          <div className="case-list">
            {CASE_STUDIES.map((caseStudy) => (
              <button
                className={caseStudy.id === selectedCase.id ? 'active' : ''}
                key={caseStudy.id}
                onClick={() => setSelectedCase(caseStudy)}
                type="button"
              >
                <strong>{caseStudy.title}</strong>
                <span>{caseStudy.id} / {caseStudy.mode}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="run-controls">
          <label htmlFor="run-id-input">Run ID</label>
          <input id="run-id-input" value={runId} onChange={(event) => setRunId(event.target.value)} />
          <label htmlFor="model-input">Live model</label>
          <input id="model-input" value={model} onChange={(event) => setModel(event.target.value)} />
          <label htmlFor="fitness-schedule-input">Fitness schedule</label>
          <select
            id="fitness-schedule-input"
            value={fitnessSchedule}
            onChange={(event) => setFitnessSchedule(event.target.value)}
          >
            {FITNESS_SCHEDULES.map((schedule) => (
              <option key={schedule.id} value={schedule.id}>{schedule.label}</option>
            ))}
          </select>
          <label htmlFor="fitness-lens-input">Fitness lens</label>
          <select
            id="fitness-lens-input"
            value={fitnessLens}
            onChange={(event) => setFitnessLens(event.target.value)}
          >
            {FITNESS_LENSES.map((lens) => (
              <option key={lens.id} value={lens.id}>{lens.label}</option>
            ))}
          </select>
          <button className="primary" disabled={isRunning} onClick={() => runSelectedCase(false)} type="button">
            {isRunning ? 'Running...' : 'Run selected case'}
          </button>
          <button disabled={isRunning} onClick={() => runSelectedCase(true)} type="button">
            Run FSD fixture
          </button>
          <button onClick={() => fetchRun()} type="button">
            Fetch run graph
          </button>
          <p className="status-line">{status}</p>
        </section>

        <section>
          <div className="section-heading">
            <h2>Run history</h2>
            <button onClick={refreshHistory} type="button">Refresh</button>
          </div>
          <div className="history-list">
            {history.slice(0, 9).map((item) => (
              <button
                key={`${item.caseId}-${item.runId}`}
                onClick={() => {
                  setRunId(item.runId);
                  fetchRun(item.runId);
                }}
                type="button"
              >
                <strong>{item.caseId}</strong>
                <span>{item.runId}</span>
              </button>
            ))}
          </div>
        </section>
      </aside>

      <section className="workspace">
        <header className="workspace-header">
          <div>
            <p>Lineage workspace</p>
            <h2>{run.caseId || 'sample'} / {run.runId}</h2>
          </div>
          <div className="metrics">
            <span><strong>{runMode}</strong> Run mode</span>
            <span><strong>{candidates.length}</strong> candidates</span>
            <span><strong>{generationCount(run)}</strong> generations</span>
            <span><strong>{budgetUsed}</strong> budget</span>
            <span><strong>{fusedCount}</strong> fused</span>
          </div>
        </header>

        <div className="flow-stage">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={(_, node) => {
              if (node.type !== 'kernelNode') return;
              setSelectedNode(node);
              setInspectorTab('overview');
            }}
            nodesDraggable={false}
            nodesConnectable={false}
            edgesReconnectable={false}
            deleteKeyCode={null}
            fitView
            fitViewOptions={{ padding: 0.18 }}
            minZoom={0.2}
            maxZoom={1.3}
          >
            <Background color="#1d3955" gap={18} size={1} />
            <Controls position="bottom-left" />
            <Panel position="top-right" className="flow-legend">
              <span className="survivor">survivor</span>
              <span className="rejected">rejected</span>
              <span className="final">final child</span>
            </Panel>
          </ReactFlow>
        </div>

        <div className="lower-grid">
          <section className="schedule-panel">
            <h2>Schedule comparison</h2>
            {scheduleComparison ? (
              <div className="schedule-list">
                {scheduleComparison.modes.map((mode) => (
                  <article key={`${scheduleComparison.generation}-${mode.schedule}`}>
                    <div>
                      <strong>{mode.schedule}</strong>
                      <span>{mode.weights ? `${Math.round(mode.weights.novelty * 100)} / ${Math.round(mode.weights.grounding * 100)}` : 'n/a'}</span>
                    </div>
                    <p>{mode.selectedParentIds?.length ? mode.selectedParentIds.join(' + ') : 'No selected parents'}</p>
                    <small>
                      top {readableTitle(mode.topCandidateId)} · {mode.topTotal ?? 'n/a'} · {signedRating(mode.proposalRating?.judge)}
                    </small>
                  </article>
                ))}
              </div>
            ) : (
              <p className="muted-copy">Run a case to compare diverge, balanced, and converge selection pressure.</p>
            )}
          </section>

          <section className="survivor-panel">
            <h2>Final surviving solutions</h2>
            <div className="survivor-list">
              {(finalSurvivors.length ? finalSurvivors : survivors.slice(0, 4)).map((node) => (
                <article key={node.id}>
                  <span>{node.data.badge}</span>
                  <strong>{node.data.title}</strong>
                  <p>{node.data.subtitle}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="event-panel">
            <h2>Live event stream</h2>
            <ol>
              {(run.dashboardEvents || []).slice(-12).map((event) => (
                <li key={`${event.sequence ?? event.index}-${event.type}`}>
                  <span>{event.type}</span>
                  <time>{event.occurredAt ? new Date(event.occurredAt).toLocaleTimeString() : `#${event.sequence ?? event.index}`}</time>
                </li>
              ))}
            </ol>
          </section>

          <section className="artifact-panel">
            <h2>Artifact preview</h2>
            <pre>{run.dashboardArtifact || 'Run a case to inspect the exported recovery artifact.'}</pre>
          </section>
        </div>
      </section>
      <NodeInspector activeTab={inspectorTab} data={selectedInspector} onTabChange={setInspectorTab} />
    </main>
  );
}
