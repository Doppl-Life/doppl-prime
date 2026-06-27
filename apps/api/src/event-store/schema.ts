import {
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/**
 * Canonical event-store schema (ARCHITECTURE.md §9). Columns MIRROR the frozen `@doppl/contracts`
 * models — no contract is redefined here. `run_events` is the sole AUTHORITATIVE table (append-only,
 * per-run monotonic `sequence`); every other table is a DERIVED, rebuildable projection.
 *
 * No foreign keys: in an event-sourced design every projection is dropped/rebuilt from the
 * authoritative log, so integrity comes from the projector replaying `run_events`, not from DB FKs
 * (which only invert the dependency + add rebuild-order friction). All id references are opaque,
 * indexed string columns (IDs-opaque carry-forward).
 */

/** Authoritative append-only log — the source of truth (rule #2). Append-only trigger + the unique
 * (run_id, sequence) constraint are added by a hand-authored SQL migration (not expressible in the
 * Drizzle DSL). `occurred_at` is DB-stamped UTC and is display-only — `sequence` is the sole order key. */
export const runEvents = pgTable(
  'run_events',
  {
    id: text('id').primaryKey(),
    runId: text('run_id').notNull(),
    generationId: text('generation_id'),
    agenomeId: text('agenome_id'),
    candidateId: text('candidate_id'),
    type: text('type').notNull(),
    sequence: integer('sequence').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    actor: text('actor').notNull(),
    correlationId: text('correlation_id'),
    langfuseTraceId: text('langfuse_trace_id'),
    langfuseObservationId: text('langfuse_observation_id'),
    payload: jsonb('payload').notNull(),
    schemaVersion: integer('schema_version').notNull(),
  },
  (t) => [
    uniqueIndex('run_events_run_id_sequence_key').on(t.runId, t.sequence),
    index('run_events_run_id_idx').on(t.runId),
  ],
);

export const runs = pgTable('runs', {
  id: text('id').primaryKey(),
  seed: text('seed').notNull(),
  enabledSubtypes: jsonb('enabled_subtypes').notNull(),
  caps: jsonb('caps').notNull(),
  status: text('status').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

export const generations = pgTable('generations', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull(),
  index: integer('index').notNull(),
  status: text('status').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

export const agenomes = pgTable('agenomes', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull(),
  generationId: text('generation_id').notNull(),
  parentIds: jsonb('parent_ids').notNull(),
  systemPrompt: text('system_prompt').notNull(),
  personaWeights: jsonb('persona_weights').notNull(),
  toolPermissions: jsonb('tool_permissions').notNull(),
  decompositionPolicy: jsonb('decomposition_policy').notNull(),
  spawnBudget: integer('spawn_budget').notNull(),
  mutationMeta: jsonb('mutation_meta'),
  status: text('status').notNull(),
});

export const candidateIdeas = pgTable('candidate_ideas', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull(),
  generationId: text('generation_id').notNull(),
  agenomeId: text('agenome_id').notNull(),
  subtype: text('subtype').notNull(),
  title: text('title').notNull(),
  summary: text('summary').notNull(),
  claims: jsonb('claims').notNull(),
  evidenceRefs: jsonb('evidence_refs').notNull(),
  status: text('status').notNull(),
  subtypePayload: jsonb('subtype_payload').notNull(),
});

export const criticReviews = pgTable('critic_reviews', {
  id: text('id').primaryKey(),
  candidateId: text('candidate_id').notNull(),
  mandate: text('mandate').notNull(),
  scores: jsonb('scores').notNull(),
  critique: text('critique').notNull(),
  confidence: doublePrecision('confidence').notNull(),
  evidenceRefs: jsonb('evidence_refs').notNull(),
});

export const checkResults = pgTable('check_results', {
  id: text('id').primaryKey(),
  candidateId: text('candidate_id').notNull(),
  checkType: text('check_type').notNull(),
  status: text('status').notNull(),
  score: doublePrecision('score'),
  output: jsonb('output'),
  skipReason: text('skip_reason'),
  evidenceRefs: jsonb('evidence_refs').notNull(),
  error: text('error'),
});

export const fitnessScores = pgTable('fitness_scores', {
  id: text('id').primaryKey(),
  candidateId: text('candidate_id').notNull(),
  total: doublePrecision('total').notNull(),
  components: jsonb('components').notNull(),
  policyVersion: text('policy_version').notNull(),
  explanation: text('explanation').notNull(),
});

export const noveltyScores = pgTable('novelty_scores', {
  id: text('id').primaryKey(),
  candidateId: text('candidate_id').notNull(),
  vector: jsonb('vector').notNull(),
  embeddingModelId: text('embedding_model_id').notNull(),
  dimension: integer('dimension').notNull(),
  comparisonSet: jsonb('comparison_set').notNull(),
  method: text('method').notNull(),
  score: doublePrecision('score').notNull(),
  explanation: text('explanation').notNull(),
});

export const lineageEdges = pgTable('lineage_edges', {
  id: text('id').primaryKey(),
  source: text('source').notNull(),
  target: text('target').notNull(),
  type: text('type').notNull(),
  label: text('label'),
});

/** Index/query layer over the authoritative `novelty.scored` vector — never the system of record
 * (no pgvector day-one; deferred per §9). */
export const embeddings = pgTable('embeddings', {
  id: text('id').primaryKey(),
  candidateId: text('candidate_id'),
  vector: jsonb('vector').notNull(),
  embeddingModelId: text('embedding_model_id').notNull(),
  dimension: integer('dimension').notNull(),
});

/** Cached/rebuildable projection — carries the (run_id, sequence) watermark it was built through, so
 * it is rebuilt/discarded when newer events exist (§9). */
export const dashboardSnapshots = pgTable('dashboard_snapshots', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull(),
  sequence: integer('sequence').notNull(),
  snapshot: jsonb('snapshot').notNull(),
});

/**
 * Imported outer-bloom artifacts — a narrow read model for case-study → problem-recovery → Doppl trees.
 * This is the bridge for the hosted outer view while the inner kernel learns to emit first-class outer
 * artifact events. It is intentionally separate from `run_events`: boot/runtime remains append-only, and
 * this table can be truncated/rebuilt from aGarden or, tomorrow, from durable outer-artifact projections.
 */
export const outerBloomArtifacts = pgTable(
  'outer_bloom_artifacts',
  {
    id: text('id').primaryKey(),
    runId: text('run_id').notNull(),
    stage: text('stage').notNull(),
    label: text('label').notNull(),
    summary: text('summary').notNull(),
    status: text('status').notNull(),
    parentId: text('parent_id'),
    generationIndex: integer('generation_index'),
    score: doublePrecision('score'),
    novelty: doublePrecision('novelty'),
    judgeAcceptance: doublePrecision('judge_acceptance'),
    sourceId: text('source_id'),
    agenomeId: text('agenome_id'),
    artifactPath: text('artifact_path').notNull(),
    sequence: integer('sequence').notNull(),
    body: text('body').notNull(),
    importedAt: timestamp('imported_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('outer_bloom_artifacts_run_id_idx').on(t.runId),
    index('outer_bloom_artifacts_parent_id_idx').on(t.parentId),
    index('outer_bloom_artifacts_stage_idx').on(t.stage),
  ],
);

/**
 * Testing/operator suppressions for projection-derived Agarden nodes.
 *
 * Imported artifacts can be removed from `outer_bloom_artifacts`, but live Agarden nodes are derived from
 * append-only `run_events`. This table is the reversible read-model tombstone layer: it hides a node root
 * and its current/future descendants from `GET /bloom` without mutating authoritative kernel history.
 */
export const outerBloomHiddenNodes = pgTable(
  'outer_bloom_hidden_nodes',
  {
    id: text('id').primaryKey(),
    runId: text('run_id').notNull(),
    nodeId: text('node_id').notNull(),
    hiddenAt: timestamp('hidden_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('outer_bloom_hidden_nodes_run_id_node_id_key').on(t.runId, t.nodeId),
    index('outer_bloom_hidden_nodes_run_id_idx').on(t.runId),
    index('outer_bloom_hidden_nodes_node_id_idx').on(t.nodeId),
  ],
);

/**
 * Server-owned outer campaign state — the durable bridge between the Agarden operator surface and the
 * append-only inner run log. These tables are intentionally API-local while the inner/outer contract is
 * still being proven: kernel mechanics remain authoritative in `run_events`, and promoted outer artifacts
 * carry source-run pointers for audit/open-inner-run behavior.
 */
export const outerCampaigns = pgTable(
  'outer_campaigns',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    synopsis: text('synopsis').notNull(),
    status: text('status').notNull(),
    rootArtifactId: text('root_artifact_id').notNull(),
    settings: jsonb('settings').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('outer_campaigns_status_idx').on(t.status)],
);

export const outerCampaignArtifacts = pgTable(
  'outer_campaign_artifacts',
  {
    id: text('id').primaryKey(),
    campaignId: text('campaign_id').notNull(),
    stage: text('stage').notNull(),
    label: text('label').notNull(),
    summary: text('summary').notNull(),
    body: text('body').notNull(),
    status: text('status').notNull(),
    parentArtifactId: text('parent_artifact_id'),
    sourceRunId: text('source_run_id'),
    sourceCandidateId: text('source_candidate_id'),
    sourceSequenceThrough: integer('source_sequence_through'),
    score: doublePrecision('score'),
    novelty: doublePrecision('novelty'),
    judgeAcceptance: doublePrecision('judge_acceptance'),
    artifactPath: text('artifact_path').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('outer_campaign_artifacts_campaign_id_idx').on(t.campaignId),
    index('outer_campaign_artifacts_parent_id_idx').on(t.parentArtifactId),
    index('outer_campaign_artifacts_stage_idx').on(t.stage),
    index('outer_campaign_artifacts_source_run_id_idx').on(t.sourceRunId),
  ],
);

export const outerCampaignChildRuns = pgTable(
  'outer_campaign_child_runs',
  {
    id: text('id').primaryKey(),
    campaignId: text('campaign_id').notNull(),
    runId: text('run_id').notNull(),
    stage: text('stage').notNull(),
    parentArtifactId: text('parent_artifact_id').notNull(),
    status: text('status').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('outer_campaign_child_runs_run_id_key').on(t.runId),
    index('outer_campaign_child_runs_campaign_id_idx').on(t.campaignId),
    index('outer_campaign_child_runs_parent_id_idx').on(t.parentArtifactId),
  ],
);

export const outerPromotionDecisions = pgTable(
  'outer_promotion_decisions',
  {
    id: text('id').primaryKey(),
    campaignId: text('campaign_id').notNull(),
    childRunId: text('child_run_id').notNull(),
    artifactId: text('artifact_id').notNull(),
    sourceCandidateId: text('source_candidate_id'),
    reason: text('reason').notNull(),
    proof: jsonb('proof').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('outer_promotion_decisions_campaign_id_idx').on(t.campaignId),
    index('outer_promotion_decisions_child_run_id_idx').on(t.childRunId),
    index('outer_promotion_decisions_artifact_id_idx').on(t.artifactId),
  ],
);
