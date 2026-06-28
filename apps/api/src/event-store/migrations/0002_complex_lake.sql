CREATE TABLE "outer_bloom_artifacts" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"stage" text NOT NULL,
	"label" text NOT NULL,
	"summary" text NOT NULL,
	"status" text NOT NULL,
	"parent_id" text,
	"generation_index" integer,
	"score" double precision,
	"novelty" double precision,
	"judge_acceptance" double precision,
	"source_id" text,
	"agenome_id" text,
	"artifact_path" text NOT NULL,
	"sequence" integer NOT NULL,
	"body" text NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "outer_bloom_artifacts_run_id_idx" ON "outer_bloom_artifacts" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "outer_bloom_artifacts_parent_id_idx" ON "outer_bloom_artifacts" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "outer_bloom_artifacts_stage_idx" ON "outer_bloom_artifacts" USING btree ("stage");