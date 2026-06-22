import { type JSX, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  type Edge,
  MiniMap,
  type Node,
  ReactFlowProvider,
  useReactFlow,
} from "reactflow";
import "reactflow/dist/style.css";
import type { LineageGraphProjectionT } from "../data/contracts.js";
import { useAgenomeDisplayNames, useRunStore } from "../state/runStore.js";
import { layoutGraph } from "./layout.js";
import { nodeTypes } from "./nodeTypes.js";
import "./lineageAnimations.css";

/**
 * LineageGraph (P7.7). Consumes the lineage projection (loaded on
 * mount + refreshed when sequenceThrough advances) and renders five
 * custom node types via Dagre-positioned React Flow.
 *
 * The projection is fetched from GET /runs/:id/lineage; live SSE
 * updates are reflected by re-fetching on sequenceThrough change.
 * For a more incremental future, the projection could be folded
 * client-side from candidate/agenome events — out of scope for MVP.
 */

interface ProjectionState {
  projection: LineageGraphProjectionT | null;
  loading: boolean;
  error: string | null;
}

export function LineageGraph(): JSX.Element {
  const { state, client, dispatch } = useRunStore();
  const [{ projection, loading, error }, setState] = useState<ProjectionState>({
    projection: null,
    loading: false,
    error: null,
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: state.sequenceThrough deliberately included so live SSE updates refetch the lineage projection
  useEffect(() => {
    if (!state.runId) return;
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    void client
      .getLineage(state.runId)
      .then((projection) => {
        if (!cancelled) setState({ projection, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          projection: null,
          loading: false,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [state.runId, state.sequenceThrough, client]);

  const personaByAgenome = useAgenomeDisplayNames();

  // Derive a candidate label from its agenome's persona + generation index
  // (parsed from candidateId of the form `cand_<agenome>_<genIdx>`) and its
  // slot within the generation. Falls back to the raw id if anything's odd.
  const candidateLabel = (candidateId: string): string => {
    const c = state.candidates[candidateId];
    if (!c) return candidateId.slice(0, 18);
    const persona = personaByAgenome[c.agenomeId] ?? "Agent";
    const genMatch = c.generationId?.match(/(\d+)$/);
    const gen = genMatch ? `Gen ${genMatch[1]}` : "";
    return [`Idea from ${persona}`, gen].filter(Boolean).join(" · ");
  };

  // Track which node/edge ids were already present last render so we can
  // mark the newcomers as "freshly arrived" — those get a CSS pulse and
  // their incoming edges animate (React Flow's marching-ants effect).
  // After NEW_HIGHLIGHT_MS the highlight fades automatically.
  const NEW_HIGHLIGHT_MS = 1500;
  const seenIdsRef = useRef<{ nodes: Set<string>; edges: Set<string> }>({
    nodes: new Set(),
    edges: new Set(),
  });
  const [animatingIds, setAnimatingIds] = useState<{ nodes: Set<string>; edges: Set<string> }>({
    nodes: new Set(),
    edges: new Set(),
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: only fire when the projection's id set changes
  useEffect(() => {
    if (!projection) return;
    const currentNodes = new Set(projection.nodes.map((n) => n.id));
    const currentEdges = new Set(projection.edges.map((e) => e.id));
    const newNodes = new Set<string>();
    const newEdges = new Set<string>();
    for (const id of currentNodes) if (!seenIdsRef.current.nodes.has(id)) newNodes.add(id);
    for (const id of currentEdges) if (!seenIdsRef.current.edges.has(id)) newEdges.add(id);
    if (newNodes.size === 0 && newEdges.size === 0) return;
    setAnimatingIds({ nodes: newNodes, edges: newEdges });
    seenIdsRef.current = { nodes: currentNodes, edges: currentEdges };
    const t = setTimeout(() => {
      setAnimatingIds({ nodes: new Set(), edges: new Set() });
    }, NEW_HIGHLIGHT_MS);
    return () => clearTimeout(t);
  }, [projection?.nodes.length, projection?.edges.length]);

  const { rfNodes, rfEdges } = useMemo<{ rfNodes: Node[]; rfEdges: Edge[] }>(() => {
    if (!projection) return { rfNodes: [], rfEdges: [] };
    // Filter the projection down to the story-line node types so the graph
    // stays readable: agents → ideas → fitness scores, plus the lineage
    // edges connecting parent agents to their offspring. Critic reviews
    // and individual check results are still available — they surface in
    // the right-rail CandidateInspector when an idea is clicked.
    const STORY_TYPES = new Set(["agenome", "candidate", "scoring"]);
    const keptNodes = projection.nodes.filter((n) => STORY_TYPES.has(n.type));
    const keptIds = new Set(keptNodes.map((n) => n.id));
    const keptEdges = projection.edges.filter(
      (e) => keptIds.has(e.source) && keptIds.has(e.target),
    );
    const laid = layoutGraph(
      keptNodes.map((n) => ({ id: n.id, type: n.type })),
      keptEdges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
      { rankdir: "LR", nodesep: 50, ranksep: 220, defaultWidth: 200, defaultHeight: 88 },
    );
    // Lookup: for each scoring node, which candidate does it score?
    // The projection emits a "scores" edge from scoring_node → candidate
    // alongside the scoring node itself, so this map is exact.
    const scoringToCandidate = new Map<string, string>();
    for (const e of keptEdges) {
      if (e.type === "scores") scoringToCandidate.set(e.source, e.target);
    }
    const rfNodes: Node[] = laid.nodes.map((node) => {
      const orig = keptNodes.find((n) => n.id === node.id);
      // Replace the raw-UUID label with a human-readable derived label by
      // node type. Falls back to projection's label when no enrichment
      // applies (rare — only when the original entity hasn't been folded
      // into runStore yet).
      let friendly: string | undefined;
      let scoredCandidateId: string | undefined;
      if (orig?.type === "agenome") {
        friendly = personaByAgenome[node.id];
      } else if (orig?.type === "candidate") {
        friendly = candidateLabel(node.id);
      } else if (orig?.type === "scoring") {
        const total = orig.metrics?.total;
        friendly =
          typeof total === "number" ? `Fitness ${total.toFixed(2)}` : "Fitness";
        scoredCandidateId = scoringToCandidate.get(node.id);
      } else if (orig?.type === "critic_review") {
        friendly = `Critic: ${orig.label}`;
      } else if (orig?.type === "check_result") {
        friendly = `Check: ${orig.label}`;
      }
      return {
        id: node.id,
        type: orig?.type ?? "agenome",
        position: node.position,
        ...(animatingIds.nodes.has(node.id) ? { className: "doppl-node-new" } : {}),
        data: {
          label: friendly ?? orig?.label ?? node.id,
          rawId: node.id,
          status: orig?.status,
          metrics: orig?.metrics,
          ...(scoredCandidateId !== undefined ? { scoredCandidateId } : {}),
        },
      };
    });
    const rfEdges: Edge[] = laid.edges.map((e) => {
      const orig = keptEdges.find((eo) => eo.id === e.id);
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        type: "smoothstep",
        label: orig?.label,
        // Animate edges that just appeared so the "flow" is visible.
        animated: animatingIds.edges.has(e.id),
      };
    });
    return { rfNodes, rfEdges };
  }, [projection, personaByAgenome, animatingIds]);

  if (!state.runId) {
    return <div style={{ padding: 24, color: "var(--doppl-text-secondary)" }}>No run loaded.</div>;
  }
  if (error) {
    return (
      <div role="alert" style={{ padding: 24, color: "var(--doppl-status-error)" }}>
        Lineage error: {error}
      </div>
    );
  }
  if (loading && !projection) {
    return <div style={{ padding: 24 }}>Loading lineage…</div>;
  }
  if (!projection || projection.nodes.length === 0) {
    return (
      <div style={{ padding: 24, color: "var(--doppl-text-secondary)" }}>
        No lineage yet. Events will appear as generations spawn candidates.
      </div>
    );
  }
  return (
    <ReactFlowProvider>
      <LineageCanvas rfNodes={rfNodes} rfEdges={rfEdges} dispatch={dispatch} />
    </ReactFlowProvider>
  );
}

function LineageCanvas({
  rfNodes,
  rfEdges,
  dispatch,
}: {
  rfNodes: Node[];
  rfEdges: Edge[];
  // biome-ignore lint/suspicious/noExplicitAny: dispatch typing flows from useRunStore
  dispatch: (action: any) => void;
}): JSX.Element {
  const rf = useReactFlow();

  // Re-fit the view whenever the node count changes. React Flow's `fitView`
  // prop only fits on initial mount; without this the graph stays zoomed on
  // the first 3-5 nodes and the rest of the 100+ node tree is off-screen.
  useEffect(() => {
    if (rfNodes.length === 0) return;
    // Defer one frame so React Flow has positioned the newly-merged nodes.
    const t = setTimeout(() => rf.fitView({ padding: 0.05, duration: 300, maxZoom: 1.4 }), 50);
    return () => clearTimeout(t);
  }, [rf, rfNodes.length]);

  return (
    <div
      className="doppl-flow"
      style={{ height: "100%", width: "100%" }}
      aria-label="Lineage graph"
    >
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onNodeClick={(_, node) => {
          if (node.type === "candidate") {
            dispatch({ kind: "SELECT_CANDIDATE", candidateId: node.id });
          } else if (node.type === "agenome") {
            dispatch({ kind: "SELECT_AGENOME", agenomeId: node.id });
          } else if (node.type === "scoring") {
            // A score belongs to exactly one candidate — selecting the
            // score is the same intent as selecting that candidate.
            const candidateId = (node.data as { scoredCandidateId?: string } | undefined)
              ?.scoredCandidateId;
            if (candidateId) dispatch({ kind: "SELECT_CANDIDATE", candidateId });
          }
        }}
        fitView
        fitViewOptions={{ padding: 0.05, maxZoom: 1.4 }}
        minZoom={0.05}
        maxZoom={2.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls />
        {/* Birds-eye view so the operator can see where they are within
         *  the 100+ node tree and click-to-pan to a region of interest. */}
        <MiniMap
          pannable
          zoomable
          maskColor="rgba(0,0,0,0.55)"
          nodeColor={(n) => {
            switch (n.type) {
              case "agenome":
                return "var(--doppl-status-info, #38bdf8)";
              case "candidate":
                return "var(--doppl-status-pending, #F2A93B)";
              case "scoring":
                return "var(--doppl-status-ok, #1FB890)";
              case "critic_review":
                return "var(--doppl-status-warn, #E84A8A)";
              case "check_result":
                return "var(--doppl-status-skip, #B8B4D4)";
              default:
                return "#888";
            }
          }}
          style={{ background: "var(--doppl-bg-elevated)" }}
        />
      </ReactFlow>
    </div>
  );
}
