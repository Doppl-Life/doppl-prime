-- 0002_runs_configured_at.sql
--
-- Adds `runs.configured_at` so the Phase 3 worker (P3.12) can poll
-- `runs WHERE status='configured' ORDER BY configured_at ASC LIMIT 1`
-- without a join against run_events. DEFAULT NOW() means the column
-- is populated for inserts that don't supply it; existing rows in dev
-- DBs are backfilled with NOW() at migration time.

ALTER TABLE run_events ALTER COLUMN occurred_at SET DEFAULT NOW();
--> statement-breakpoint
ALTER TABLE runs ADD COLUMN IF NOT EXISTS configured_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
