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
