-- Custom migration: run_events append-only enforcement (KEY SAFETY RULE #2).
-- The authoritative log is immutable — any UPDATE or DELETE of a persisted event is rejected at the
-- DB, so no projection bug, stray query, or compromised caller can rewrite history. (The per-run
-- monotonic-sequence uniqueness is the unique index from the schema; this trigger is the append-only
-- half.) Not expressible in the Drizzle schema DSL, so it lives as a hand-authored SQL migration in
-- the same ordered, idempotent chain.

CREATE OR REPLACE FUNCTION run_events_reject_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'run_events is append-only: % is not permitted on a persisted event', TG_OP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER run_events_append_only
BEFORE UPDATE OR DELETE ON run_events
FOR EACH ROW EXECUTE FUNCTION run_events_reject_mutation();
--> statement-breakpoint
-- A row-level trigger does NOT fire on TRUNCATE, so guard the log from wholesale destruction with a
-- statement-level BEFORE TRUNCATE trigger (the authoritative log is never truncated; projections are).
CREATE TRIGGER run_events_no_truncate
BEFORE TRUNCATE ON run_events
FOR EACH STATEMENT EXECUTE FUNCTION run_events_reject_mutation();
