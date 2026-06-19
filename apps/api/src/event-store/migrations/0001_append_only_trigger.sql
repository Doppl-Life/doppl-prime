-- 0001_append_only_trigger.sql
--
-- Append-only enforcement for `run_events`. The application writer never
-- issues UPDATE or DELETE — this trigger is the structural pin against a
-- future migration, admin query, or stray script that does. TRUNCATE is
-- intentionally NOT blocked here (it's a DDL-tier operation; the kernel
-- never issues it; revoking the privilege is a separate hardening step).
--
-- Drizzle does not model triggers natively, so this file is HAND-AUTHORED
-- and recorded in `meta/_journal.json` manually. Do not delete on regen.

CREATE OR REPLACE FUNCTION run_events_reject_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'run_events is append-only — % rejected', TG_OP;
END;
$$;

--> statement-breakpoint

CREATE TRIGGER run_events_reject_update
BEFORE UPDATE OR DELETE ON run_events
FOR EACH ROW EXECUTE FUNCTION run_events_reject_mutation();
