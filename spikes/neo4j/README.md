# Neo4j Lineage Spike (P6.11)

**⚠️ Throwaway notebook. Never imported by runtime code. Never blocks CI.**

This spike proves four lineage-query shapes against a derived export from
`LineageGraphProjection`. Neo4j is **not** synchronized from the
authoritative event log and **not** a runtime dependency. The runtime
demo path works without this spike present.

## Query shapes proven

1. **Ancestors-of-winner** — walk parent edges from the selected candidate
   back to the gen-0 agenomes.
2. **Parent-contribution** — for each top-K agenome, count descendants
   that landed in the survivor set.
3. **Critic-kill patterns** — find candidates with `lineage.culled` linked
   to their reviews; surface which critic mandates drove the cull.
4. **Lineage distance/diversity** — average path length + clustering
   coefficient over the lineage subgraph.

## Generating an export

```bash
# Start the API server pointed at a populated event log
pnpm --filter @doppl/api dev

# Export one run's lineage to JSON (replace <runId> with an actual id)
curl http://localhost:3000/runs/<runId>/lineage > spikes/neo4j/lineage-<runId>.json
```

The export is gitignored. Drop it into the notebook's "Load JSON" cell
and run the four query cells.

## Running the notebook

```bash
# Start a local Neo4j (or use Neo4j Desktop)
docker run -d --name neo4j-spike \
  -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/spike-password \
  -e NEO4J_PLUGINS='["apoc"]' \
  neo4j:5

# Open the notebook in Jupyter
jupyter notebook lineage-queries.ipynb
```

The notebook expects `apoc.load.json` available — the env var above
preinstalls APOC.

## Why this exists

The spec called for a 1-engineer-day timeboxed exploration to validate
lineage queries are tractable in a graph DB even though the runtime
stays storage-agnostic. The four queries above are the load-bearing
ones for the dashboard's "explainability" tab. Future iterations may
ship a synchronized Neo4j sidecar; this spike is the smallest evidence
that the query shapes work before committing to that infrastructure.
