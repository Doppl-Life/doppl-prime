CREATE TABLE "outer_bloom_hidden_nodes" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"node_id" text NOT NULL,
	"hidden_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "outer_bloom_hidden_nodes_run_id_node_id_key" ON "outer_bloom_hidden_nodes" USING btree ("run_id","node_id");--> statement-breakpoint
CREATE INDEX "outer_bloom_hidden_nodes_run_id_idx" ON "outer_bloom_hidden_nodes" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "outer_bloom_hidden_nodes_node_id_idx" ON "outer_bloom_hidden_nodes" USING btree ("node_id");
