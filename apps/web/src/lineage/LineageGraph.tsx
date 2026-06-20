import { type JSX, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, { Background, Controls, type Edge, type Node } from "reactflow";
import "reactflow/dist/style.css";
import type { LineageGraphProjectionT } from "../data/contracts.js";
import { useRunStore } from "../state/runStore.js";
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

  // Persona name map (client-side derivation). Gen-0 agenomes are
  // materialized in a fixed order from defaultGen0Bundle — we name them
  // by insertion order. Descendants inherit their root ancestor's name.
  // Walking parentIds lets us trace any agenome back to its founding seed.
  const PERSONA_NAMES = ["Explorer", "Rigorist", "Connector", "Skeptic", "Synthesist"];
  const personaByAgenome = useMemo(() => {
    const ids = Object.keys(state.agenomes);
    const map: Record<string, string> = {};
    let gen0Index = 0;
    const findRootName = (id: string, depth = 0): string | undefined => {
      if (depth > 16) return undefined; // cycle / runaway safety
      const a = state.agenomes[id];
      if (!a) return undefined;
      if (a.parentIds.length === 0) return map[id];
      for (const p of a.parentIds) {
        const n = findRootName(p, depth + 1);
        if (n) return n;
      }
      return undefined;
    };
    for (const id of ids) {
      const a = state.agenomes[id];
      if (a && a.parentIds.length === 0) {
        map[id] = PERSONA_NAMES[gen0Index] ?? `Seed-${gen0Index + 1}`;
        gen0Index += 1;
      }
    }
    for (const id of ids) {
      const a = state.agenomes[id];
      if (!a || a.parentIds.length === 0) continue;
      map[id] = findRootName(id) ?? "Descendant";
    }
    return map;
  }, [state.agenomes]);

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
    const laid = layoutGraph(
      projection.nodes.map((n) => ({ id: n.id, type: n.type })),
      projection.edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
    );
    const rfNodes: Node[] = laid.nodes.map((node) => {
      const orig = projection.nodes.find((n) => n.id === node.id);
      // Replace the raw-UUID label with a human-readable derived label by
      // node type. Falls back to projection's label when no enrichment
      // applies (rare — only when the original entity hasn't been folded
      // into runStore yet).
      let friendly: string | undefined;
      if (orig?.type === "agenome") {
        friendly = personaByAgenome[node.id];
      } else if (orig?.type === "candidate") {
        friendly = candidateLabel(node.id);
      } else if (orig?.type === "scoring") {
        const total = orig.metrics?.total;
        friendly =
          typeof total === "number" ? `Fitness ${total.toFixed(2)}` : "Fitness";
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
        },
      };
    });
    const rfEdges: Edge[] = laid.edges.map((e) => {
      const orig = projection.edges.find((eo) => eo.id === e.id);
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
    <div style={{ height: "100%", width: "100%" }} aria-label="Lineage graph">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onNodeClick={(_, node) => {
          if (node.type === "candidate") {
            dispatch({ kind: "SELECT_CANDIDATE", candidateId: node.id });
          } else if (node.type === "agenome") {
            dispatch({ kind: "SELECT_AGENOME", agenomeId: node.id });
          }
        }}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
