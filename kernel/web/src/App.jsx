import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
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
    mode: 'live',
  },
  {
    id: 'ai-overviews-zero-click-publishing',
    title: 'AI Overviews Publishing',
    path: 'case-studies/ai-overviews-zero-click-publishing/problem-statement.md',
    mode: 'live',
  },
  {
    id: 'starship-launch-cost-collapse',
    title: 'Starship Launch Cost',
    path: 'case-studies/starship-launch-cost-collapse/problem-statement.md',
    mode: 'live',
  },
];

const SAMPLE_RUN = {
  runId: 'react_flow_preview',
  caseId: 'fsd-ownership-unwind',
  generations: 4,
  budgetUsed: 4,
  problemRecovery: {
    id: 'recovery_fsd',
    title: 'Recovered Ownership Unwind',
    recoveredProblem:
      'Autonomous fleets make private idle vehicles look like stranded capacity.',
    hiddenConstraint: 'The handoff is liability pricing, not showroom demand.',
  },
  candidates: [
    ...Array.from({ length: 4 }, (_, generation) => [
      {
        id: `liability_clock_g${generation}`,
        title: 'Liability Clock',
        generation,
        summary: 'Track filings where insurers price the vehicle as the risk-bearing actor.',
      },
      {
        id: `residual_stress_g${generation}`,
        title: 'Residual Stress',
        generation,
        summary: 'Map exposed leases, floorplan loans, and auto ABS stress.',
      },
      {
        id: `fleet_inventory_g${generation}`,
        title: 'Fleet Inventory',
        generation,
        summary: 'Watch utilization density replace household ownership utility.',
      },
      {
        id: `dealer_drag_g${generation}`,
        title: 'Dealer Drag',
        generation,
        summary: 'Find where franchise incentives lag fleet economics.',
      },
    ]),
  ].flat(),
  fitness: [
    ...Array.from({ length: 4 }, (_, generation) => [
      { candidateId: `liability_clock_g${generation}`, generation, total: 88 - generation },
      { candidateId: `residual_stress_g${generation}`, generation, total: 73 + generation },
      { candidateId: `fleet_inventory_g${generation}`, generation, total: 79 + generation },
      { candidateId: `dealer_drag_g${generation}`, generation, total: 48 + generation },
    ]),
  ].flat(),
  selectedParents: Array.from({ length: 4 }, (_, generation) => ({
    generation,
    selected: [`liability_clock_g${generation}`, `fleet_inventory_g${generation}`],
  })),
  fusionChildren: Array.from({ length: 4 }, (_, generation) => ({
    generation,
    child: {
      id: `child_liability_fleet_g${generation}`,
      title: generation === 3 ? 'Surviving Solution' : `Fused Child G${generation + 1}`,
      summary: 'Liability clock meets fleet utilization as an early unwind detector.',
    },
  })),
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
  if (fusionChild?.child) return fusionChild.child;
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
      nodes.push({
        id: nodeId,
        type: 'kernelNode',
        position: { x: baseX + generation * laneWidth, y: topY + index * cardGap },
        data: {
          kind: 'candidate',
          status,
          title: candidate.title || readableTitle(candidate.id),
          subtitle: candidate.summary || candidate.mechanism || candidate.path || 'Candidate pressure point',
          badge: score === null ? 'unscored' : `fitness ${score}`,
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

export default function App() {
  const [run, setRun] = useState(SAMPLE_RUN);
  const [selectedCase, setSelectedCase] = useState(CASE_STUDIES[0]);
  const [runId, setRunId] = useState('react_flow_preview');
  const [model, setModel] = useState('openai/gpt-4.1-mini');
  const [status, setStatus] = useState('React Flow preview loaded. Run a real case to watch Doppl evolve.');
  const [history, setHistory] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
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

  function streamRunEvents(nextRunId) {
    streamRef.current?.close();
    if (!nextRunId || typeof EventSource === 'undefined') return;
    const source = new EventSource(`/kernel/dashboard/runs/${encodeURIComponent(nextRunId)}/stream`);
    streamRef.current = source;
    source.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data);
        mergeDashboardEvents([event]);
        if (event.type === 'run.completed' || event.type === 'run.failed' || event.type === 'run.stopped') {
          source.close();
        }
      } catch {
        // Ignore malformed delivery frames; the REST event log remains authoritative.
      }
    };
    source.onerror = () => {
      source.close();
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
          liveModel: caseStudy.mode === 'live' && !forceFixture,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || `run failed: ${response.status}`);
      setRun(body);
      setRunId(body.runId);
      setStatus(`Loaded ${body.runId}.`);
      streamRunEvents(body.runId);
      await refreshHistory();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsRunning(false);
    }
  }

  async function fetchRun(id = runId) {
    if (!id.trim()) return;
    setStatus(`Fetching ${id}...`);
    try {
      const response = await fetch(`/kernel/runs/${encodeURIComponent(id)}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || `fetch failed: ${response.status}`);
      setRun(body);
      setStatus(`Loaded ${id}.`);
      streamRunEvents(id);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  const candidates = run.candidates || [];
  const survivors = nodes.filter((node) => node.type === 'kernelNode' && node.data.status !== 'rejected');
  const finalSurvivors = survivors.filter((node) => node.data.kind === 'child').slice(-4);
  const budgetUsed = run.budgetUsed ?? run.budget?.usedUnits ?? run.budget ?? 0;
  const fusedCount = (run.fusionChildren || []).length || (run.child ? 1 : 0);

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
            onNodeClick={(_, node) => setSelectedNode(node)}
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
            <MiniMap
              className="react-flow-minimap"
              pannable
              zoomable
              nodeColor={(node) => {
                if (node.data?.status === 'final') return '#ffe36e';
                if (node.data?.status === 'survivor') return '#24d6a5';
                if (node.data?.status === 'rejected') return '#ff6b92';
                return '#5ca7ff';
              }}
            />
            <Panel position="top-right" className="flow-legend">
              <span className="survivor">survivor</span>
              <span className="rejected">rejected</span>
              <span className="final">final child</span>
            </Panel>
          </ReactFlow>
        </div>

        <div className="lower-grid">
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

          <section className="inspector-panel">
            <h2>Node inspector</h2>
            {selectedNode ? (
              <div>
                <strong>{selectedNode.data.title}</strong>
                <p>{selectedNode.data.subtitle}</p>
                <code>{selectedNode.id}</code>
              </div>
            ) : (
              <p>Select a node to inspect its role in the lineage.</p>
            )}
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
    </main>
  );
}
