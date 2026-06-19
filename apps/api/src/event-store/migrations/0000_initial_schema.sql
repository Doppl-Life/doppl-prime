CREATE TABLE IF NOT EXISTS "agenomes" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"generation_id" text NOT NULL,
	"parent_ids" text[] NOT NULL,
	"system_prompt" text NOT NULL,
	"persona_weights" jsonb NOT NULL,
	"tool_permissions" text[] NOT NULL,
	"decomposition_policy" text NOT NULL,
	"spawn_budget" integer NOT NULL,
	"mutation_meta" jsonb,
	"status" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "candidate_ideas" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"generation_id" text NOT NULL,
	"agenome_id" text NOT NULL,
	"subtype" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"claims" jsonb NOT NULL,
	"evidence_refs" jsonb NOT NULL,
	"status" text NOT NULL,
	"subtype_payload" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "check_results" (
	"id" text PRIMARY KEY NOT NULL,
	"candidate_id" text NOT NULL,
	"check_type" text NOT NULL,
	"status" text NOT NULL,
	"score" real,
	"output" jsonb,
	"skip_reason" text,
	"evidence_refs" jsonb NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "critic_reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"candidate_id" text NOT NULL,
	"mandate" text NOT NULL,
	"scores" jsonb NOT NULL,
	"critique" text NOT NULL,
	"confidence" real NOT NULL,
	"evidence_refs" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dashboard_snapshots" (
	"run_id" text PRIMARY KEY NOT NULL,
	"through_run_id" text NOT NULL,
	"through_sequence" bigint NOT NULL,
	"snapshot" jsonb NOT NULL,
	"built_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "embeddings" (
	"id" text PRIMARY KEY NOT NULL,
	"candidate_id" text NOT NULL,
	"embedding_model_id" text NOT NULL,
	"dimension" integer NOT NULL,
	"vector" real[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fitness_scores" (
	"id" text PRIMARY KEY NOT NULL,
	"candidate_id" text NOT NULL,
	"total" real NOT NULL,
	"components" jsonb NOT NULL,
	"policy_version" text NOT NULL,
	"explanation" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "generations" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"index" integer NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lineage_edges" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"source" text NOT NULL,
	"target" text NOT NULL,
	"type" text NOT NULL,
	"label" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "novelty_scores" (
	"id" text PRIMARY KEY NOT NULL,
	"candidate_id" text NOT NULL,
	"vector" real[] NOT NULL,
	"embedding_model_id" text NOT NULL,
	"dimension" integer NOT NULL,
	"comparison_set" text[] NOT NULL,
	"method" text NOT NULL,
	"score" real NOT NULL,
	"explanation" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "run_events" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"sequence" bigint NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"type" text NOT NULL,
	"actor" text NOT NULL,
	"payload" jsonb NOT NULL,
	"schema_version" integer NOT NULL,
	"correlation_id" text,
	"langfuse_trace_id" text,
	"langfuse_observation_id" text,
	"generation_id" text,
	"agenome_id" text,
	"candidate_id" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "runs" (
	"id" text PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"config" jsonb NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"terminal_summary" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "run_events_run_id_sequence_uq" ON "run_events" USING btree ("run_id","sequence");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "run_events_run_id_idx" ON "run_events" USING btree ("run_id");