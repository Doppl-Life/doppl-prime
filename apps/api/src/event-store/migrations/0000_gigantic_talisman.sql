CREATE TABLE "agenomes" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"generation_id" text NOT NULL,
	"parent_ids" jsonb NOT NULL,
	"system_prompt" text NOT NULL,
	"persona_weights" jsonb NOT NULL,
	"tool_permissions" jsonb NOT NULL,
	"decomposition_policy" jsonb NOT NULL,
	"spawn_budget" integer NOT NULL,
	"mutation_meta" jsonb,
	"status" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidate_ideas" (
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
CREATE TABLE "check_results" (
	"id" text PRIMARY KEY NOT NULL,
	"candidate_id" text NOT NULL,
	"check_type" text NOT NULL,
	"status" text NOT NULL,
	"score" double precision,
	"output" jsonb,
	"skip_reason" text,
	"evidence_refs" jsonb NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "critic_reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"candidate_id" text NOT NULL,
	"mandate" text NOT NULL,
	"scores" jsonb NOT NULL,
	"critique" text NOT NULL,
	"confidence" double precision NOT NULL,
	"evidence_refs" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dashboard_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"sequence" integer NOT NULL,
	"snapshot" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "embeddings" (
	"id" text PRIMARY KEY NOT NULL,
	"candidate_id" text,
	"vector" jsonb NOT NULL,
	"embedding_model_id" text NOT NULL,
	"dimension" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fitness_scores" (
	"id" text PRIMARY KEY NOT NULL,
	"candidate_id" text NOT NULL,
	"total" double precision NOT NULL,
	"components" jsonb NOT NULL,
	"policy_version" text NOT NULL,
	"explanation" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generations" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"index" integer NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "lineage_edges" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"target" text NOT NULL,
	"type" text NOT NULL,
	"label" text
);
--> statement-breakpoint
CREATE TABLE "novelty_scores" (
	"id" text PRIMARY KEY NOT NULL,
	"candidate_id" text NOT NULL,
	"vector" jsonb NOT NULL,
	"embedding_model_id" text NOT NULL,
	"dimension" integer NOT NULL,
	"comparison_set" jsonb NOT NULL,
	"method" text NOT NULL,
	"score" double precision NOT NULL,
	"explanation" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "run_events" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"generation_id" text,
	"agenome_id" text,
	"candidate_id" text,
	"type" text NOT NULL,
	"sequence" integer NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text NOT NULL,
	"correlation_id" text,
	"langfuse_trace_id" text,
	"langfuse_observation_id" text,
	"payload" jsonb NOT NULL,
	"schema_version" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" text PRIMARY KEY NOT NULL,
	"seed" text NOT NULL,
	"enabled_subtypes" jsonb NOT NULL,
	"caps" jsonb NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "run_events_run_id_sequence_key" ON "run_events" USING btree ("run_id","sequence");--> statement-breakpoint
CREATE INDEX "run_events_run_id_idx" ON "run_events" USING btree ("run_id");