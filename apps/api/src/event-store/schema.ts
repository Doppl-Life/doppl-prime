import {
  bigint,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Drizzle schema for the canonical Doppl table set.
 *
 * Every status / type column is `text` rather than a Postgres enum: the
 * closed enums live in `@doppl/contracts` (Zod) and are validated at the
 * application boundary (the append writer). Postgres enums would force a
 * coupled migration on every contract-level enum change; `text` keeps the
 * boundary single-source-of-truth in Zod.
 *
 * Column naming: contracts use camelCase; columns use snake_case. The
 * U2 cross-contract invariant test asserts the column set on
 * `run_events` is a snake-case superset of `RunEventEnvelope`'s keys.
 *
 * `bigint` columns use `mode: "number"` — per-run sequences stay well
 * below 2^53 in any realistic run; arithmetic on the TS side stays cheap.
 */

// ─── Runs ──────────────────────────────────────────────────────────────

export const runs = pgTable("runs", {
  id: text("id").primaryKey(),
  status: text("status").notNull(),
  // RunConfig is stored as a single jsonb so the row is a self-contained
  // snapshot of what the run was started against; the application boundary
  // still validates against the @doppl/contracts RunConfig schema.
  config: jsonb("config").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  terminalSummary: text("terminal_summary"),
});

// ─── run_events — the authoritative append-only log ────────────────────

export const runEvents = pgTable(
  "run_events",
  {
    id: text("id").primaryKey(),
    runId: text("run_id").notNull(),
    sequence: bigint("sequence", { mode: "number" }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    type: text("type").notNull(),
    actor: text("actor").notNull(),
    payload: jsonb("payload").notNull(),
    schemaVersion: integer("schema_version").notNull(),
    correlationId: text("correlation_id"),
    langfuseTraceId: text("langfuse_trace_id"),
    langfuseObservationId: text("langfuse_observation_id"),
    generationId: text("generation_id"),
    agenomeId: text("agenome_id"),
    candidateId: text("candidate_id"),
  },
  (t) => ({
    runSequenceUnique: uniqueIndex("run_events_run_id_sequence_uq").on(t.runId, t.sequence),
    runIdIdx: index("run_events_run_id_idx").on(t.runId),
  }),
);

// ─── Generations ───────────────────────────────────────────────────────

export const generations = pgTable("generations", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  index: integer("index").notNull(),
  status: text("status").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

// ─── Agenomes ──────────────────────────────────────────────────────────

export const agenomes = pgTable("agenomes", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  generationId: text("generation_id").notNull(),
  parentIds: text("parent_ids").array().notNull(),
  systemPrompt: text("system_prompt").notNull(),
  personaWeights: jsonb("persona_weights").notNull(),
  toolPermissions: text("tool_permissions").array().notNull(),
  decompositionPolicy: text("decomposition_policy").notNull(),
  spawnBudget: integer("spawn_budget").notNull(),
  mutationMeta: jsonb("mutation_meta"),
  status: text("status").notNull(),
});

// ─── Candidate ideas ───────────────────────────────────────────────────

export const candidateIdeas = pgTable("candidate_ideas", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  generationId: text("generation_id").notNull(),
  agenomeId: text("agenome_id").notNull(),
  subtype: text("subtype").notNull(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  claims: jsonb("claims").notNull(),
  evidenceRefs: jsonb("evidence_refs").notNull(),
  status: text("status").notNull(),
  subtypePayload: jsonb("subtype_payload").notNull(),
});

// ─── Critic reviews ────────────────────────────────────────────────────

export const criticReviews = pgTable("critic_reviews", {
  id: text("id").primaryKey(),
  candidateId: text("candidate_id").notNull(),
  mandate: text("mandate").notNull(),
  scores: jsonb("scores").notNull(),
  critique: text("critique").notNull(),
  confidence: real("confidence").notNull(),
  evidenceRefs: jsonb("evidence_refs").notNull(),
});

// ─── Check results ─────────────────────────────────────────────────────

export const checkResults = pgTable("check_results", {
  id: text("id").primaryKey(),
  candidateId: text("candidate_id").notNull(),
  checkType: text("check_type").notNull(),
  status: text("status").notNull(),
  score: real("score"),
  output: jsonb("output"),
  skipReason: text("skip_reason"),
  evidenceRefs: jsonb("evidence_refs").notNull(),
  error: text("error"),
});

// ─── Fitness scores ────────────────────────────────────────────────────

export const fitnessScores = pgTable("fitness_scores", {
  id: text("id").primaryKey(),
  candidateId: text("candidate_id").notNull(),
  total: real("total").notNull(),
  components: jsonb("components").notNull(),
  policyVersion: text("policy_version").notNull(),
  explanation: text("explanation").notNull(),
});

// ─── Novelty scores (authoritative vector storage) ─────────────────────

export const noveltyScores = pgTable("novelty_scores", {
  id: text("id").primaryKey(),
  candidateId: text("candidate_id").notNull(),
  vector: real("vector").array().notNull(),
  embeddingModelId: text("embedding_model_id").notNull(),
  dimension: integer("dimension").notNull(),
  comparisonSet: text("comparison_set").array().notNull(),
  method: text("method").notNull(),
  score: real("score").notNull(),
  explanation: text("explanation").notNull(),
});

// ─── Lineage edges ─────────────────────────────────────────────────────

export const lineageEdges = pgTable("lineage_edges", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  source: text("source").notNull(),
  target: text("target").notNull(),
  type: text("type").notNull(),
  label: text("label"),
});

// ─── Embeddings — INDEX only, authority lives in novelty_scores ─────────

export const embeddings = pgTable("embeddings", {
  id: text("id").primaryKey(),
  candidateId: text("candidate_id").notNull(),
  embeddingModelId: text("embedding_model_id").notNull(),
  dimension: integer("dimension").notNull(),
  // Authority for the vector lives in novelty_scores; this column is a
  // queryable index over it. Same `real[]` shape so the two stay aligned.
  vector: real("vector").array().notNull(),
});

// ─── Dashboard snapshots (cached projection) ───────────────────────────

export const dashboardSnapshots = pgTable("dashboard_snapshots", {
  runId: text("run_id").primaryKey(),
  throughRunId: text("through_run_id").notNull(),
  throughSequence: bigint("through_sequence", { mode: "number" }).notNull(),
  snapshot: jsonb("snapshot").notNull(),
  builtAt: timestamp("built_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Schema barrel for column-set snapshots and cross-contract tests ───

export const allTables = {
  runs,
  runEvents,
  generations,
  agenomes,
  candidateIdeas,
  criticReviews,
  checkResults,
  fitnessScores,
  noveltyScores,
  lineageEdges,
  embeddings,
  dashboardSnapshots,
} as const;
