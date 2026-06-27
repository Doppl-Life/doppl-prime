CREATE TABLE "outer_campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"synopsis" text NOT NULL,
	"status" text NOT NULL,
	"root_artifact_id" text NOT NULL,
	"settings" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "outer_campaigns_status_idx" ON "outer_campaigns" USING btree ("status");--> statement-breakpoint
CREATE TABLE "outer_campaign_artifacts" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"stage" text NOT NULL,
	"label" text NOT NULL,
	"summary" text NOT NULL,
	"body" text NOT NULL,
	"status" text NOT NULL,
	"parent_artifact_id" text,
	"source_run_id" text,
	"source_candidate_id" text,
	"source_sequence_through" integer,
	"score" double precision,
	"novelty" double precision,
	"judge_acceptance" double precision,
	"artifact_path" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "outer_campaign_artifacts_campaign_id_idx" ON "outer_campaign_artifacts" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "outer_campaign_artifacts_parent_id_idx" ON "outer_campaign_artifacts" USING btree ("parent_artifact_id");--> statement-breakpoint
CREATE INDEX "outer_campaign_artifacts_stage_idx" ON "outer_campaign_artifacts" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "outer_campaign_artifacts_source_run_id_idx" ON "outer_campaign_artifacts" USING btree ("source_run_id");--> statement-breakpoint
CREATE TABLE "outer_campaign_child_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"run_id" text NOT NULL,
	"stage" text NOT NULL,
	"parent_artifact_id" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "outer_campaign_child_runs_run_id_key" ON "outer_campaign_child_runs" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "outer_campaign_child_runs_campaign_id_idx" ON "outer_campaign_child_runs" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "outer_campaign_child_runs_parent_id_idx" ON "outer_campaign_child_runs" USING btree ("parent_artifact_id");--> statement-breakpoint
CREATE TABLE "outer_promotion_decisions" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"child_run_id" text NOT NULL,
	"artifact_id" text NOT NULL,
	"source_candidate_id" text,
	"reason" text NOT NULL,
	"proof" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "outer_promotion_decisions_campaign_id_idx" ON "outer_promotion_decisions" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "outer_promotion_decisions_child_run_id_idx" ON "outer_promotion_decisions" USING btree ("child_run_id");--> statement-breakpoint
CREATE INDEX "outer_promotion_decisions_artifact_id_idx" ON "outer_promotion_decisions" USING btree ("artifact_id");
